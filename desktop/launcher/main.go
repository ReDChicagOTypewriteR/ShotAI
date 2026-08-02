package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

var version = "dev"

type config struct {
	Host                   string `json:"host"`
	Port                   int    `json:"port"`
	Version                string `json:"version"`
	OllamaURL              string `json:"ollamaUrl"`
	LauncherControlPort    int    `json:"launcherControlPort"`
	AllowLanAdministration bool   `json:"allowLanAdministration"`
}

type launcher struct {
	root          string
	config        config
	ctx           context.Context
	cancel        context.CancelFunc
	mu            sync.Mutex
	phase         string
	ollamaStarted bool
	imageStarted  bool
	ollama        *exec.Cmd
	server        *exec.Cmd
	control       *http.Server
	logFiles      []*os.File
}

type statusResponse struct {
	Version        string   `json:"version"`
	Phase          string   `json:"phase"`
	WebURL         string   `json:"webUrl"`
	LANURLs        []string `json:"lanUrls"`
	OllamaStarted  bool     `json:"ollamaStarted"`
	ImageStarted   bool     `json:"imageStarted"`
	PortableModels string   `json:"portableModels"`
}

func defaultConfig() config {
	return config{
		Host:                "0.0.0.0",
		Port:                9090,
		Version:             version,
		OllamaURL:           "http://127.0.0.1:11434",
		LauncherControlPort: 19090,
	}
}

func main() {
	stop := flag.Bool("stop", false, "stop the running ShotAI launcher")
	noBrowser := flag.Bool("no-browser", false, "do not open the browser")
	elevated := flag.Bool("elevated", false, "internal elevation marker")
	flag.Parse()

	root, err := executableDirectory()
	if err != nil {
		fatalDialog("ShotAI 无法确定运行目录：" + err.Error())
		return
	}
	cfg := loadConfig(filepath.Join(root, "lan.config.json"))
	controlURL := fmt.Sprintf("http://127.0.0.1:%d", cfg.LauncherControlPort)

	if *stop {
		if err := postControl(controlURL + "/stop"); err != nil {
			fatalDialog("ShotAI 当前没有运行。")
		}
		return
	}
	if controlOnline(controlURL + "/status") {
		_ = postControl(controlURL + "/open")
		return
	}

	if runtime.GOOS == "windows" && !isAdministrator() {
		if *elevated {
			fatalDialog("ShotAI 没有获得管理员权限，无法开放局域网端口。")
			return
		}
		args := append([]string{"--elevated"}, flag.Args()...)
		if *noBrowser {
			args = append(args, "--no-browser")
		}
		if err := relaunchAsAdministrator(args); err != nil {
			fatalDialog("管理员权限请求已取消，ShotAI 没有启动。")
		}
		return
	}

	setConsoleUTF8()
	ctx, cancel := context.WithCancel(context.Background())
	app := &launcher{
		root:   root,
		config: cfg,
		ctx:    ctx,
		cancel: cancel,
		phase:  "正在启动",
	}
	if err := app.prepareLogging(); err != nil {
		fatalDialog("ShotAI 无法创建日志目录：" + err.Error())
		return
	}
	defer app.closeLogs()
	defer app.shutdown()

	log.Printf("ShotAI %s 正在启动，目录：%s", cfg.Version, root)
	if err := app.prepareDirectories(); err != nil {
		log.Printf("无法准备运行目录：%v", err)
		return
	}
	if err := app.startControlServer(); err != nil {
		log.Printf("另一个 ShotAI 可能已经运行：%v", err)
		_ = openBrowser(app.webURL())
		return
	}
	app.writePID()
	app.configureFirewall()
	app.startOllama()
	app.startImageRuntime()
	if err := app.startWebServer(); err != nil {
		log.Printf("网页服务启动失败：%v", err)
		fatalDialog("ShotAI 网页服务启动失败，请查看 logs/launcher.log。")
		return
	}

	app.setPhase("运行中")
	app.printReady()
	if !*noBrowser {
		_ = openBrowser(app.webURL())
	}

	signals := make(chan os.Signal, 2)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	go func() {
		select {
		case <-signals:
			cancel()
		case <-ctx.Done():
		}
	}()
	go app.readConsoleCommands()
	<-ctx.Done()
}

