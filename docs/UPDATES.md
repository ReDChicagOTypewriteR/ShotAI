# Windows 与 Ubuntu 更新进度

本页只记录从 [ShotAI v1.1.6](https://github.com/ReDChicagOTypewriteR/ShotAI/releases/tag/v1.1.6) 到当前版本的主要改进。更早的内部预览过程不再单独保留。

## 版本时间线

| 版本 | 发布状态 | 公共功能 | Windows / Ubuntu 进度 |
| --- | --- | --- | --- |
| [v1.1.6](https://github.com/ReDChicagOTypewriteR/ShotAI/releases/tag/v1.1.6) | 正式 Release | 统一模型管理、文件与资料库、图片理解及图片模型配套导入 | Windows 提供局域网桌面交付；Ubuntu 建立公共核心 |
| v1.1.7 | 开发迭代，未单独发布安装包 | 新工作台界面、主机监控和监控登录保护 | 完善 Windows 压缩交付，建立 Ubuntu 打包检查 |
| v1.1.8 | 开发迭代，未单独发布安装包 | 简化模型显示名称，补充不同厂商和任务类型的兼容识别 | 延续双平台适配，为 Ubuntu 独立运行环境做准备 |
| [v1.1.9 Ubuntu](https://github.com/ReDChicagOTypewriteR/ShotAI/releases/tag/v1.1.9-ubuntu) | Ubuntu 正式 Release | 对话排版、模型导入日志和图片指令识别 | Ubuntu 增加 DEB、独立 Ollama、CUDA 选择、主机监控和离线日志；Windows 保持独立运行层 |
| [v1.2.0](https://github.com/ReDChicagOTypewriteR/ShotAI/releases/tag/v1.2.0) | Windows / Ubuntu 正式 Release | 大模型一次读取导入、重复文件复用、五人容量控制和对话式图片操作 | Windows 完整 EXE 与 Ubuntu 完整 DEB 分平台发布 |

## v1.1.6：统一模型与文件入口

- 将对话、图片理解、资料检索和图片生成模型集中到模型管理页面；
- 增加 Excel、PDF、DOCX、Markdown、文本和图片等文件支持；
- 支持视觉主模型与 `mmproj` 配套导入；
- 相同模型文件只保存一份，并提供模型与缓存清理入口；
- 改进侧边栏、会话和长内容阅读体验。

## v1.1.7：主机监控与工作台改版

- 重构工作台视觉与交互层级；
- 新增仅主机可访问的管理员监控，可查看在线设备、CPU、内存、磁盘和 NVIDIA GPU 状态；
- 监控登录改为服务端会话，并增加失败次数限制；
- 优化 Windows 安装包压缩和运行组件拆分；
- 增加主机监控、聊天交互、Electron、内网代理和 Ubuntu 打包检查。

该版本完成了代码和版本号更新，但没有建立独立 GitHub Release，因此没有对应的正式安装包下载页。

## v1.1.8：模型名称与兼容识别

- 将较长的模型文件名转换为更易读的界面名称，同时保留实际模型标识；
- 扩展 Qwen、DeepSeek、Llama、Gemma、Mistral、Phi、Yi 等模型系列说明；
- 补充图片理解、Embedding 和图片生成模型的分类与导入边界；
- 强化模型文件、配套组件和许可证提示。

`v1.1.8` 只形成了开发迭代，没有对应 Git 标签或正式安装包；相关改进随后随 Ubuntu 1.1.9 和双平台 1.2.0 一起交付。

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
- 完整离线包内置面向 Ubuntu 22.04 x86_64、CUDA 12 和 NVIDIA V100（sm_70）的图片运行组件；
- 中止生成、关闭或删除会话时同步取消上游推理并立即释放并发槽位。

Windows 与 Ubuntu 共享聊天界面、会话、资料库、模型抽象接口和通用测试；安装器、运行组件、路径和平台服务保持独立。
