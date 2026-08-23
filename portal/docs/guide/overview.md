# 产品概览

## ShotAI 是什么

ShotAI 在 Ollama 和本地图片运行组件之上提供一个可直接使用的网页工作台。它将本地模型、文件解析、知识库、图片理解、图片创作和局域网访问放在同一个入口中。

## 已实现能力

- 本地流式对话：停止、继续、重新生成、编辑问题后重答和会话管理；
- 图片与文件：支持 PNG、JPEG、WebP、TXT、Markdown、PDF、DOCX；
- 本地知识库：支持 Embedding 检索，异常时回退到关键词检索并展示引用来源；
- 模型管理：识别文本、视觉、Embedding 等能力，支持 GGUF 与视觉模型主文件 + mmproj 配对导入；
- 图片创作：本地文字生图、参考图修改、进度、停止、预览和 PNG 下载；
- 内网访问：主机提供网页与同源代理，其他电脑只需浏览器；
- Windows 客户端：Electron 窗口、托盘服务与 9090 内网访问。

## 适合哪些场景

ShotAI 适合受控网络或离线环境中的日常办公、资料问答、图文理解和本地内容创作，尤其适合不希望将资料直接发送到公有云的团队。

使用前请自行评估模型授权、硬件资源和组织的数据安全要求。

## 当前边界

当前版本尚未提供账号登录、细分角色、HTTPS、审计日志、跨浏览器共享会话、图片任务队列或扫描 PDF OCR。模型权重和大型运行组件不会随源码仓库发布。

在添加 LICENSE 前，仓库内容不应被默认视为可自由复制、修改或再分发的软件。

## 更多文档

- [ShotAI 门户网站](https://alexjoker.top/projects/ShotAI/)
- [GitHub 仓库](https://github.com/ReDChicagOTypewriteR/ShotAI)
- [1.2 功能说明](https://github.com/ReDChicagOTypewriteR/ShotAI/blob/main/docs/SHOTAI_1.2_FEATURES.md)
- [Windows Electron 客户端](https://github.com/ReDChicagOTypewriteR/ShotAI/blob/main/docs/ELECTRON_WINDOWS_GUIDE.md)
- [开发与更新流程](https://github.com/ReDChicagOTypewriteR/ShotAI/blob/main/docs/DEVELOPMENT_WORKFLOW.md)