func executableDirectory() (string, error) {
	executable, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Dir(executable), nil
}

func loadConfig(path string) config {
	cfg := defaultConfig()
	data, err := os.ReadFile(path)
	if err == nil {
		if decodeErr := json.Unmarshal(data, &cfg); decodeErr != nil {
			fmt.Printf("配置文件格式有误，将使用默认配置：%v\n", decodeErr)
		}
	}
	if cfg.Port < 1 || cfg.Port > 65535 {
		cfg.Port = 9090
	}
	if cfg.LauncherControlPort < 1 || cfg.LauncherControlPort > 65535 {
		cfg.LauncherControlPort = 19090
	}
	if cfg.Version == "" {
		cfg.Version = version
	}
	if cfg.OllamaURL == "" {
		cfg.OllamaURL = "http://127.0.0.1:11434"
	}
	return cfg
}

func (app *launcher) prepareLogging() error {
	logsDirectory := filepath.Join(app.root, "logs")
	if err := os.MkdirAll(logsDirectory, 0755); err != nil {
		return err
	}
	file, err := os.OpenFile(
		filepath.Join(logsDirectory, "launcher.log"),
		os.O_CREATE|os.O_APPEND|os.O_WRONLY,
		0644,
	)
	if err != nil {
		return err
	}
	app.logFiles = append(app.logFiles, file)
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)
	log.SetOutput(io.MultiWriter(os.Stdout, file))
	return nil
}

func (app *launcher) closeLogs() {
	for _, file := range app.logFiles {
		_ = file.Close()
	}
}

func (app *launcher) prepareDirectories() error {
	for _, relative := range []string{
		filepath.Join("models", "ollama"),
		filepath.Join("models", "image"),
		filepath.Join("runtime", "ollama"),
		filepath.Join("runtime", "image"),
		"logs",
	} {
		if err := os.MkdirAll(filepath.Join(app.root, relative), 0755); err != nil {
			return err
		}
	}
	return nil
}

func (app *launcher) startControlServer() error {
	listener, err := net.Listen(
		"tcp",
		fmt.Sprintf("127.0.0.1:%d", app.config.LauncherControlPort),
	)
	if err != nil {
		return err
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/status", func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(response).Encode(app.status())
	})
	mux.HandleFunc("/open", func(response http.ResponseWriter, _ *http.Request) {
		_ = openBrowser(app.webURL())
		response.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/stop", func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			http.Error(response, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		response.WriteHeader(http.StatusAccepted)
		go func() {
			time.Sleep(100 * time.Millisecond)
			app.cancel()
		}()
	})
	app.control = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 3 * time.Second,
	}
	go func() {
		if serveErr := app.control.Serve(listener); serveErr != nil &&
			!errors.Is(serveErr, http.ErrServerClosed) {
			log.Printf("启动器控制服务已停止：%v", serveErr)
			app.cancel()
		}
	}()
	return nil
}

func (app *launcher) writePID() {
	path := filepath.Join(app.root, "runtime", "shotai-launcher.pid")
	_ = os.WriteFile(path, []byte(strconv.Itoa(os.Getpid())), 0644)
}

func (app *launcher) configureFirewall() {
	name := fmt.Sprintf("ShotAI LAN %d", app.config.Port)
	command := exec.Command(
		"netsh",
		"advfirewall", "firewall", "add", "rule",
		"name="+name,
		"dir=in", "action=allow", "protocol=TCP",
		fmt.Sprintf("localport=%d", app.config.Port),
	)
	configureHiddenProcess(command)
	if output, err := command.CombinedOutput(); err != nil {
		log.Printf("防火墙规则未自动添加：%v %s", err, strings.TrimSpace(string(output)))
	}
}

