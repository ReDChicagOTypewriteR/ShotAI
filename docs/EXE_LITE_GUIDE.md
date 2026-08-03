# ShotAI 1.1 EXE 精简预览版

这是 ShotAI 的轻量 Windows x64 启动包。它提供真正的 `ShotAI.exe`，不使用
Electron，也不包含模型权重和大型第三方运行组件。

## 第一次使用

1. 解压整个目录，不要只复制 `ShotAI.exe`。
2. 双击 `ShotAI.exe`，在 Windows 询问时允许管理员权限。
3. 启动器会开放 9090 端口、启动可用的本地服务并打开浏览器。
4. 其他电脑访问 `http://主机内网IP:9090`。

双击后不会出现黑色控制台窗口。再次双击 `ShotAI.exe` 不会重复启动，只会重新
打开浏览器。需要停止后台服务时，执行 `ShotAI.exe --stop` 可以安全退出；后续
版本会继续增加任务栏退出入口。

## 模型与运行组件

精简包不包含任何模型。通过网页安装的 Ollama 模型会固定保存在
`models/ollama`，不会散落到用户目录。

本机已经安装 Ollama 时，启动器会直接使用。若要完全免安装，把官方 Windows
免安装运行组件复制到 `runtime/ollama`，目录中应包含：

```text
runtime/ollama/
├─ ollama.exe
└─ lib/
```

图片生成是可选功能。把 stable-diffusion.cpp Windows CUDA 运行组件复制到
`runtime/image`，再通过网页选择图片模型即可。普通聊天、图片理解、文档和
我的资料不依赖这个可选组件。

## 本地目录

```text
ShotAI-1.1.0-EXE-Lite/
├─ ShotAI.exe
├─ web/
├─ models/
│  ├─ ollama/
│  └─ image/
├─ runtime/
│  ├─ ollama/
│  └─ image/
└─ logs/
```

如启动失败，查看 `logs/launcher.log`、`logs/server.log`、`logs/ollama.log` 和
图片运行日志。新版会在启动前检查 9090 是否已被其他程序占用。

## 当前预览版边界

- 当前不会显示控制台窗口；后续可继续加入系统托盘和可视化退出入口。
- 精简包优先保证体积，干净 Windows 主机需要另行放入 Ollama 运行组件。
- 本版本在 macOS 上完成 Windows x64 交叉编译和结构检查，仍需在 Windows
  真机完成 UAC、防火墙、启动和退出验收。
