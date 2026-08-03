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
  -trimpath -ldflags="-s -w -H=windowsgui -X main.version=1.1.0-preview.3" \
  -o ShotAI.exe ./desktop/launcher
```

`rsrc_windows_amd64.syso` 内含 ShotAI 多尺寸图标，Go 会在编译时自动写入 EXE。
`windowsgui` 模式不会打开控制台窗口，运行信息统一写入 `logs`。

再次双击会重新打开工作台，不会重复启动。执行 `ShotAI.exe --stop` 可以请求
已经运行的启动器安全退出。