func (app *launcher) startOllama() {
	if endpointOnline(strings.TrimRight(app.config.OllamaURL, "/")+"/api/version", 2*time.Second) {
		log.Print("检测到已经运行的 Ollama，将直接使用。")
		return
	}
	executable := filepath.Join(app.root, "runtime", "ollama", "ollama.exe")
	if _, err := os.Stat(executable); err != nil {
		executable, err = exec.LookPath("ollama.exe")
		if err != nil {
			executable, err = exec.LookPath("ollama")
		}
		if err != nil {
			log.Print("没有找到 Ollama。网页仍会启动，请安装 Ollama 或复制运行组件。")
			return
		}
	}

	logsDirectory := filepath.Join(app.root, "logs")
	output, err := os.OpenFile(
		filepath.Join(logsDirectory, "ollama.log"),
		os.O_CREATE|os.O_APPEND|os.O_WRONLY,
		0644,
	)
	if err != nil {
		log.Printf("无法创建 Ollama 日志：%v", err)
		return
	}
	app.logFiles = append(app.logFiles, output)

	command := exec.Command(executable, "serve")
	command.Dir = filepath.Dir(executable)
	command.Env = append(
		os.Environ(),
		"OLLAMA_HOST=127.0.0.1:11434",
		"OLLAMA_MODELS="+filepath.Join(app.root, "models", "ollama"),
	)
	command.Stdout = output
	command.Stderr = output
	configureHiddenProcess(command)
	if err := command.Start(); err != nil {
		log.Printf("Ollama 没有启动成功：%v", err)
		return
	}
	app.ollama = command
	app.ollamaStarted = true
	log.Printf("Ollama 已启动，模型目录：%s", filepath.Join(app.root, "models", "ollama"))
	if !waitForEndpoint(strings.TrimRight(app.config.OllamaURL, "/")+"/api/version", 25*time.Second) {
		log.Print("Ollama 启动超时，稍后可在工作台重新检查。")
	}
}

func (app *launcher) startImageRuntime() {
	statusURL := "http://127.0.0.1:1234/v1/models"
	if endpointOnline(statusURL, 2*time.Second) {
		log.Print("检测到已经运行的图片服务，将直接使用。")
		return
	}
	if !fileExists(filepath.Join(app.root, "runtime", "image", "sd-server.exe")) ||
		!fileExists(filepath.Join(app.root, "start-image-runtime.ps1")) ||
		!hasImageModel(filepath.Join(app.root, "models", "image")) {
		log.Print("图片运行组件或图片模型未准备，跳过图片服务。")
		return
	}
	powershell, err := findPowerShell()
	if err != nil {
		log.Printf("无法启动图片服务：%v", err)
		return
	}
	command := exec.Command(
		powershell,
		"-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
		"-File", filepath.Join(app.root, "start-image-runtime.ps1"),
		"-ConfigPath", filepath.Join(app.root, "lan.config.json"),
	)
	command.Dir = app.root
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	configureHiddenProcess(command)
	if err := command.Run(); err != nil {
		log.Printf("图片服务尚未就绪：%v", err)
		return
	}
	app.imageStarted = endpointOnline(statusURL, 2*time.Second)
}

func (app *launcher) startWebServer() error {
	if !fileExists(filepath.Join(app.root, "server.ps1")) {
		return errors.New("没有找到 server.ps1")
	}
	if !fileExists(filepath.Join(app.root, "web", "index.html")) {
		return errors.New("没有找到 web/index.html")
	}
	powershell, err := findPowerShell()
	if err != nil {
		return err
	}
	command := exec.Command(
		powershell,
		"-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
		"-File", filepath.Join(app.root, "server.ps1"),
		"-ConfigPath", filepath.Join(app.root, "lan.config.json"),
	)
	command.Dir = app.root
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	configureHiddenProcess(command)
	if err := command.Start(); err != nil {
		return err
	}
	app.server = command
	go func() {
		err := command.Wait()
		if app.ctx.Err() == nil {
			log.Printf("网页服务已停止：%v", err)
			app.cancel()
		}
	}()
	if !waitForEndpoint(app.webURL()+"/shotai/system", 15*time.Second) {
		return errors.New("端口没有在规定时间内开始响应")
	}
	return nil
}

func (app *launcher) shutdown() {
	app.setPhase("正在停止")
	log.Print("正在停止 ShotAI，请稍候……")
	if app.control != nil {
		contextWithTimeout, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_ = app.control.Shutdown(contextWithTimeout)
		cancel()
	}
	if app.server != nil && app.server.Process != nil {
		terminateProcessTree(app.server.Process.Pid)
	}
	if app.imageStarted {
		app.stopImageRuntime()
	}
	if app.ollamaStarted && app.ollama != nil && app.ollama.Process != nil {
		terminateProcessTree(app.ollama.Process.Pid)
	}
	_ = os.Remove(filepath.Join(app.root, "runtime", "shotai-launcher.pid"))
	log.Print("ShotAI 已停止。")
}

