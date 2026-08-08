<p align="center">
  <a href="http://alexjoker.top/projects/ShotAI/">
    <img src="images/shotai-logo.svg" width="72" height="72" alt="ShotAI Logo" />
  </a>
</p>

<h1 align="center">ShotAI</h1>

<p align="center">
  <strong>面向可信局域网的本地 AI 工作台。</strong><br />
  一台主机运行模型，其他电脑打开浏览器即可对话、读文件、查询资料和创作图片。
</p>

<p align="center">
  <a href="http://alexjoker.top/projects/ShotAI/">访问门户 / 在线预览</a> ·
  <a href="USER_GUIDE.md">使用指南</a> ·
  <a href="LAN_DEPLOYMENT.md">内网部署</a> ·
  <a href="DEVELOPMENT_WORKFLOW.md">开发流程</a>
</p>

![ShotAI 工作台预览](images/shotai-product-preview.png)

## ShotAI 是什么

ShotAI 在 Ollama 和本地图片运行组件之上提供一个可直接使用的网页工作台。它将本地模型、文件解析、知识库、图片理解、图片创作和局域网访问放在同一个入口中。

它适合希望在自己的设备或受控内网中使用 AI 的个人和团队。ShotAI 不是公网 SaaS，也不提供账号、多租户或云端数据同步。

## 已实现能力

- 本地流式对话：停止、继续、重新生成、编辑问题后重答和会话管理；
- 图片与文件：支持 PNG、JPEG、WebP、TXT、Markdown、PDF、DOCX；
- 本地知识库：支持 Embedding 检索，异常时回退到关键词检索并展示引用来源；
- 模型管理：识别文本、视觉、Embedding 等能力，支持 GGUF 与视觉模型主文件 + mmproj 配对导入；
- 图片创作：本地文字生图、参考图修改、进度、停止、预览和 PNG 下载；
- 内网访问：主机提供网页与同源代理，其他电脑只需浏览器；
- Windows 客户端：Electron 窗口、托盘服务与 9090 内网访问。

## 开始使用

### 我只是想在 Windows 上使用

先查看 [使用指南](USER_GUIDE.md)，再按 [内网部署](LAN_DEPLOYMENT.md) 准备主机、运行组件和模型。其他电脑不需要安装 Node.js、Ollama 或模型，只需访问主机显示的局域网地址。

### 我想本地开发

~~~bash
npm install
ollama serve
npm run dev
~~~

工作台默认地址通常是 http://127.0.0.1:5173/。门户网站是独立项目：

~~~bash
cd portal
npm install
npm run dev
~~~

更多构建、验证和发布命令请看 [开发流程](DEVELOPMENT_WORKFLOW.md)。

## 常见问题

### 1. 应该选择什么模型？

下面是本项目在一台 i9-14900KF、64GB 内存、RTX 4070 Ti 主机上的实际测试配置，仅作为起点参考。模型表现会受量化方式、上下文长度、显存占用和任务并发影响。

| 用途 | 示例模型文件 |
| --- | --- |
| 日常文字对话 | Qwen3VL-8B-Instruct-F16；Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-Q4_K_M |
| RAG 知识库 | Qwen3-Embedding-0.6B-Q8_0 |
| 图片理解 | Qwen3VL-8B-Instruct-F16 与 mmproj-Qwen3VL-8B-Instruct-F16 |
| 图片创作 | Qwen3-4B-Instruct-2507-Q4_K_M；z_image_turbo-Q6_K |

图片理解通常需要主模型与 mmproj 配套文件；图片创作除了模型文件，还需要可用的图片运行组件及其扩散模型、文本编码器、VAE 等配置。请以 [内网部署](LAN_DEPLOYMENT.md) 中的图片运行时说明为准。

不要公开设备名称、设备 ID 或产品 ID；这些信息对模型选择没有帮助，也不适合提交到 GitHub。

### 2. 为什么有些模型无法导入？

ShotAI 当前以 Ollama 和 GGUF 流程为基础，Qwen 系列是测试最充分的一组模型。导入失败并不一定代表模型本身不可用，常见原因包括：

- GGUF 格式或版本不被当前运行组件支持；
- 模型文件下载不完整，或缺少必要的模型说明；
- 视觉模型缺少同版本的 mmproj 配套文件；
- 图片生成模型缺少对应的文本编码器、VAE 或运行时配置；
- 模型可以加载，但与当前 Ollama 或图片运行组件不兼容。

项目会继续增加更多开源模型和运行时的兼容性验证，但不应把尚未测试的模型视为已适配。

### 3. 去哪里获取模型？

优先从 Hugging Face 和模型官方 GitHub 获取模型，并认真确认模型授权、量化格式和配套文件。

目前仓库不提供模型权重，也没有内置国内网盘下载入口。后续如果提供国内下载通道，会在门户和发布说明中明确标注来源、版本和校验信息。

### 4. 局域网内允许多少人同时使用？

当前没有写死的用户数量上限，但也没有主机级任务队列、显存配额或并发限制。实际容量取决于主机的 GPU 显存、内存、所选模型大小、上下文长度以及是否同时生成图片。

对于 RTX 4070 Ti 这类主机，建议先从少量并发任务开始测试；多人同时处理长上下文或生成图片时，响应会变慢，甚至可能因显存不足失败。正式部署前应以自己的模型组合和真实任务压测为准。

### 5. 我的对话、文件和知识库保存在哪里？

会话、设置、附件解析结果、知识库索引和最近生成记录默认保存在当前浏览器的 IndexedDB 中，不会自动同步到其他电脑。

局域网客户端提交的提示词、图片和检索片段会发送到 ShotAI 主机进行推理。请只在可信网络中使用，不要把 9090、/ollama 或 /image 直接暴露到公网。

### 6. 后续会更新什么？

当前计划重点包括：

1. 增加更多开源模型与运行时的兼容性和适配；
2. 继续优化图片生成和参考图修改流程；
3. 改进会话记忆与资料使用体验；
4. 补充任务队列、资源提示、身份认证和更完整的内网安全能力。

以上是开发方向，不代表已经实现。

### 7. 适合哪些场景？

ShotAI 适合受控网络或离线环境中的日常办公、资料问答、图文理解和本地内容创作，尤其适合不希望将资料直接发送到公有云的团队。

使用前请自行评估模型授权、硬件资源和组织的数据安全要求。当前版本尚未提供 HTTPS、账号登录、审计日志或跨浏览器共享记录，不应直接用于公网服务。

## 更多文档

- [ShotAI 门户网站](http://alexjoker.top/projects/ShotAI/)
- [1.2 功能说明](SHOTAI_1.2_FEATURES.md)
- [第一次使用指南](USER_GUIDE.md)
- [内网部署与排错](LAN_DEPLOYMENT.md)
- [Windows Electron 客户端](ELECTRON_WINDOWS_GUIDE.md)
- [开发与更新流程](DEVELOPMENT_WORKFLOW.md)
- [项目开发随笔](BLOG_BUILDING_SHOTAI.md)
- [更新记录](../CHANGELOG.md)

## 当前边界

ShotAI 当前不包含账号登录、细分角色、HTTPS、审计日志、跨浏览器共享会话、图片任务队列或扫描 PDF OCR。模型权重和大型运行组件不会随源码仓库发布。

在添加 LICENSE 前，仓库内容不应被默认视为可自由复制、修改或再分发的软件。
