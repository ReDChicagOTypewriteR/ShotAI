# Windows 与 Ubuntu 更新进度

本页只记录从 [ShotAI v1.1.6](https://github.com/ReDChicagOTypewriteR/ShotAI/releases/tag/v1.1.6) 到当前版本的主要改进。更早的内部预览过程不再单独保留。

## 版本时间线

| 版本 | 公共功能 | Windows | Ubuntu |
| --- | --- | --- | --- |
| v1.1.6 | 统一模型管理；支持文件、资料库、图片理解和图片模型配套文件；相同模型文件可复用 | 提供局域网桌面交付与模型管理 | 建立跨平台公共核心 |
| [v1.1.9 Ubuntu](https://github.com/ReDChicagOTypewriteR/ShotAI/releases/tag/v1.1.9-ubuntu) | 对话排版、模型导入日志、图片指令识别等体验改进 | 保持独立 Windows 运行层 | 增加 Ubuntu 22.04 DEB、独立 Ollama、CUDA 选择、主机监控和离线日志 |
| [v1.2.0](https://github.com/ReDChicagOTypewriteR/ShotAI/releases/tag/v1.2.0) | 大模型一次读取导入；重复文件复用；五人容量控制；对话式图片生成与连续修改 | 完整 EXE 包含 Windows Ollama CUDA 12 和图片运行组件 | 完整 DEB 包含独立 Ollama 与 CUDA 运行库；图片生成运行器按 Linux 环境单独部署 |

## v1.1.6：统一模型与文件入口

- 将对话、图片理解、资料检索和图片生成模型集中到模型管理页面；
- 增加 Excel、PDF、DOCX、Markdown、文本和图片等文件支持；
- 支持视觉主模型与 `mmproj` 配套导入；
- 相同模型文件只保存一份，并提供模型与缓存清理入口；
- 改进侧边栏、会话和长内容阅读体验。

## v1.1.9 Ubuntu：独立离线运行

- 提供 Ubuntu 22.04 x86_64 桌面安装包和 `9090` 局域网服务；
- 使用独立 Ollama 端口与数据目录，避免与系统 Ollama 混用模型；
- 增加 CUDA 运行库选择和 GPU / CPU 实际运行状态显示；
- 修复主机监控登录与请求方式问题；
- 增加模型导入进度、失败日志、退出保护和临时文件清理；
- 调整对话布局，用户内容与模型回答分列显示。

## v1.2.0：双平台统一升级

### 公共改进

- GGUF 导入先做快速检查，正式导入时边写入边计算 SHA-256，避免提前完整扫描大文件；
- 相同内容直接复用，减少重复复制和存储占用；
- 默认最多接纳五条活跃请求：两条推理、三条等待，第六条请求明确限流；
- 主机监控显示运行数、排队数、容量和平均等待时间；
- 在普通对话中自动识别图片生成请求，并可结合上一张图片继续修改。

### Windows 进度

- 保持独立的 Windows 安装器、路径、进程管理和 `release/windows` 发布目录；
- 完整安装包内置 Windows Ollama CUDA 12 与图片运行组件；
- 安装、升级和卸载默认保留用户模型、设置与日志。

### Ubuntu 进度

- 保持独立的 DEB、systemd / 桌面运行逻辑和 `release/ubuntu` 发布目录；
- 完整安装包内置 Linux Ollama 与 CUDA 运行库；
- ShotAI 自带模型仓库与系统 Ollama 隔离；
- 提供导入失败日志和 GPU / CPU 回退状态；
- Ubuntu 图片生成继续使用与系统环境匹配的 Linux `sd-server`。

Windows 与 Ubuntu 共享聊天界面、会话、资料库、模型抽象接口和通用测试；安装器、运行组件、路径和平台服务保持独立。
