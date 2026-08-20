<p align="center">
  <img src="docs/images/shotai-logo.svg" width="64" height="64" alt="ShotAI" />
</p>

<h1 align="center">🛰️ ShotAI · 局域网本地 AI 工作台</h1>

<p align="center">
  <strong>一台主机运行模型，其他电脑打开浏览器即可使用。</strong>
</p>

<p align="center">
  <img alt="Build verified" src="https://img.shields.io/badge/build-verified-2ea44f?style=flat&amp;logo=githubactions&amp;logoColor=white" />
  <img alt="Version 1.1.7" src="https://img.shields.io/badge/version-v1.1.7-2496ed?style=flat" />
  <img alt="Vue 3.5.40" src="https://img.shields.io/badge/Vue-3.5.40-42b883?style=flat&amp;logo=vuedotjs&amp;logoColor=white" />
  <img alt="Electron 43.2.0" src="https://img.shields.io/badge/Electron-43.2.0-47848f?style=flat&amp;logo=electron&amp;logoColor=white" />
  <img alt="TypeScript 5.9.3" src="https://img.shields.io/badge/TypeScript-5.9.3-3178c6?style=flat&amp;logo=typescript&amp;logoColor=white" />
  <img alt="Ollama supported" src="https://img.shields.io/badge/Ollama-supported-111111?style=flat&amp;logo=ollama&amp;logoColor=white" />
  <img alt="Host monitor" src="https://img.shields.io/badge/Host_Monitor-local_only-16a34a?style=flat&amp;logo=grafana&amp;logoColor=white" />
  <img alt="Windows x64" src="https://img.shields.io/badge/Windows-x64-0078d4?style=flat&amp;logo=windows11&amp;logoColor=white" />
  <img alt="Ubuntu x64" src="https://img.shields.io/badge/Ubuntu-22.04%20x64-e95420?style=flat&amp;logo=ubuntu&amp;logoColor=white" />
  <img alt="Documentation included" src="https://img.shields.io/badge/docs-included-8b5cf6?style=flat&amp;logo=readthedocs&amp;logoColor=white" />
</p>

<p align="center">
  <a href="https://github.com/ReDChicagOTypewriteR/ShotAI"><img alt="GitHub Repository" src="https://img.shields.io/badge/GitHub-Repository-24292f?style=flat&amp;logo=github&amp;logoColor=white" /></a>
  <a href="https://github.com/ReDChicagOTypewriteR/ShotAI/issues"><img alt="GitHub Issues" src="https://img.shields.io/badge/GitHub-Issues-24292f?style=flat&amp;logo=github&amp;logoColor=white" /></a>
  <a href="https://github.com/ReDChicagOTypewriteR/ShotAI/stargazers"><img alt="Star ShotAI" src="https://img.shields.io/badge/Star-ShotAI-f59e0b?style=flat&amp;logo=githubsponsors&amp;logoColor=white" /></a>
  <a href="CHANGELOG.md"><img alt="Changelog" src="https://img.shields.io/badge/Project-Changelog-475569?style=flat&amp;logo=gitbook&amp;logoColor=white" /></a>
  <a href="docs/README.md"><img alt="Documentation" src="https://img.shields.io/badge/Project-Documentation-7c3aed?style=flat&amp;logo=readthedocs&amp;logoColor=white" /></a>
</p>

<br />

<p align="center">
  <a href="http://alexjoker.top/projects/ShotAI/">
    <img src="docs/images/readme-hero.svg" alt="ShotAI — 本地 AI，为整个局域网服务" />
  </a>
</p>

<p align="center">
  <a href="http://alexjoker.top/projects/ShotAI/">产品介绍</a> ·
  <a href="docs/USER_GUIDE.md">使用指南</a> ·
  <a href="docs/LAN_DEPLOYMENT.md">内网部署</a> ·
  <a href="docs/README.md">全部文档</a>
</p>

<br />

<p align="center"><sub>THE WORKBENCH / 工作台</sub></p>

![ShotAI 工作台预览](docs/images/shotai-product-preview.png)

<p align="center"><sub>统一的对话、文件、模型与图片创作入口</sub></p>

<p><sub>01 / RELEASE HIGHLIGHTS</sub></p>

## 1.1.7 · 更像一套完整的本地 AI 平台

| 全新工作台 | 主机监控 | 更轻的安装方式 |
| --- | --- | --- |
| Apple × SpaceX 视觉语言，加入毛玻璃、圆角、柔和阴影与自然过渡 | 仅运行 ShotAI 的主机可进入，查看在线设备、CPU、内存、磁盘与 NVIDIA 显卡状态 | Windows 聊天标准版约 806MB；图片生成组件可按需添加；仍提供完整离线版 |

主机监控带独立管理员登录、IP 隐藏和登录失败限制；局域网普通使用者无法访问监控接口。默认登录信息保存在 `lan.config.json`，正式部署前请修改管理员密码。

<p><sub>02 / OVERVIEW</sub></p>

## 一台主机，所有人直接使用

ShotAI 把本地模型、文件、资料库和图片能力放进同一个网页。管理员只需在主机准备运行组件和模型，局域网内的其他电脑打开浏览器即可使用，无需分别安装 Node.js、Ollama 或模型。

![ShotAI 局域网运行方式](docs/images/readme-network.svg)