func (app *launcher) stopImageRuntime() {
	path := filepath.Join(app.root, "runtime", "image", "image-runtime.pid")
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err == nil && pid > 0 {
		terminateProcessTree(pid)
	}
}

func (app *launcher) readConsoleCommands() {
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		switch strings.ToLower(strings.TrimSpace(scanner.Text())) {
		case "q", "quit", "exit", "退出":
			app.cancel()
			return
		case "o", "open", "打开":
			_ = openBrowser(app.webURL())
		case "s", "status", "状态":
			app.printReady()
		default:
			fmt.Println("输入 O 打开工作台，S 查看地址，Q 安全退出。")
		}
	}
}

func (app *launcher) printReady() {
	fmt.Println()
	fmt.Println("========================================")
	fmt.Printf("  ShotAI %s 已启动\n", app.config.Version)
	fmt.Printf("  本机：%s\n", app.webURL())
	for _, address := range app.lanURLs() {
		fmt.Printf("  内网：%s\n", address)
	}
	fmt.Printf("  模型：%s\n", filepath.Join(app.root, "models", "ollama"))
	fmt.Println("  输入 O 打开工作台，S 查看地址，Q 安全退出")
	fmt.Println("========================================")
	fmt.Println()
}

func (app *launcher) status() statusResponse {
	app.mu.Lock()
	defer app.mu.Unlock()
	return statusResponse{
		Version:        app.config.Version,
		Phase:          app.phase,
		WebURL:         app.webURL(),
		LANURLs:        app.lanURLs(),
		OllamaStarted:  app.ollamaStarted,
		ImageStarted:   app.imageStarted,
		PortableModels: filepath.Join(app.root, "models", "ollama"),
	}
}

func (app *launcher) setPhase(value string) {
	app.mu.Lock()
	app.phase = value
	app.mu.Unlock()
}

func (app *launcher) webURL() string {
	return fmt.Sprintf("http://127.0.0.1:%d", app.config.Port)
}

func (app *launcher) lanURLs() []string {
	addresses := []string{}
	interfaces, _ := net.Interfaces()
	for _, networkInterface := range interfaces {
		if networkInterface.Flags&net.FlagUp == 0 || networkInterface.Flags&net.FlagLoopback != 0 {
			continue
		}
		interfaceAddresses, _ := networkInterface.Addrs()
		for _, interfaceAddress := range interfaceAddresses {
			ip, _, err := net.ParseCIDR(interfaceAddress.String())
			if err != nil || ip == nil || ip.To4() == nil {
				continue
			}
			addresses = append(addresses, fmt.Sprintf("http://%s:%d", ip.String(), app.config.Port))
		}
	}
	return addresses
}

func findPowerShell() (string, error) {
	for _, candidate := range []string{"powershell.exe", "powershell"} {
		if path, err := exec.LookPath(candidate); err == nil {
			return path, nil
		}
	}
	return "", errors.New("Windows PowerShell 不可用")
}

func hasImageModel(directory string) bool {
	entries, err := os.ReadDir(directory)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		extension := strings.ToLower(filepath.Ext(entry.Name()))
		if extension == ".gguf" || extension == ".safetensors" || extension == ".sft" {
			return true
		}
	}
	return false
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func endpointOnline(endpoint string, timeout time.Duration) bool {
	client := &http.Client{Timeout: timeout}
	response, err := client.Get(endpoint)
	if err != nil {
		return false
	}
	_ = response.Body.Close()
	return true
}

func waitForEndpoint(endpoint string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if endpointOnline(endpoint, 2*time.Second) {
			return true
		}
		time.Sleep(400 * time.Millisecond)
	}
	return false
}

func controlOnline(endpoint string) bool {
	return endpointOnline(endpoint, 700*time.Millisecond)
}

func postControl(endpoint string) error {
	client := &http.Client{Timeout: 2 * time.Second}
	request, _ := http.NewRequest(http.MethodPost, endpoint, nil)
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		return fmt.Errorf("控制请求失败：%s", response.Status)
	}
	return nil
}
