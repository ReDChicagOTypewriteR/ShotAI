# ShotAI 1.2.0 · Ubuntu 22.04 完整离线版

本版本面向 Ubuntu 22.04 LTS x86_64，可在完全离线环境运行 ShotAI、Ollama
文字/视觉模型、资料库、文件问答、局域网共享和主机监控。已针对 NVIDIA Tesla
V100 与 CUDA 12 路径进行适配。

## 下载

- [DEB 安装包](https://github.com/ReDChicagOTypewriteR/ShotAI/releases/download/v1.2.0/ShotAI-1.2.0-Ubuntu-22.04-x86_64-Full-Ollama-CUDA.deb)

安装包包含 ShotAI、Ollama v0.32.14，以及 CUDA 12/13、CPU 和 Vulkan 运行库；
不包含模型权重、NVIDIA 驱动或图片生成用的 Linux `sd-server`。

## 离线安装

推荐使用 DEB。若双击后进入压缩包或没有反应，请打开安装包所在目录的终端：

```bash
sudo dpkg -i ShotAI-1.2.0-Ubuntu-22.04-x86_64-Full-Ollama-CUDA.deb
shotai
```

1.2.0 正式发布提供 DEB，避免完全离线环境因为缺少 FUSE 而出现 AppImage 双击无反应。

## 模型与主机上原有的 Ollama

1.2.0 完整版不连接主机上已经运行的 `127.0.0.1:11434`。ShotAI 会在
`11435–11454` 中选择空闲端口，并固定使用以下独立模型目录：

```text
~/.config/ShotAI/data/models/ollama/
```

因此，主机原有 Ollama 不会污染 ShotAI 的模型列表。已有 Ollama 模型可以在退出
ShotAI 后整体复制 `blobs` 与 `manifests`，也可以在“模型管理”中重新导入 GGUF。
模型权重不会随安装包提供。

## Tesla V100 与 GPU 验证

目标机仍需提前安装能正常识别 V100 的 NVIDIA 驱动。启动前先执行：

```bash
nvidia-smi
```

Ubuntu 完整版会优先选择 `cuda_v12`。完成一次对话后，在 ShotAI 主机监控中同时
确认“GPU 推理”、非零显存占用和 GPU 卸载层数；只看到 CUDA 运行库名称并不能证明
模型没有回退到 CPU。

## 局域网访问

ShotAI 默认监听 `0.0.0.0:9090`：

```text
本机：http://127.0.0.1:9090
内网：http://主机IPv4地址:9090
```

只应在可信局域网开放 `9090`，不要向其他电脑开放 Ollama 或图片运行组件端口。

## 日志与导入失败排查

- DEB：`/opt/ShotAI/logs/`；
- 目录不可写时：Ubuntu 桌面的 `ShotAI-logs/`；
- 模型导入失败：Ubuntu 桌面的 `ShotAI-model-import.log`。

1.2.0 导入聊天模型时不再预先完整扫描大文件，而是在一次写入过程中同步完成
SHA-256 校验。导入期间不要退出；若进程意外中断，下次启动时会清理残留临时文件。

默认最多接收五位活跃用户：两路同时推理、三路等待，第六路请求会提示稍后重试。
当前聊天模型基线为 Qwen3.5，不把 DeepSeek-R1 当作正在使用的默认模型。

## SHA-256

```text
6e2c069fc3f51c8f801bcd7dc5c85c4e44b9cc3b10f218cb0cfb22a9fb2fea27  ShotAI-1.2.0-Ubuntu-22.04-x86_64-Full-Ollama-CUDA.deb
```

完整安装、模型迁移与 Ubuntu 22.04 图片生成限制见
[Ubuntu 客户端说明](docs/UBUNTU_GUIDE.md)和
[V100 离线模型方案](docs/UBUNTU_OFFLINE_MODELS.md)。
