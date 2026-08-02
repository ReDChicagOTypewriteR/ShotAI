# ShotAI Windows Launcher

轻量 Windows x64 启动器，不包含网页、模型或第三方运行组件。

主要职责：

- 请求局域网服务需要的管理员权限；
- 固定 Ollama 模型目录为 `models/ollama`；
- 启动随包或系统已安装的 Ollama；
- 按需启动图片运行组件；
- 启动 ShotAI 9090 网页服务并自动打开浏览器；
- 避免重复启动，并在退出时停止由本次启动的子进程。

交叉编译：

```bash
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build \
  -trimpath -ldflags="-s -w -X main.version=1.1.0-preview" \
  -o ShotAI.exe ./desktop/launcher
```

运行时输入 `O` 打开工作台、`S` 查看内网地址、`Q` 安全退出。也可以执行
`ShotAI.exe --stop` 请求已经运行的启动器安全退出。
