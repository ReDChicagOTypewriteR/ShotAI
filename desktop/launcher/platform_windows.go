//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"unsafe"
)

const (
	createNoWindow = 0x08000000
	swShowNormal   = 1
)

var (
	shell32                = syscall.NewLazyDLL("shell32.dll")
	kernel32               = syscall.NewLazyDLL("kernel32.dll")
	procIsUserAnAdmin      = shell32.NewProc("IsUserAnAdmin")
	procShellExecuteW      = shell32.NewProc("ShellExecuteW")
	procSetConsoleOutputCP = kernel32.NewProc("SetConsoleOutputCP")
	procSetConsoleCP       = kernel32.NewProc("SetConsoleCP")
	procSetConsoleTitleW   = kernel32.NewProc("SetConsoleTitleW")
	user32                 = syscall.NewLazyDLL("user32.dll")
	procMessageBoxW        = user32.NewProc("MessageBoxW")
)

func isAdministrator() bool {
	result, _, _ := procIsUserAnAdmin.Call()
	return result != 0
}

func relaunchAsAdministrator(arguments []string) error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	verb, _ := syscall.UTF16PtrFromString("runas")
	file, _ := syscall.UTF16PtrFromString(executable)
	parameters, _ := syscall.UTF16PtrFromString(joinWindowsArguments(arguments))
	directory, _ := syscall.UTF16PtrFromString(filepathDirectory(executable))
	result, _, callErr := procShellExecuteW.Call(
		0,
		uintptr(unsafe.Pointer(verb)),
		uintptr(unsafe.Pointer(file)),
		uintptr(unsafe.Pointer(parameters)),
		uintptr(unsafe.Pointer(directory)),
		swShowNormal,
	)
	if result <= 32 {
		return fmt.Errorf("ShellExecuteW failed: %v", callErr)
	}
	return nil
}

func joinWindowsArguments(arguments []string) string {
	quoted := make([]string, 0, len(arguments))
	for _, argument := range arguments {
		if strings.ContainsAny(argument, " \t\"") {
			argument = `"` + strings.ReplaceAll(argument, `"`, `\"`) + `"`
		}
		quoted = append(quoted, argument)
	}
	return strings.Join(quoted, " ")
}

func filepathDirectory(path string) string {
	index := strings.LastIndexAny(path, `\/`)
	if index < 0 {
		return "."
	}
	return path[:index]
}

func configureHiddenProcess(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
}

func terminateProcessTree(pid int) {
	command := exec.Command("taskkill", "/PID", fmt.Sprint(pid), "/T", "/F")
	configureHiddenProcess(command)
	_ = command.Run()
}

func openBrowser(url string) error {
	command := exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", url)
	configureHiddenProcess(command)
	return command.Start()
}

func setConsoleUTF8() {
	procSetConsoleOutputCP.Call(65001)
	procSetConsoleCP.Call(65001)
	title, _ := syscall.UTF16PtrFromString("ShotAI 本地智能工作台")
	procSetConsoleTitleW.Call(uintptr(unsafe.Pointer(title)))
}

func fatalDialog(message string) {
	text, _ := syscall.UTF16PtrFromString(message)
	title, _ := syscall.UTF16PtrFromString("ShotAI")
	procMessageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(text)),
		uintptr(unsafe.Pointer(title)),
		0x10,
	)
}
