<p align="center">
  <img src="docs/images/shotai-logo.svg" width="64" height="64" alt="ShotAI" />
</p>

<h1 align="center">ShotAI · 局域网本地 AI 工作台</h1>

<p align="center">
  <strong>在一台主机运行本地模型，让局域网设备通过浏览器共同使用。</strong>
</p>

<p align="center">
  <img alt="Version 1.2.0" src="https://img.shields.io/badge/version-v1.2.0-2496ed?style=flat" />
  <img alt="Windows x64" src="https://img.shields.io/badge/Windows-x64-0078d4?style=flat&amp;logo=windows11&amp;logoColor=white" />
  <img alt="Ubuntu x64" src="https://img.shields.io/badge/Ubuntu-22.04%20x64-e95420?style=flat&amp;logo=ubuntu&amp;logoColor=white" />
  <img alt="Ollama" src="https://img.shields.io/badge/Ollama-supported-111111?style=flat&amp;logo=ollama&amp;logoColor=white" />
</p>

<p align="center">
  <a href="https://github.com/ReDChicagOTypewriteR/ShotAI/releases/latest">下载最新版本</a> ·
  <a href="docs/INSTALLATION.md">安装部署</a> ·
  <a href="docs/SUPPORTED_MODELS.md">支持的模型</a> ·
  <a href="docs/UPDATES.md">版本进度</a> ·
  <a href="docs/FAQ.md">常见问答</a>
</p>

<p align="center">
  <a href="http://alexjoker.top/projects/ShotAI/">
    <img src="docs/images/readme-hero.svg" alt="ShotAI — 本地 AI，为整个局域网服务" />
  </a>
</p>

![ShotAI 工作台预览](docs/images/shotai-product-preview.png)

## 项目简介

ShotAI 将本地大模型、文件问答、资料库、图片理解、图片创作和主机监控集中到一个桌面应用中。管理员在 Windows 或 Ubuntu 主机上安装并准备模型后，局域网内的其他使用者只需打开浏览器，无需分别安装模型运行环境。

ShotAI 负责界面、模型管理、任务路由、文件处理和局域网共享；Ollama 与本地图片运行组件负责实际推理。模型权重不会随安装包提供。

![ShotAI 局域网运行方式](docs/images/readme-network.svg)

## 主要能力

| 能力 | 说明 |
| --- | --- |
| 本地对话 | 流式回答、停止、重答、编辑问题和多会话管理 |
| 文件与资料库 | 支持常用文档、表格和本地资料检索 |
| 图片理解 | 使用视觉模型分析图片、截图和文档页面 |
| 图片生成与修改 | 在对话中直接描述生成要求，并可继续修改上一张图片 |
| 模型管理 | 导入、识别、复用和清理 GGUF 及图片模型配套文件 |
| 局域网共享 | 主机提供统一的 `9090` 入口，其他设备通过浏览器使用 |
| 主机监控 | 查看在线数量、任务队列、CPU、内存、磁盘和 GPU 状态 |

## 1.2.0 下载

| 平台 | 安装包 |
| --- | --- |
| Windows 10/11 x86_64 | [`ShotAI-1.2.0-Windows-x64-Full-CUDA12-Setup.exe`](https://github.com/ReDChicagOTypewriteR/ShotAI/releases/download/v1.2.0/ShotAI-1.2.0-Windows-x64-Full-CUDA12-Setup.exe) |
| Ubuntu 22.04 LTS x86_64 | [`ShotAI-1.2.0-Ubuntu-22.04-x86_64-Full-Ollama-CUDA.deb`](https://github.com/ReDChicagOTypewriteR/ShotAI/releases/download/v1.2.0/ShotAI-1.2.0-Ubuntu-22.04-x86_64-Full-Ollama-CUDA.deb) |

两个完整安装包均包含 ShotAI 和对应平台的 Ollama 运行组件，不包含模型权重。Windows 完整版包含图片运行组件；Ubuntu 完整版包含面向 Ubuntu 22.04 x86_64、CUDA 12 和 NVIDIA V100（sm_70）构建的图片运行组件。

安装方法、离线部署、数据目录和日志位置见[安装与部署指南](docs/INSTALLATION.md)。

## 模型兼容

ShotAI 通过运行组件支持多个开放模型厂商，不绑定单一模型系列。具体兼容范围取决于模型文件格式、Ollama 或图片运行组件版本以及设备资源。

- 对话模型：Qwen、DeepSeek、Llama、Gemma、Mistral、Phi、Yi 等；
- 图片理解：Qwen-VL、Llama Vision、MiniCPM-V、LLaVA 等兼容版本；
- 资料检索：Qwen Embedding、BGE、Nomic Embed 等；
- 图片生成：FLUX、Stable Diffusion、SDXL、SD3 和兼容微调模型。

详见[支持的模型与厂商](docs/SUPPORTED_MODELS.md)。

## 版本与文档

- [从 v1.1.6 至今的 Windows / Ubuntu 更新进度](docs/UPDATES.md)
- [常见问题与排查](docs/FAQ.md)
- [安装与部署指南](docs/INSTALLATION.md)
- [支持的模型与厂商](docs/SUPPORTED_MODELS.md)
- [GitHub Releases](https://github.com/ReDChicagOTypewriteR/ShotAI/releases)

ShotAI 适合可信局域网环境。请勿将 `9090`、Ollama 或图片运行组件端口直接暴露到公网。项目许可见 [LICENSE](LICENSE)，模型及第三方运行组件分别遵循各自许可证。
