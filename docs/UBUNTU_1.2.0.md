# ShotAI Ubuntu 1.2.0

适用系统：Ubuntu 22.04 LTS x86_64。推荐使用 NVIDIA CUDA 12 驱动环境；Tesla V100 服务器默认采用五人容量、两路推理和三路等待。

## 安装

1. 将 DEB 文件复制到 Ubuntu 主机。
2. 不依赖软件商店双击，直接在文件所在目录打开终端执行：

   ```bash
   sudo dpkg -i ShotAI-1.2.0-Ubuntu-22.04-x86_64-Full-Ollama-CUDA.deb
   ```

3. 从应用菜单启动 ShotAI，或执行 `shotai`。
4. 内网电脑访问 `http://10.16.232.23:9090`。

安装包内置离线 Ollama 运行组件，但不包含 Qwen3.5 或 FLUX.2 模型权重。已有系统 Ollama 可以继续运行；ShotAI 完整版会使用自己的端口和模型目录。

## 模型导入

- 选择 GGUF 后只快速检查文件头，不再先完整读取十几 GB 计算校验码。
- 点击正式导入后，ShotAI 边写入边计算 SHA-256；相同文件直接复用。
- 导入失败时查看桌面上的 `ShotAI-model-import.log`，以及安装位置或 `ShotAI-logs` 中的运行日志。

## 五人并发

默认最多接收五条活跃对话请求：两条在模型上运行，三条等待。第六条请求会提示稍后重试。建议五人使用时优先选择 Qwen3.5 9B Q4；Qwen3.5 27B 更适合质量优先、较低并发的场景。

## 图片模型

FLUX.2 Klein 9B Q4 需要主模型、Qwen3 8B 文字理解文件和 small decoder 三个文件。下载地址见 [Ubuntu 离线模型方案](./UBUNTU_OFFLINE_MODELS.md)。Ubuntu 安装包是否能直接生成图片还取决于安装包中是否包含适配 Ubuntu 22.04 与 V100 的 `sd-server` CUDA 运行组件；缺少运行组件时，ShotAI 会明确提示，不会回退为聊天模型。

## 文件校验

```text
6e2c069fc3f51c8f801bcd7dc5c85c4e44b9cc3b10f218cb0cfb22a9fb2fea27  ShotAI-1.2.0-Ubuntu-22.04-x86_64-Full-Ollama-CUDA.deb
```
