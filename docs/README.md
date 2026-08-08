# ShotAI 文档中心

这里集中保存 ShotAI 的使用、部署、打包和开发说明。第一次使用建议依次阅读“使用指南”和“内网部署”。

## 开始使用

| 文档 | 适合谁 | 主要内容 |
| --- | --- | --- |
| [第一次使用指南](USER_GUIDE.md) | 普通使用者 | 启动、添加模型、对话、文件和图片 |
| [内网部署与排错](LAN_DEPLOYMENT.md) | 主机管理员 | 9090 访问、局域网配置和常见问题 |
| [Electron 客户端说明](ELECTRON_WINDOWS_GUIDE.md) | Windows 使用者 | 安装、数据目录、托盘和卸载 |

## 功能与方案

| 文档 | 主要内容 |
| --- | --- |
| [当前功能说明](CURRENT_FEATURES.md) | 当前能力、使用流程和功能边界 |
| [产品架构](PRODUCT_ARCHITECTURE.md) | 工作台、模型服务和内网访问之间的关系 |
| [图片创作方案](IMAGE_GENERATION_PLAN.md) | 图片生成、参考图修改与运行组件 |

## 开发与打包

| 文档 | 主要内容 |
| --- | --- |
| [开发流程](DEVELOPMENT_WORKFLOW.md) | 本地开发、检查、构建和发布 |
| [Windows 精简版](EXE_LITE_GUIDE.md) | 不携带大型组件的启动包 |
| [Windows 对话包](EXE_CHAT_READY_GUIDE.md) | 包含 Ollama 运行组件的版本 |
| [Windows 图片组件](EXE_IMAGE_RUNTIME_GUIDE.md) | 独立图片运行组件说明 |

## 快速入口

- [返回 GitHub 首页](../README.md)
- [查看更新记录](../CHANGELOG.md)
- [访问产品介绍](http://alexjoker.top/projects/ShotAI/)

> 当前版本面向可信局域网。不要将 `9090`、`/ollama` 或 `/image` 直接暴露到公网。