<p><sub>03 / CAPABILITIES</sub></p>

## 已经可以做什么

![ShotAI 核心能力](docs/images/readme-capabilities.svg)

| 能力 | 使用体验 | 当前支持 |
| --- | --- | --- |
| AI 对话 | 流式回答，可停止、重答、继续和编辑问题 | 本地 Ollama 模型 |
| 文件阅读 | 添加文件后直接提问 | TXT、Markdown、PDF、DOCX、Excel |
| 图片理解 | 上传图片并让模型分析 | PNG、JPEG、WebP 与视觉模型 |
| 本地资料库 | 从导入资料中查找答案并显示来源 | Embedding 或关键词检索 |
| 图片创作 | 在对话框内生成图片、参考图修改 | 本地图片模型与运行组件 |
| 模型管理 | 一个入口完成识别、导入、查看和清理 | GGUF、mmproj 与图片配套文件 |
| 主机监控 | 查看在线数量、隐藏 IP 和主机性能 | 仅限主机、管理员登录、实时轻量图表 |
| 内网共享 | 主机运行，其他电脑用浏览器访问 | Windows / Ubuntu Electron 与 9090 服务 |

<p><sub>04 / GET STARTED</sub></p>

## 三步开始

### Windows / Ubuntu 使用者

1. 安装并启动 ShotAI；
2. 在“模型管理”中添加已经下载好的模型；
3. 将界面显示的 `http://主机IP:9090` 发给局域网使用者。

模型不会随源码仓库提供。第一次部署请先阅读 [使用指南](docs/USER_GUIDE.md) 和 [内网部署说明](docs/LAN_DEPLOYMENT.md)。

### Windows 安装包怎么选

| 版本 | 适合谁 | 内置内容 |
| --- | --- | --- |
| 聊天标准版 | 主要使用对话、文件、资料库和图片识别 | Electron、Ollama、CUDA 12，不含模型，约 806MB |
| 图片组件包 | 已安装标准版，后来需要本地生成与修改图片 | stable-diffusion.cpp CUDA 12 运行组件，不含模型 |
| 完整离线版 | 希望一次带齐聊天与图片运行环境 | 上述全部运行组件，不含模型，体积约 1.6GB |

安装包没有放进 Git 仓库，请从项目的 [GitHub Releases](https://github.com/ReDChicagOTypewriteR/ShotAI/releases) 下载发布版本。

### 本地开发

```bash
npm install
ollama serve
npm run dev
```

工作台通常运行在 `http://127.0.0.1:5173/`。构建与检查命令见 [开发流程](docs/DEVELOPMENT_WORKFLOW.md)。

<p><sub>05 / MODEL ROUTING</sub></p>

## 模型如何分工

ShotAI 会根据任务使用对应能力，不要求使用者频繁手动切换。

| 任务 | 需要准备 |
| --- | --- |
| 普通对话 | 一个聊天模型 |
| 分析图片 | 支持图片理解的主模型；部分 GGUF 还需要同版本 `mmproj` |
| 查找资料 | 可选 Embedding 模型；未配置时自动使用关键词查找 |
| 生成或修改图片 | 图片主模型及其文本编码器、VAE 和本地图片运行组件 |

相同的模型文件只保存一份，可以被多个功能共同使用。兼容范围和导入排错见 [内网部署说明](docs/LAN_DEPLOYMENT.md)。

<p><sub>06 / DOCUMENTATION</sub></p>

## 文档

| 我想了解 | 从这里开始 |
| --- | --- |
| 第一次安装和使用 | [第一次使用指南](docs/USER_GUIDE.md) |
| 在单位局域网中运行 | [内网部署与排错](docs/LAN_DEPLOYMENT.md) |
| Windows 客户端与打包 | [Electron 客户端说明](docs/ELECTRON_WINDOWS_GUIDE.md) |
| Ubuntu 客户端与打包 | [Ubuntu 客户端说明](docs/UBUNTU_GUIDE.md) · [V100 离线模型方案](docs/UBUNTU_OFFLINE_MODELS.md) |
| 当前功能与边界 | [当前功能说明](docs/CURRENT_FEATURES.md) |
| 开发、检查和发布 | [开发流程](docs/DEVELOPMENT_WORKFLOW.md) |
| 查看全部说明 | [文档中心](docs/README.md) |

<details>
<summary><strong>使用前需要知道的边界</strong></summary>

- 普通工作台当前没有账号登录、HTTPS、审计日志或跨浏览器共享记录；主机监控使用独立的本机管理员登录；
- 会话、设置和资料索引默认保存在当前浏览器；
- 多人同时运行大模型或生成图片时，速度与稳定性取决于主机配置；
- 扫描 PDF 暂不支持文字识别，旧版 `.doc` 需要先转换为 `.docx`；
- 请只在可信局域网使用，不要把 `9090` 或模型接口直接开放到公网。

</details>

## 项目说明

ShotAI 负责模型管理、交互体验、文件处理和局域网共享；Ollama 与本地图片组件负责实际计算。项目不会把模型权重、大型运行组件或历史安装包提交到源码仓库。

完整变更见 [CHANGELOG.md](CHANGELOG.md)。仓库当前尚未提供项目许可证，在添加 `LICENSE` 前，请勿默认复制、修改或重新分发项目内容。
