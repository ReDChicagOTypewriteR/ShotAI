# ShotAI 1.1 Electron Windows 客户端

Electron 版本提供独立桌面窗口、任务栏图标和 9090 内网访问，不再运行
`server.ps1`，因此不受 Windows PowerShell 中文编码影响。

## 使用方式

1. 运行 ShotAI 安装程序并完成安装。
2. 安装程序会请求一次管理员权限并加入 9090 专用网络规则。
3. 本机直接使用桌面窗口。
4. 其他电脑访问 `http://主机内网IP:9090`。
5. 关闭窗口后程序仍在任务栏托盘运行；右键图标可以重新打开或彻底退出。

## 模型和运行组件

安装程序不包含模型。精简安装包优先使用已经运行或已经安装的 Ollama；完整
CUDA 12 安装包会同时带上 Ollama 和图片生成运行组件。

图片生成需要独立图片运行组件和图片模型。两者准备完成后，Electron 会直接启动
图片服务，不再调用 PowerShell 脚本。

数据默认保存在用户目录的 ShotAI 数据文件夹，其中包括：

```text
data/
├─ models/ollama
├─ models/image
├─ runtime/ollama
├─ runtime/image
└─ logs
```

卸载客户端时默认保留模型、设置和日志，避免误删大文件。
