# ShotAI 多平台外部推广方案

> 基于 2026-08-13 工作区实际源码、文档、截图、配置与 Git 历史整理。项目版本以根目录 `package.json` 的 `1.1.6` 为准。文案中的仓库地址统一使用：`https://github.com/ReDChicagOTypewriteR/ShotAI`。

## 1. 项目分析

### 产品定位

ShotAI 是一个面向可信局域网的本地 AI 工作台：由一台 Windows 主机运行模型和服务，局域网内其他电脑通过浏览器使用对话、文件阅读、资料检索、图片理解与图片创作能力。

它解决的不是“再做一个 AI 聊天页面”，而是以下更具体的问题：

- 单位、工作室或家庭中有多台电脑，但不希望每台都重复安装运行环境和模型。
- 工作资料不适合发送到外部云端，希望在本机或可信内网内处理。
- 使用者不熟悉 Ollama、GGUF、Embedding、视觉模型或图片运行组件，需要更接近日常软件的操作方式。
- 对话、文件、资料库、视觉和图片生成分散在不同工具中，维护和使用成本高。

### 核心功能核验

已在源码中确认的能力：

1. **本地流式对话**：支持停止、重新回答、编辑问题、继续生成、复制和 Markdown 格式化。
2. **文件阅读**：支持 TXT、Markdown、PDF、DOCX、Excel 与 CSV 等可提取文本的文件；单个资料文件上限为 20 MB。
3. **图片理解**：上传 PNG、JPEG、WebP 后自动寻找视觉模型，且不改变当前普通聊天模型。
4. **本地资料库**：按约 900 字符切块，支持 Embedding 向量检索；没有 Embedding 模型时退化为关键词检索，并显示引用来源。
5. **图片生成与修改**：通过本地图片运行组件生成图片，也支持一张参考图的图生图修改；图片生成与对话模型分开路由。
6. **统一模型管理**：识别和管理聊天、视觉、Embedding 与图片模型；支持 GGUF 文件校验、视觉主文件与 `mmproj` 配套导入，以及相同模型文件复用。
7. **局域网共享**：主机通过 9090 提供网页、Ollama 同源代理和图片服务代理；其他电脑只需浏览器。
8. **主机权限边界**：默认仅主机可添加、删除和重载模型，内网客户端负责使用。
9. **Windows 桌面体验**：Electron 客户端包含独立窗口、托盘与 9090 服务；安装包不包含模型权重。
10. **浏览器本地持久化**：对话、资料索引、设置和最近图片保存在当前浏览器的 IndexedDB 中。

### UI / UX 分析

- **视觉风格**：黑白高对比、克制的工业感与编辑台风格；背景使用轻微网格和几何圆弧，界面不是常见的蓝紫渐变 AI 模板。
- **主色调**：默认深色，以近黑背景、白色文字、灰色边框为主；同时提供明亮主题。
- **布局**：左侧对话与功能导航，中间消息区，底部固定输入框，顶部显示当前助手和设置入口。
- **核心页面**：对话工作台、模型管理、我的资料、运行检查、设置、图片创作流程。
- **操作语言**：大量界面文案主动隐藏底层术语，例如将复杂运行状态转成“还缺少什么”“主机管理模式”“内网使用模式”。
- **最适合展示的页面**：工作台首页、模型管理能力分组、资料引用结果、图片理解结果、图片创作进度、第二台电脑访问同一工作台。

### 技术架构

```text
局域网浏览器
    │
    ├── ShotAI Web（Vue 3 + TypeScript + Element Plus）
    │       ├── 对话与文件处理
    │       ├── IndexedDB 本地状态
    │       └── 模型/资料/图片工作流
    │
    └── 9090 同源服务（Node.js 或 Electron 主进程）
            ├── 静态网页
            ├── /ollama/ → 主机 Ollama
            ├── /image/ → 本地图片运行组件
            └── 管理权限与运行状态接口
```

实际技术栈：Vue 3、TypeScript、Vite、Element Plus、vue-element-plus-x、Electron、Node.js HTTP、IndexedDB、Ollama、stable-diffusion.cpp、PDF.js、Mammoth、SheetJS、DOMPurify、Marked。仓库另有 Go 编写的 Windows 精简启动器。

### 使用场景

- 办公室内用一台带独立显卡的 Windows 主机服务多台普通办公电脑。
- 断网或网络受限环境中进行本地问答、文件总结和资料检索。
- 家庭或工作室共享一套本地模型，而不在每台设备重复部署。
- 管理员统一准备模型，普通使用者通过浏览器完成日常任务。
- 使用本地视觉模型分析图片，或使用本地图片模型生成和修改图片。

### 项目成熟度与证据

判断：**Beta**。

原因：

- 已有明确版本、Windows Electron 客户端、局域网服务、完整文档、功能检查脚本和可用 UI，不属于原型。
- 关键路径已有自动化检查脚本，包括聊天、RAG、视觉、附件、图片生成、模型管理、局域网代理和 Windows 包结构。
- 仍缺少账号、HTTPS、审计日志、跨浏览器同步、并发任务队列和显存配额；只建议在可信局域网使用。
- 仓库没有 `.github/workflows`，因此 README 的 `build-verified` 徽章不能被理解为公开 CI 状态。
- README 末尾仍写着“尚未提供许可证”，但仓库实际已有 MIT `LICENSE`，发布前应修正文档冲突。

### 当前限制

- Windows x64 是当前主要桌面交付方向；Linux 有启动脚本，但桌面产品体验与验证重点明显偏 Windows。
- 模型权重不随仓库或安装包提供，管理员需要自行准备并确认模型授权。
- 当前没有账号、HTTPS、审计日志和跨浏览器共享记录。
- 对话、资料索引、设置和图片历史默认属于当前浏览器，不会在内网用户间同步。
- 多人高负载使用时没有任务队列、显存配额或用户级资源隔离，速度取决于主机硬件与模型大小。
- 扫描 PDF 没有 OCR；旧 `.doc` 需要先转换为 `.docx`。
- 单个资料文件限制为 20 MB；单文档最多切分 2000 个片段。
- 不能把 9090 或模型服务直接作为安全的公网服务使用。
- 没有 Docker、云部署、SaaS 账号体系、MCP、Redis 或 MySQL，推广中不得出现这些词作为现有能力。
- 在线地址目前是产品介绍页，不应宣传成可直接操作模型的在线 Demo；在线 Demo 状态需要确认。

## 2. 项目画像

### 一句话定位

为需要在可信内网使用 AI 的小团队与本地模型使用者，把一台 Windows 主机上的模型变成多台电脑可直接通过浏览器使用的对话、资料与图片工作台。

### 项目核心价值

- **P0：降低多设备使用本地 AI 的部署成本**——模型只在主机准备一次，其他电脑通过浏览器使用。
- **P0：让资料和推理留在本机或可信局域网**——适合对外部云服务有顾虑的工作资料场景。
- **P1：把分散能力放进统一工作流**——对话、文件、资料库、图片理解、图片生成和模型管理使用同一入口。
- **P1：降低非技术用户的操作门槛**——模型自动分工、主机与客户端权限分离、错误提示尽量使用日常语言。
- **P2：兼顾可维护性**——统一模型管理、GGUF 检查、文件复用、运行检查和多种 Windows 交付方式。

### 核心用户

1. 有 Windows GPU 主机、希望在办公室或工作室共享本地模型的技术负责人。
2. 需要断网、内网或本地资料处理的小团队。
3. 已经使用 Ollama，但希望获得更完整工作台体验的本地 AI 用户。
4. 希望研究本地 AI 产品工程、内网代理、模型路由和桌面交付的开发者。
5. 愿意参与 Windows、局域网、模型兼容和 UX 改进的开源贡献者。

不应主动扩大到：需要公网多租户 SaaS、企业权限审计、移动原生客户端或无需准备硬件和模型的普通消费者。

### 差异化

- **从“一台电脑本地聊天”转向“一台主机服务整个可信局域网”**，部署单位是团队环境而不是单个浏览器标签页。
- **模型按任务自动分工**：普通对话、视觉、资料检索和图片生成可以使用不同模型，不要求每次手动切换。
- **产品层主动隐藏运行时复杂度**：默认区分主机管理与内网使用，提供模型校验、运行检查和可理解的错误提示。
- **本地资料库有可用降级路径**：没有 Embedding 模型时仍可使用关键词检索，而不是完全不可用。
- **同时关注源码运行和 Windows 交付**：不仅有前端页面，还有 Electron 主进程、局域网代理、安装配置和发布包检查。

## 3. 核心卖点

最多使用以下三个，不要在同一标题中塞入全部功能：

1. **一台主机运行模型，局域网其他电脑打开浏览器就能用。**
2. **对话、文件、资料引用、图片理解和图片创作集中在同一个本地工作台。**
3. **模型自动分工，普通使用者不需要反复理解和切换聊天、视觉、Embedding 与图片模型。**

传播时应优先展示“第二台电脑打开主机地址并完成任务”，这是最容易被陌生用户一眼理解、也最区别于普通聊天 UI 的证据。

## 4. 目标用户

| 用户 | 需求 | 最适合的内容 |
|---|---|---|
| 本地 AI 使用者 | 更完整的 Ollama 使用界面 | 工作台 Demo、模型自动分工 |
| 小团队技术负责人 | 一台主机服务多台电脑 | 局域网拓扑、双设备实录 |
| 独立开发者 | 产品与工程实现参考 | 为什么做、架构取舍、踩坑 |
| 前端 / Node.js 开发者 | 流式 UI、文件处理、代理实现 | 源码结构和关键流程 |
| Windows 工具开发者 | Electron、托盘、安装和本地服务 | Windows 交付链路 |
| 开源贡献者 | 明确边界和可参与问题 | Roadmap、Issue、兼容测试 |

## 5. 推荐传播方向

1. **Self-hosted 型**：这是最清晰的主方向，但必须强调“可信局域网”，不能包装成公网服务器。
2. **本地 AI 工具型**：展示真实输入、模型路由、文件处理、引用和图片输出。
3. **开发者效率型**：管理员部署一次，多个浏览器客户端使用，减少重复配置。
4. **工程实践型**：适合深入讲同源代理、流式响应、GGUF 校验、IndexedDB、旧浏览器兼容与 Electron 交付。
5. **视觉 / UI 型**：黑白工作台与门户视觉有辨识度，适合 B 站和小红书，但视觉必须服务于实际 Demo。
6. **个人开发 / 开源型**：可以讲产品边界和迭代过程，但不要把“一个人做了很多”当成唯一卖点。

## 6. 推荐平台排序

| 平台 | 推荐程度 | 原因 | 核心传播角度 |
|---|---:|---|---|
| B站 | ★★★★★ | 双设备、文件、视觉和图片生成都适合动态演示 | 一台主机如何服务多台电脑 |
| 掘金 | ★★★★★ | 技术栈和工程取舍有足够深度 | 从 Ollama 接口到内网工作台的产品工程 |
| V2EX | ★★★★★ | 本地 AI、独立开发和克制反馈氛围匹配 | 为什么做、现在能做什么、还缺什么 |
| 知乎 | ★★★★☆ | “为什么每台电脑都部署模型”是清晰的问题切口 | 本地 AI 从单机工具走向局域网服务 |
| CSDN | ★★★★☆ | 安装、9090、Ollama 代理和排错有搜索价值 | Windows 局域网部署教程 |
| 小红书 | ★★★★☆ | 黑白 UI 和双设备 Before/After 有视觉传播力 | 在断网办公环境做一个本地 AI 工作台 |
| 开源中国 | ★★★★☆ | 项目功能、MIT、部署和开源边界明确 | 开源项目发布与版本说明 |
| 博客园 | ★★★★☆ | 适合完整记录架构与关键代码 | Vue + Electron + Node 的局域网 AI 架构 |
| Hacker News | ★★★☆☆ | 技术问题成立，但英文文档和跨平台准备不足 | Show HN：LAN-first local AI workbench |
| Reddit | ★★★☆☆ | r/LocalLLaMA 和 r/selfhosted 用户匹配，但自推广规则严格 | 技术实现、可复现 Demo、诚实限制 |
| DEV / Hashnode | ★★★☆☆ | 可发布英文工程文章，承担海外搜索入口 | Designing a LAN-first local AI workbench |
| Product Hunt | ★★☆☆☆ | 有 Logo、门户和产品 UI，但缺少清晰英文落地页、低门槛下载与在线 Demo | 暂不首发，先补齐 Launch 资产 |
| 雪球 / 聚宽 / BigQuant | 不建议 | 项目不属于金融、量化或投资研究工具 | 不发布 |

## 7. 每个平台的传播策略

### 掘金

- **角度**：不是介绍功能清单，而是解释如何把 Ollama、本地文件和图片运行组件组织成局域网产品。
- **读者获得**：同源代理、模型路由、浏览器持久化和桌面交付的工程经验。
- **避免**：只晒 UI、泛泛谈隐私、把检查脚本写成完整测试体系。

### V2EX

- **角度**：从“每台电脑都装一套本地 AI 很浪费”出发，公开当前实现和不足。
- **读者获得**：快速判断是否适合自己的家庭、工作室或小团队。
- **避免**：长篇技术教程、请求 Star、回避安全与并发限制。

### B站

- **角度**：用两台电脑证明“一台主机、多端浏览器”，再展示文件、视觉和资料引用。
- **读者获得**：五分钟内看懂项目能不能解决自己的问题。
- **避免**：长时间口播架构、只录静态首页、用剪辑掩盖等待时间。

### 知乎

- **角度**：回答“本地大模型为什么不应该在每台电脑重复部署”。
- **读者获得**：部署边界、产品设计取舍和适用场景判断。
- **避免**：以“我的项目开源了”开头，或者把本地等同于绝对安全。

### CSDN

- **角度**：写成可搜索的 Windows + Ollama 局域网部署与 403/404 排错教程。
- **读者获得**：可以照着完成开发环境或局域网服务启动。
- **避免**：把安装包和源码开发步骤混在一起；使用“一键部署”。

### 博客园

- **角度**：完整拆解系统边界、请求路径、浏览器状态和模型能力分工。
- **读者获得**：可迁移到其他本地 AI 项目的架构经验。
- **避免**：重复 CSDN 的安装说明。

### 开源中国

- **角度**：客观发布项目、版本、技术栈、MIT 协议、运行方式和已知边界。
- **读者获得**：快速判断是否值得下载、试用或参与。
- **避免**：营销词和未经验证的性能数据。

### 小红书

- **角度**：断网办公场景 + 黑白 UI + 两台电脑共享主机，走视觉叙事。
- **读者获得**：先理解场景，再看到产品操作。
- **避免**：九张图全是文字；标题写“AI 神器”；隐藏硬件和模型准备成本。

### Reddit

- **r/LocalLLaMA**：适合模型路由、GGUF、Ollama 与本地图片运行组件；自推广是条件允许，账号应先有真实社区参与，正文要公开作者身份与限制。
- **r/selfhosted**：概念匹配，但规则更严格。项目必须可下载、可自托管、有文档，并说明功能与用户收益；新项目还可能只能进入指定 Megathread。发布前重新检查当日规则。
- **不建议 r/opensource 首发**：内容容易只剩项目链接，反馈质量不如前两个垂直社区。

### Hacker News

- **角度**：把本地模型从单机进程变成 LAN-first workbench 时遇到的安全边界和 UX 取舍。
- **前提**：准备英文 README、可访问的英文落地页、30 秒无声 GIF。
- **避免**：功能堆叠、形容词、要求 upvote。

### DEV / Hashnode

- **角度**：写一篇独立英文工程文章，不是中文稿翻译。
- **重点**：same-origin proxy、task-based model routing、browser-local state、host/client permissions、limitations。

### Product Hunt

当前不建议正式 Launch。虽然已有 Logo、Landing Page、产品 UI 和清晰定位，但普通海外用户仍缺少英文文档、明确下载入口、硬件要求、安装演示和低门槛试用。可先建立 Coming Soon 页面，但不要把它作为本轮前三平台。

## 8. 每个平台的完整文案

### 8.1 掘金

**推荐程度：★★★★★**

**传播角度：** 把“本地模型能聊天”变成“一台主机可供整个局域网使用”的完整产品工程。

**标题候选：**

1. 我把本地大模型从“单机聊天”做成了局域网 AI 工作台
2. Vue 3 + Electron + Ollama：一台主机如何服务多台浏览器
3. 不只是套一层聊天 UI：本地 AI 工作台的模型路由、资料检索与内网代理

**推荐标题：** Vue 3 + Electron + Ollama：一台主机如何服务多台浏览器

**副标题：** 从同源代理、任务模型路由到浏览器本地资料库，记录 ShotAI 1.1.6 的工程实现与边界。

**正文：**

很多本地 AI 工具解决的是“如何在这台电脑上调用模型”。但当使用场景变成办公室、工作室或家庭，多台电脑分别安装运行时、下载模型和处理配置，会很快变得重复而难维护。

我做 ShotAI 时，把问题换成了：能不能只在一台 Windows 主机上准备模型，其他电脑打开浏览器就使用？

最终的结构并不复杂：Vue 3 工作台负责交互、文件解析和浏览器本地状态；9090 服务提供网页，并把 `/ollama/` 和 `/image/` 分别转发到主机上的 Ollama 与图片运行组件。这样浏览器只访问一个同源地址，主机上的推理服务也不需要直接暴露到局域网。

```text
浏览器 → ShotAI:9090
              ├─ /ollama/ → 127.0.0.1:11434
              └─ /image/  → 127.0.0.1:1234
```

这层代理解决了三个实际问题。

第一，内网浏览器不需要知道模型服务端口。第二，流式回答可以原样转发。第三，可以在 ShotAI 这一层区分主机和内网客户端：默认只有主机能导入、删除和重载模型，其他电脑只负责使用。

项目没有给所有任务绑定同一个模型。普通对话使用聊天模型；上传图片时自动寻找视觉模型；资料检索优先使用 Embedding，没配置时退回关键词检索；图片生成和参考图修改交给独立的本地图片组件。用户做的是“读这张图”或“查这份资料”，而不是先研究该切到哪个模型。

资料库也刻意做了降级设计。TXT、Markdown、PDF、DOCX 和 Excel 等文件会在浏览器内提取文本并切块；配置 Embedding 模型后走向量相似度，没有时仍能按中英文关键词检索。回答下方会显示命中的文件和片段来源。这里的目标不是替代复杂知识库平台，而是让第一次部署时少一个硬依赖。

对话、资料索引、设置和最近生成图片保存在当前浏览器的 IndexedDB。这个选择符合局域网轻量使用，但也带来明确边界：不同电脑之间不会同步记录，清理浏览器数据也会清除本地状态。

Windows 交付是另一块工作。ShotAI 目前提供 Electron 客户端，主进程直接承担 9090 服务，并处理窗口、托盘和本地运行组件。模型权重不会打进安装包，避免仓库和安装包被特定模型绑定。源码中还保留了 Node 局域网服务与 Go 精简启动器，用于不同交付方式。

目前我认为它处于 Beta，而不是“生产级平台”。它已经能完成对话、文件阅读、资料引用、图片理解、图片生成、模型管理和多浏览器访问，也有针对这些路径的检查脚本；但还没有账号、HTTPS、审计日志、跨浏览器同步、并发任务队列和显存配额，因此只建议放在可信局域网。

如果你也在做本地 AI 产品，我最想交流两个问题：

1. 小团队共享 GPU 主机时，任务队列应该优先按用户、公平性还是任务类型设计？
2. 在不引入完整账号系统的前提下，怎样保持“内网即用”和基础访问控制之间的平衡？

**推荐截图位置：**

1. 第一段后：工作台全景图。
2. 代理架构段后：局域网拓扑图。
3. 模型路由段后：模型管理能力分组截图。
4. 资料库段后：回答引用来源截图。
5. 结尾前：主机与第二台电脑同时使用的照片或录屏帧。

**推荐代码示例：** 展示 9090 同源路由的精简伪代码，以及“Embedding 不可用时回退关键词”的控制流程；不要贴 6000 行单文件组件。

**CTA：** 完整源码、部署文档和当前限制见文末 GitHub；更欢迎针对局域网并发、Windows 兼容和模型导入提交可复现问题。

**项目链接位置：** 架构介绍后放一次纯文本链接，文末再放“源码 / 使用指南 / 内网部署”三个链接。

**Hashtags：** `#Vue.js` `#Electron` `#Ollama` `#本地大模型` `#开源`

**注意事项：** 发布前修正 README 的许可证冲突；不要声称有 GitHub Actions CI。

### 8.2 V2EX

**推荐程度：★★★★★**

**传播角度：** 讲清动机、现状和不足，邀请真实环境反馈。

**标题候选：**

1. 做了一个局域网本地 AI 工作台，一台主机跑模型，其他电脑用浏览器
2. [分享创造] ShotAI：把 Ollama、文件问答和图片能力放进一个内网工作台
3. 想减少办公室里重复部署本地模型，于是做了 ShotAI

**推荐标题：** [分享创造] ShotAI：一台主机跑模型，局域网其他电脑用浏览器

**副标题：** 当前是 Beta，只建议可信内网使用。

**正文：**

我遇到的问题是：本地模型在一台电脑上跑起来不难，但办公室或工作室有多台电脑时，每台都安装 Ollama、准备模型和维护配置很重复。

所以做了 ShotAI。现在的用法是，在一台 Windows 主机上运行 ShotAI 和模型，其他电脑访问 `http://主机IP:9090`。客户端不需要安装 Node.js、Ollama 或模型。

当前已经能做：

- 本地流式对话，停止、重答、编辑问题和继续生成；
- 上传图片后自动使用视觉模型；
- 读取 TXT、Markdown、PDF、DOCX、Excel；
- 建本地资料夹，使用 Embedding 或关键词检索并显示来源；
- 本地图片生成和一张参考图修改；
- 在同一个模型管理入口处理聊天、视觉、资料和图片模型；
- 默认只有主机能管理模型，内网电脑只使用。

我不想把它描述成企业平台。它现在没有账号、HTTPS、审计日志、跨浏览器同步和并发任务队列；多人同时跑大模型时，体验直接取决于主机硬件。扫描 PDF 也还不能 OCR。当前更适合可信局域网、小团队和愿意自己准备模型的人。

技术上是 Vue 3 + TypeScript + Electron。9090 同时提供网页，并代理主机上的 Ollama 和图片服务。对话、资料索引和设置保存在各自浏览器的 IndexedDB，所以不会自动同步到另一台电脑。

源码：`https://github.com/ReDChicagOTypewriteR/ShotAI`

如果有人愿意测试，我更想收到这几类反馈：

1. 两到五台电脑同时使用时，排队和提示是否清楚；
2. 不同 GGUF / `mmproj` 组合的导入兼容问题；
3. Windows 防火墙、端口和安装后的启动问题；
4. 非技术使用者是否能看懂模型管理和错误提示。

**CTA：** 如果这个使用场景和你的环境接近，欢迎直接试用后发可复现问题；不需要为了反馈而 Star。

**推荐素材：** 一张工作台全景图 + 一段主机与第二台电脑同时使用的 20 秒 GIF。

**Hashtags：** V2EX 不建议堆标签；节点优先选择 `分享创造`，其次根据版规考虑 `程序员`。

**注意事项：** 明确作者身份和 Beta 状态；首帖不要放超过两个外链。

### 8.3 B站

**推荐程度：★★★★★**

**传播角度：** 用两台真实设备展示“主机运行，浏览器使用”。

**视频标题：** 我把一台电脑上的本地 AI，分享给了整个局域网｜ShotAI 开源演示

**副标题：** 对话、文件、资料引用、看图和图片创作，全部在本地工作台完成。

**视频简介：**

ShotAI 是一个局域网本地 AI 工作台。一台 Windows 主机负责运行模型，其他电脑打开浏览器即可使用，不需要分别安装运行环境和模型。

本视频用真实操作展示：第二台电脑接入、流式对话、文件问答、资料引用、图片理解、图片创作和模型管理，也会说明当前没有账号、HTTPS、跨浏览器同步与并发任务队列等限制。

项目源码：`https://github.com/ReDChicagOTypewriteR/ShotAI`

**开场 10 秒 Hook：**

> 左边这台 Windows 主机在跑模型，右边这台电脑什么都没装。现在我只输入主机地址——它已经可以读文件、看图片，也能调用本地模型回答问题。

**5 分钟脚本与分镜：**

| 时间 | 画面 | 旁白 |
|---|---|---|
| 0:00-0:10 | 两台设备同框，客户端输入 9090 地址并打开工作台 | 使用 Hook，不放 Logo 动画 |
| 0:10-0:35 | 主机任务管理 / ShotAI 窗口与客户端浏览器并列 | 模型只在主机运行，客户端只访问网页 |
| 0:35-1:05 | 客户端发起问题，展示流式回答、停止与重答 | 先证明基础体验，不介绍技术栈 |
| 1:05-1:40 | 上传 PDF 或 Excel，追问具体内容 | 文件在浏览器提取文本，扫描 PDF 暂不支持 OCR |
| 1:40-2:15 | 打开“我的资料”，导入资料后提问，展开引用来源 | 有 Embedding 时向量检索，没有时关键词检索 |
| 2:15-2:45 | 上传图片，提问识别内容；顶部模型保持不变 | ShotAI 自动选择视觉模型，不改变普通对话模型 |
| 2:45-3:20 | 输入图片提示词，展示真实等待、进度和结果 | 图片组件与聊天模型分开运行，不加速剪辑掩盖时间 |
| 3:20-3:55 | 打开模型管理，展示能力分组和主机管理模式 | 模型由管理员准备，内网电脑默认不能删除或导入 |
| 3:55-4:25 | 简单动画展示 9090、Ollama、图片服务关系 | 说明同源代理，不直接开放模型服务端口 |
| 4:25-4:50 | 黑底白字列出边界 | 无账号、HTTPS、审计、跨浏览器同步和任务队列 |
| 4:50-5:00 | 回到两台设备同框，出现 GitHub 地址 | 邀请测试局域网兼容与并发体验 |

**屏幕录制内容：** 必须录真实首字等待、资料引用展开、视觉模型自动路由、图片生成进度、主机/客户端权限差异。

**需要展示的页面：** 工作台首页、回答消息、我的资料、模型管理、运行检查、图片创作、设置中的主机管理模式。

**封面文字：** `一台主机，全网可用`；小字 `本地 AI 工作台`。画面用两台设备 + ShotAI 黑白界面，不放功能词云。

**评论区置顶文案：**

> 源码与文档：`https://github.com/ReDChicagOTypewriteR/ShotAI`。当前版本更适合可信局域网和愿意自行准备模型的用户，不建议直接暴露到公网。如果你实际测试了多设备、GGUF 导入或 Windows 安装，欢迎带环境信息反馈。

**CTA：** 简介中查看源码和部署说明；评论区优先征集真实硬件与多设备测试结果。

**推荐素材：** 双设备实录、局域网拓扑动效、资料引用特写、图片生成过程、限制清单。

**Hashtags：** `#本地大模型` `#Ollama` `#开源项目` `#AI工具` `#独立开发`

**注意事项：** 不用“完全离线”概括所有安装过程；模型准备阶段可能需要下载，运行时是否断网取决于部署是否完整。

### 8.4 知乎

**推荐程度：★★★★☆**

**问题 / 标题候选：**

1. 本地大模型有必要在办公室每台电脑上都部署一遍吗？
2. 如何让局域网里的多台电脑共用一套本地大模型？
3. 把 Ollama 从单机工具做成局域网服务，真正难的是什么？

**推荐标题：** 如何让局域网里的多台电脑共用一套本地大模型？

**副标题：** 重点不是开放一个端口，而是补齐权限、模型路由、文件处理和使用边界。

**完整回答：**

如果只是让第二台电脑请求模型接口，配置一个监听地址就能开始。但“接口能通”和“普通同事可以使用”之间，还隔着一整层产品问题。

首先是重复部署。办公室可能只有一台电脑有合适的 GPU，其他电脑更适合通过浏览器使用。如果每台都安装运行时、下载模型并维护版本，不仅浪费存储，也让排错变成多份工作。

其次是暴露边界。直接把 Ollama 端口开放给局域网，浏览器会遇到来源、代理和流式响应问题，也缺少“谁能删模型、谁只能使用”的产品边界。我的处理方式是让 ShotAI 在 9090 提供网页，并同源代理主机的模型和图片服务。默认只有主机能管理模型，内网客户端只发起任务。

第三是任务并不只需要一个模型。日常聊天、图片理解、资料检索和图片生成往往是不同能力。ShotAI 根据用户动作选择模型：上传图片时寻找视觉模型，资料查找优先使用 Embedding，没有时回退关键词，图片创作则走独立的本地组件。对使用者来说，入口仍然是同一个输入框。

第四是本地数据到底在哪里。ShotAI 当前把对话、资料索引、设置和最近图片保存在各自浏览器的 IndexedDB。好处是轻量，也不会默认把每个客户端的记录集中到服务器；代价是换浏览器不会自动同步，清理浏览器数据会丢失本地记录。

第五是不能把“在局域网运行”直接等同于“安全”。当前项目没有账号、HTTPS 和审计日志，因此只适合可信内网，也不应该把 9090 或模型接口直接放到公网。多人同时使用时还没有任务队列与显存配额，高负载体验取决于主机配置。

基于这些取舍，我做了 ShotAI：一台 Windows 主机运行模型，其他电脑通过浏览器完成对话、文件阅读、资料引用、图片理解与图片创作。它现在是 Beta，更像一个已经能完整测试的局域网工作台，而不是企业多租户平台。

这件事给我的最大经验是：本地 AI 产品的难点不只在“把模型跑起来”，而在于谁来维护、其他人怎么使用、任务如何分工、失败时能不能看懂，以及系统明确不负责什么。

源码和当前边界：`https://github.com/ReDChicagOTypewriteR/ShotAI`

**CTA：** 如果你也在设计小团队共享 GPU 的方案，可以查看完整实现，并对任务队列和轻量访问控制提出建议。

**推荐素材：** 首图放局域网拓扑；中段放模型管理分组；结尾放“支持 / 不支持”对照图。

**Hashtags：** `本地大模型` `Ollama` `局域网` `开源软件` `软件工程`

**注意事项：** 不讨论企业合规结论；“资料留在本地”应限定为项目默认数据路径和正确部署方式。

### 8.5 CSDN

**推荐程度：★★★★☆**

**标题：** Vue 3 + Electron + Ollama 局域网部署：让多台电脑共用本地大模型（含 403/404 排错）

**副标题：** 以 ShotAI 1.1.6 为例，完成开发启动、9090 内网访问和同源代理检查。

**正文：**

#### 一、适用场景

本文适合有一台 Windows 模型主机，希望局域网其他电脑通过浏览器访问的情况。ShotAI 当前没有账号、HTTPS 和审计日志，只建议部署在可信局域网，不要直接开放到公网。

#### 二、源码开发环境

准备 Node.js、npm 和 Ollama 后执行：

```bash
git clone https://github.com/ReDChicagOTypewriteR/ShotAI.git
cd ShotAI
npm install
ollama serve
npm run dev
```

开发工作台通常位于 `http://127.0.0.1:5173/`。如果没有模型，可以先按 Ollama 的方式准备一个兼容模型；ShotAI 仓库不附带模型权重。

#### 三、启动局域网服务

构建并运行 9090 服务：

```bash
npm run build
npm run serve:lan
```

默认配置位于 `lan.config.json`，关键字段如下：

```json
{
  "host": "0.0.0.0",
  "port": 9090,
  "allowLanAdministration": false,
  "ollamaUrl": "http://127.0.0.1:11434"
}
```

主机先打开 `http://127.0.0.1:9090/healthz` 检查状态，再让第二台电脑访问 `http://主机内网IP:9090`。

#### 四、为什么需要同源代理

ShotAI 不是让浏览器直接访问 11434，而是通过 9090 的 `/ollama/` 转发。代理会清理浏览器携带的 `Origin` 和 `Referer`，保留流式响应，并避免把 Ollama 直接暴露给内网浏览器。

图片能力使用 `/image/` 转发到主机回环地址上的图片运行组件。客户端仍然只访问 9090。

#### 五、其他电脑打不开

依次检查：

1. 主机的 9090 服务是否仍在运行；
2. 客户端访问的是主机内网 IP，不是 `127.0.0.1`；
3. Windows 防火墙是否允许当前端口；
4. 9090 是否被其他程序占用；
5. `lan.config.json` 修改端口后，访问地址和防火墙规则是否同步修改。

#### 六、出现 403 或 404

- 静态资源 404：升级时要替换整个 `web` 目录，不要只替换单个 JS 文件；浏览器可用 `Ctrl+F5` 刷新。
- `/ollama/api/chat` 403：检查反向代理是否清除了 `Origin` 和 `Referer`，以及是否允许 POST。
- 页面能开但不能聊天：静态服务器没有自动提供 Ollama 转发，需要使用 ShotAI 自带服务或参考仓库的 Nginx 配置。

#### 七、文件支持与限制

资料库支持 TXT、Markdown、PDF、DOCX、Excel 和 CSV 等格式，单个文件不能超过 20 MB。扫描 PDF 暂无 OCR，旧 `.doc` 需转换为 `.docx`。对话、资料索引和设置保存在当前浏览器，不会自动同步到另一台电脑。

#### 八、验证建议

在两台电脑上依次验证：纯文本流式回答、图片理解、PDF 或 Excel 阅读、资料引用、同时提问、图片生成。多人高负载时没有内置任务队列，应记录主机显存、内存和等待体验。

项目源码与完整部署说明：`https://github.com/ReDChicagOTypewriteR/ShotAI`

**CTA：** 查看仓库中的 `docs/LAN_DEPLOYMENT.md` 获取完整代理与 Windows 排错步骤。

**推荐素材：** 目录结构图、`healthz` 返回截图、两台电脑访问图、403 原因流程图。

**Hashtags：** `#Vue` `#Electron` `#Ollama` `#局域网部署` `#本地大模型`

**注意事项：** 发布前实际运行文中命令；不要把 Windows 安装版步骤与源码开发步骤混写。

### 8.6 博客园

**推荐程度：★★★★☆**

**标题：** 从单机 Ollama 到局域网 AI 工作台：ShotAI 的架构边界与工程取舍

**副标题：** 前端文件处理、模型能力路由、同源代理、浏览器状态与 Windows 交付的完整拆解。

**正文：**

ShotAI 的起点不是“为 Ollama 做一个更好看的页面”，而是“如何让一台模型主机服务可信局域网中的多台普通电脑”。这决定了系统需要同时处理五层问题：浏览器交互、文件与资料、模型能力、内网代理、Windows 交付。

前端使用 Vue 3 与 TypeScript。对话页负责流式消息、停止与重答；PDF.js、Mammoth 和 SheetJS 在浏览器中按需解析 PDF、DOCX 与表格；Marked 负责 Markdown，DOMPurify 负责输出清理。资料会切成带重叠的片段，存在 Embedding 模型时计算向量相似度，否则使用中英文词元和双字组合做关键词匹配。

状态没有集中写入服务端数据库，而是使用 IndexedDB 分别保存工作区、资料库和最近图片。这减少了初始部署组件，也让不同客户端天然隔离；缺点是记录不会跨浏览器同步。这个选择适合当前的轻量可信内网定位，但不适合需要组织知识统一管理的企业场景。

模型层按任务而不是按页面组织。对话、视觉、Embedding、Ollama 图片模型和本地图片组件形成不同 provider。上传图片会自动寻找视觉模型，资料检索会选择 Embedding 或关键词模式，图片生成不会改变当前聊天模型。统一模型管理页再把底层文件按“对话 / 资料 / 图片”展示给管理员。

服务层把网页和代理放在同一个 9090 地址。`/ollama/` 指向回环地址上的 Ollama，`/image/` 指向图片运行组件。代理清理外部浏览器的来源头，并保留长时间流式请求。管理型接口默认只允许主机访问，因此客户端不需要直接接触模型服务，也不能默认删除主机模型。

Windows 交付采用 Electron 主进程承载窗口、托盘和 9090 服务。安装包不携带模型权重；源码还包含 Node 版局域网服务、Nginx 配置和 Go 精简启动器。仓库中的检查脚本覆盖对话、资料、视觉、附件、图片、模型导入、代理与发布包结构，但当前没有公开 GitHub Actions 工作流，因此更准确的说法是“仓库包含自动检查脚本”，不是“CI 已覆盖所有路径”。

项目的安全边界必须单独说明：它没有账号、HTTPS 和审计日志，只建议用于可信局域网；也没有多人任务队列、显存配额和跨浏览器同步。扫描 PDF 没有 OCR，旧 DOC 需要转换，资料文件还有 20 MB 上限。

这套架构的价值不在于组件新颖，而在于把一个可调用的本地模型服务变成了有明确使用者、权限、失败提示和交付方式的工作台。后续真正值得做的不是继续堆入口，而是并发调度、轻量身份、备份迁移和更清晰的运行诊断。

源码：`https://github.com/ReDChicagOTypewriteR/ShotAI`

**CTA：** 阅读源码时建议按 `src/services`、`scripts/serve-lan.mjs`、`desktop/electron/main.cjs` 的顺序理解三层边界。

**推荐素材：** 架构图、请求路径时序图、IndexedDB 数据边界图、模型路由状态图。

**Hashtags：** 博客园不依赖标签；分类建议使用 `.NET 之外的前端/架构/AI 工程` 中最接近的现有分类。

**注意事项：** 不贴大段 `App.vue`；用小型流程代码说明核心设计。

### 8.7 开源中国

**推荐程度：★★★★☆**

**标题：** ShotAI 1.1.6：面向可信局域网的本地 AI 工作台

**副标题：** 一台 Windows 主机运行模型，其他电脑通过浏览器使用对话、资料与图片能力。

**正文：**

ShotAI 是一个 MIT 许可的本地与局域网 AI 工作台。项目面向有模型主机的小团队、工作室和本地 AI 使用者，由主机提供网页与推理代理，局域网其他电脑通过浏览器访问。

当前功能包括：

- 基于本地 Ollama 模型的流式对话；
- PNG、JPEG、WebP 图片理解；
- TXT、Markdown、PDF、DOCX、Excel 与 CSV 等文件读取；
- 使用 Embedding 或关键词检索的本地资料库，并显示引用来源；
- 基于本地图片运行组件的图片生成与参考图修改；
- 聊天、视觉、资料和图片模型的统一管理；
- Windows Electron 客户端与 9090 局域网服务；
- 默认区分主机管理模式与内网使用模式。

主要技术栈为 Vue 3、TypeScript、Vite、Element Plus、Electron、Node.js、IndexedDB 与 Ollama。图片能力可连接本地 stable-diffusion.cpp 运行组件。

开发启动：

```bash
npm install
ollama serve
npm run dev
```

局域网构建与运行：

```bash
npm run build
npm run serve:lan
```

当前版本为 Beta。项目没有账号、HTTPS、审计日志、跨浏览器同步、任务队列和显存配额，只建议部署在可信局域网。模型权重不随仓库提供，使用者需要自行准备并遵守相应模型许可。扫描 PDF 暂无 OCR，旧 `.doc` 需要转换为 `.docx`。

源码与文档：`https://github.com/ReDChicagOTypewriteR/ShotAI`

**CTA：** 查看源码、当前功能说明与内网部署文档；兼容性问题请附系统、浏览器、模型和复现步骤。

**推荐素材：** 项目 Logo、工作台截图、网络拓扑图、能力总览图。

**Hashtags：** `开源` `Vue` `Electron` `Ollama` `本地AI`

**注意事项：** 发布前将 README 中“尚无许可证”修正为 MIT；不要展示不存在的 CI 状态。

### 8.8 小红书

**推荐程度：★★★★☆**

**标题：** 我给断网办公室做了一个黑白本地 AI 工作台

**副标题：** 一台电脑跑模型，其他电脑打开浏览器继续工作。

**9 张图片规划：**

1. **封面**：两台电脑同框，文字“一台主机，全网可用”。
2. **问题**：Before 图，三台电脑分别安装模型和环境，用红线标出重复配置。
3. **方案**：After 图，一台主机连到多台浏览器，标注“模型只准备一次”。
4. **主界面**：ShotAI 黑白工作台全景，只留三个标注：对话、文件、模型。
5. **文件任务**：上传 PDF / Excel 后提问的前后画面。
6. **资料引用**：回答下方展开参考文件，强调“能看到答案来自哪里”。
7. **看图与创作**：左半图片理解，右半本地图片生成结果。
8. **管理员 / 使用者**：主机可管理模型，内网电脑默认只使用。
9. **诚实边界**：无账号、无 HTTPS、记录不跨浏览器同步、需要自己准备模型；底部放 GitHub。

**正文：**

我一直觉得，本地 AI 最麻烦的不是把模型跑起来，而是第二台、第三台电脑怎么办。

如果每台电脑都装运行环境、下载模型、重复排错，最后最懂工具的人会一直变成“现场运维”。所以我做了 ShotAI：让一台 Windows 主机负责模型，局域网里的其他电脑只打开浏览器。

现在同一个工作台里可以聊天、读 PDF / Word / Excel、整理自己的资料、上传图片让视觉模型分析，也可以调用本地图片组件生成和修改图片。不同任务会自动寻找对应模型，不需要每次先研究该切哪个。

界面刻意做成黑白、克制的工作台，不想让“科技感”盖过真正的任务。管理员和普通使用者也分开：默认只有主机能动模型，其他电脑负责用。

它目前还是 Beta，不是企业系统：没有账号、HTTPS、审计、跨浏览器同步和多人任务队列，只适合可信局域网；模型也需要自己准备。把这些边界写出来，比把它叫“AI 神器”更重要。

项目已经开源：`https://github.com/ReDChicagOTypewriteR/ShotAI`

**CTA：** 想看完整操作可以先看主页视频；真正部署过本地模型的人，欢迎告诉我你最常遇到的多设备问题。

**推荐素材：** 使用真实电脑拍摄，不只放 UI 导出图；加入 1 张生成等待过程，避免只展示结果。

**Hashtags：** `#独立开发` `#开源项目` `#本地大模型` `#AI工具` `#程序员日常` `#产品设计`

**注意事项：** 不使用“离线神器”“隐私绝对安全”“零门槛”等词；GitHub 长链接可放评论或主页。

### 8.9 Reddit

**推荐程度：★★★☆☆**

#### r/LocalLLaMA

**为什么适合：** 用户熟悉 Ollama、GGUF、视觉模型和本地推理，更愿意讨论模型路由与运行时边界。

**是否允许 Self-promotion：** 条件允许。近期版规执行强调账号需要有真实社区参与，不能只发布自己的项目。发布前检查 Rule 4，并在正文中明确作者身份、项目状态与非商业 / 商业关系。

**英文标题：** I built a LAN-first workbench for sharing one Ollama host across multiple browsers

**英文正文：**

I have one Windows machine capable of running local models, but several lower-powered computers on the same trusted LAN. Installing runtimes and keeping model files in sync on every machine felt like the wrong boundary, so I built ShotAI.

ShotAI serves a Vue-based workbench on port 9090 and proxies Ollama and a local image runtime through the same origin. Other computers only need a browser. The host manages models; LAN clients are read-only by default for model administration.

The UI routes tasks by capability rather than forcing users to switch models manually:

- regular chat → chat model;
- uploaded image → available vision model;
- local document retrieval → embedding model, with keyword fallback;
- image generation/editing → a separate local image runtime.

It currently supports streaming chat, TXT/Markdown/PDF/DOCX/spreadsheet extraction, local collections with cited chunks, image understanding, local image generation, GGUF validation, and paired vision GGUF + mmproj imports.

The project is Beta. There is no authentication, HTTPS, audit log, cross-browser history sync, GPU quota, or multi-user job queue. It is intended for a trusted LAN, not direct Internet exposure. Model weights are not included.

I am the project author. The code is MIT-licensed: `https://github.com/ReDChicagOTypewriteR/ShotAI`

I would especially value feedback on task scheduling for two to five concurrent LAN users and on GGUF/mmproj compatibility.

**Demo：** 30 秒无声 GIF：第二台电脑打开 9090 → 发起流式对话 → 上传图片后自动使用视觉模型 → 展开资料引用。技术细节放评论，不在 GIF 中塞字幕。

#### r/selfhosted

**为什么适合：** 一台主机、多浏览器、文档齐全和本地数据边界符合 self-hosted 主题。

**是否允许 Self-promotion：** 条件允许且审核严格。项目需已发布、可下载 / 试用、有安装文档、说明功能与用户收益；较新的项目可能只能发到当期 New Project Megathread。发布当天必须重新检查规则和 Flair。

**英文标题：** ShotAI: a self-hosted local AI workbench for a trusted LAN

**英文正文：**

I built ShotAI for a small, practical setup: one Windows host runs local models, while other computers on the same trusted LAN use a browser.

The host serves the web app on port 9090 and proxies local inference services through the same origin. LAN users can chat, read documents, query local collections with source snippets, analyze images, and use a local image runtime. Model administration is restricted to the host by default.

Why I built it:

- avoid installing the same runtime and model files on every workstation;
- keep working data on the local machine / trusted LAN;
- give non-technical users one task-oriented interface;
- keep chat, vision, retrieval, and image generation models separate behind the UI.

Current limitations are important: no authentication, HTTPS, audit logs, shared server-side history, GPU quotas, or job queue. Browser state is stored per client in IndexedDB. I do not recommend exposing it directly to the Internet.

The repository includes source, Windows packaging, deployment documentation, and validation scripts. Model weights are not bundled.

MIT repository: `https://github.com/ReDChicagOTypewriteR/ShotAI`

I would appreciate deployment feedback from small LAN setups, especially around Windows firewall behavior and concurrent requests.

**Demo：** 双设备视频或 GIF，并提供一张简单拓扑图；不要只贴 Landing Page。

**CTA：** Try it on a trusted LAN and report reproducible deployment or model compatibility issues.

**推荐素材：** 英文标注的拓扑图、30 秒 GIF、硬件与模型环境表、限制清单。

**Hashtags：** Reddit 不使用 Hashtags；选择准确 Flair。

**注意事项：** 不要同一天向多个 Subreddit 复制同一正文；先参与社区，再发布项目。

### 8.10 Hacker News / Show HN

**推荐程度：★★★☆☆**

**Show HN 标题：** Show HN: ShotAI – a LAN-first workbench for local AI models

**副标题：** One host runs the models; other machines use a browser.

**英文正文：**

Hi HN,

I built ShotAI because local model tools usually stop at a single machine. My actual setup had one Windows PC with a capable GPU and several other computers on the same trusted LAN.

ShotAI serves a Vue/TypeScript workbench on port 9090. The same Node/Electron process proxies Ollama and a local image runtime, so clients only connect to one origin. Model management is host-only by default.

The workbench supports streaming chat, document extraction, local retrieval with source chunks, image understanding, and local image generation/editing. Tasks are routed by capability: chat, vision, embeddings, and image generation can use different models without requiring the user to switch manually. If no embedding model is available, retrieval falls back to keyword matching.

Client state currently lives in IndexedDB. This keeps deployment small and separates browser histories, but it also means there is no cross-browser sync. Other deliberate limitations: no auth, HTTPS, audit log, GPU quotas, or multi-user queue. It is for a trusted LAN and should not be exposed directly to the Internet.

The current release is Beta and Windows-focused. Model weights are not included. The code is MIT-licensed:

`https://github.com/ReDChicagOTypewriteR/ShotAI`

I would be interested in feedback on the architecture boundary: should lightweight LAN tools add identity and server-side state early, or stay browser-local and focus first on scheduling?

**第一条评论：**

> A few implementation details: PDF, DOCX, and spreadsheet text is extracted in the browser; local collections use chunked text with embedding similarity or keyword fallback; `/ollama/` and `/image/` are same-origin proxies to loopback-only services. The repository has feature-specific validation scripts, but no public CI workflow at the moment. I am also aware that the README license note is stale even though an MIT LICENSE file exists; I will fix that before posting.

**Demo 建议：** 首页必须能在 15 秒内看到 GIF；提供英文 README、Windows 安装步骤、硬件 / 模型说明与架构图。产品介绍页不能替代可运行 Demo。

**CTA：** Inspect the architecture, run it on a trusted LAN, and challenge the current host/client boundary.

**推荐素材：** 轻量 GIF + 一张 SVG 架构图；不要自动播放有声视频。

**Hashtags：** 无。

**注意事项：** 发布前先补英文 README，否则讨论会被安装门槛带偏。

### 8.11 DEV Community / Hashnode

**推荐程度：★★★☆☆**

**标题：** Designing a LAN-First Local AI Workbench with Vue, Electron, and Ollama

**副标题：** What changed when I treated local inference as a shared product instead of a single-machine API.

**正文：**

Most local AI tutorials end when a model answers a request on localhost. That is enough for an experiment, but it was not enough for my use case: one Windows machine had the GPU, while several other computers on the same trusted network needed access.

I built ShotAI around that constraint. The goal was not to expose an Ollama port. It was to create a workbench with understandable tasks, a clear host/client boundary, local document workflows, and honest deployment limits.

### One origin for the browser

ShotAI serves the Vue application and inference proxies from port 9090. Requests under `/ollama/` go to Ollama on the host loopback interface. Requests under `/image/` go to a separate local image runtime. The proxy removes browser origin headers that local runtimes do not expect and preserves streaming responses.

This gives browser clients one address and keeps the underlying runtimes off the LAN surface.

### Route tasks, not users

The UI does not assume one model can do everything. A regular prompt uses the selected chat model. An uploaded image selects an available vision model. Retrieval prefers an embedding model but falls back to keyword matching. Image generation and reference-image editing use a separate provider.

The important product decision is that automatic routing does not silently change the user's chat model. The current task receives the capability it needs while the conversation setting remains stable.

### Browser-local documents and state

PDF, DOCX, and spreadsheet parsing happens in the browser with PDF.js, Mammoth, and SheetJS. Documents are normalized and split into overlapping chunks. Retrieval results keep document names, chunk indexes, scores, modes, and excerpts so the UI can show sources.

Workspace state, local collections, and recent image history are stored in IndexedDB. That choice avoids an additional database and keeps client histories separate, but there is no cross-browser synchronization or central backup yet.

### Host and client are different roles

By default, only the host can import, delete, or reload models. LAN clients can use the available capabilities but cannot administer the runtime. This is not authentication: ShotAI currently has no accounts, HTTPS, or audit logs. It is a narrow safety boundary for a trusted LAN, not a public deployment model.

### Shipping on Windows

The Electron main process owns the desktop window, tray behavior, static files, port 9090, and local proxying. Model weights are deliberately excluded from the installer. The repository also includes a Node LAN server, Nginx configuration, and a smaller Go launcher for alternative packaging paths.

### What is still missing

The project is Beta. Concurrent heavy requests have no GPU quota or job queue. Client histories do not sync. Scanned PDFs have no OCR. Legacy `.doc` files must be converted, and local collection files are limited to 20 MB each. I would not expose the service directly to the Internet.

The largest lesson was that local AI product work begins after the first successful inference. Deployment ownership, capability routing, understandable failures, and explicit non-goals matter more than adding another model selector.

ShotAI is MIT-licensed: `https://github.com/ReDChicagOTypewriteR/ShotAI`

**CTA：** Read the implementation and share how you would add fair scheduling without turning a small LAN tool into a full multi-tenant platform.

**推荐素材：** Architecture diagram, task-routing diagram, browser-local state diagram, 30-second two-device demo.

**Hashtags：** `#vue` `#electron` `#ollama` `#opensource` `#localai`

**注意事项：** DEV 与 Hashnode 不要同日发完全相同 canonical 内容；选一个作为原文并设置 canonical URL。

## 9. 图片 / GIF / 视频素材规划

### 必须准备

1. **双设备核心 GIF（20–30 秒）**：主机已运行 → 第二台电脑输入地址 → 提问 → 收到流式回答。它直接证明 P0 卖点。
2. **工作台主界面截图**：使用真实对话内容，避免空白首页；同时保留黑白视觉辨识度。
3. **局域网架构图**：明确浏览器只访问 9090，Ollama 与图片服务只在主机回环地址。
4. **资料引用截图**：导入一份非敏感文件，提问后展开来源片段。
5. **模型自动分工 GIF**：普通聊天模型保持不变，上传图片后视觉任务自动完成。
6. **限制清单图**：可信内网、无账号 / HTTPS / 审计 / 同步 / 队列、需自备模型。

### 建议准备

7. **图片生成与参考图修改视频**：展示真实等待、停止、进度和结果，不只放成品。
8. **主机管理 vs 内网使用对照图**：同一页面在两种角色下的入口差异。
9. **Before / After 图**：多台电脑重复安装 vs 一台主机 + 多浏览器。
10. **硬件环境卡**：CPU、GPU、显存、内存、模型与并发数，只写真实测试数据。
11. **英文版 GIF 和架构图**：为 Reddit、HN、DEV 单独制作，不直接复用中文标注。
12. **90 秒无旁白 Demo**：方便嵌入 GitHub、Landing Page 和海外平台。

### 暂不制作

- **性能 Benchmark 海报**：当前没有标准化测试数据，先不要用“高性能”叙事。
- **云端 / 手机端场景图**：不属于当前验证重点。
- **企业安全认证图**：项目没有对应证据。
- **Product Hunt Launch 图组**：等英文落地页、下载流程和安装视频齐备后再做。

### 推荐录制数据

- 主机系统、GPU、显存、内存。
- 使用的聊天、视觉、Embedding 和图片模型。
- 首字时间与完整回答时间。
- 两台、三台客户端同时请求时的等待顺序。
- 文件类型、大小与处理时间。
- 图片生成尺寸、步数与耗时。

这些数据只作为“测试环境结果”，不能推广成普遍性能承诺。

## 10. 发布顺序

1. **GitHub 基础修正**：修复许可证说明、补真实 Release / 下载入口、明确 Beta 与硬件要求。
2. **B站 Demo**：先建立可验证的动态证据，后续平台都可引用视频或拆 GIF。
3. **V2EX 首轮反馈**：用克制首帖获得安装、模型和多设备真实问题。
4. **掘金技术长文**：吸收首轮反馈后发布架构文章，减少“只展示没细节”的质疑。
5. **CSDN 部署教程**：针对已经出现的真实报错补充搜索内容。
6. **知乎问题回答**：从多设备部署问题切入，扩大到产品与架构讨论。
7. **小红书视觉故事**：使用前面已验证的素材和真实测试数据。
8. **开源中国 / 博客园**：分别发布项目说明与完整工程复盘。
9. **英文基础设施**：英文 README、Landing Page、GIF、安装说明。
10. **Reddit → DEV / Hashnode → Show HN**：先垂直社区验证英文表达，最后再发 HN。

不要在 48 小时内集中轰炸所有平台。每次发布后至少留出一天处理问题、更新 FAQ 和修正文案。

## 11. 30 天推广计划

| 天数 | 任务 | 产出 | 验证指标 |
|---|---|---|---|
| Day 1–2 | 修正 GitHub 信息冲突 | README 许可证、Beta、下载和硬件说明 | 新用户不再询问“是否开源 / 去哪下载” |
| Day 3–4 | 录制核心 Demo | 双设备 GIF、5 分钟 B站视频 | 能在 10 秒内理解“一主机多浏览器” |
| Day 5 | 发布 B站 | 视频、置顶评论、简介链接 | 完播、评论中的真实场景问题 |
| Day 6–7 | 整理反馈 | FAQ、已知问题、Issue 模板建议 | 可复现问题比例提升 |
| Day 8 | 发布 V2EX | 克制首帖 | 获得硬件、模型、网络环境反馈 |
| Day 9–11 | 修正文档与录屏 | 新版部署说明、权限截图 | 重复问题减少 |
| Day 12 | 发布掘金 | 工程长文 | 收藏、技术讨论、源码访问 |
| Day 13–14 | 回答评论并提炼排错 | 403/404 与防火墙案例 | 形成 CSDN 搜索素材 |
| Day 15 | 发布 CSDN | 部署教程 | 搜索访问、按教程成功反馈 |
| Day 16–17 | 发布知乎 | 问题型回答 | 高质量追问而非单纯点赞 |
| Day 18 | 发布小红书 | 9 图故事 | 收藏、私信中的使用场景 |
| Day 19–20 | 发布开源中国 / 博客园 | 项目发布 + 架构复盘 | 开源用户与长文读者反馈 |
| Day 21–23 | 建英文基础 | English README、GIF、架构图 | 海外用户能独立完成理解与安装 |
| Day 24–25 | 参与目标 Subreddit | 回答他人问题，不发项目广告 | 账号有真实社区参与记录 |
| Day 26 | 条件满足时发 Reddit | 两个社区只选一个先发 | 留存评论、安装反馈、未被规则移除 |
| Day 27–28 | 发 DEV 或 Hashnode | 英文工程文章 | 阅读完成度、技术评论 |
| Day 29 | 评估 Show HN 前提 | 英文页、GIF、下载、限制全部可见 | 陌生用户无需中文资料即可试用 |
| Day 30 | 条件满足时发 Show HN | Show HN 帖与第一评论 | 架构讨论、Issue、外部贡献 |

每周复盘只看四类指标：成功安装数、可复现 Issue、完成 Demo 的用户数、文档中重复出现的问题。Star、播放量和点赞只作为次级信号。

## 12. 需要我补充的信息

以下信息在当前仓库中无法完全确认，发布前需要项目维护者补充：

1. **Windows 安装包的公开下载地址**：GitHub Release 是否已有可下载的 1.1.6 安装包。
2. **在线 Demo 状态**：当前产品介绍页是否只展示信息，是否存在可交互但不暴露模型的 Demo。
3. **最低与推荐硬件**：至少给出两组真实验证过的 CPU、内存、GPU、显存与模型组合。
4. **多人并发实测**：两台、三台或更多客户端同时请求时的真实行为与限制。
5. **图片运行组件支持范围**：除文档列出的模型结构外，哪些模型已在 Windows 真机验证。
6. **Linux 支持级别**：启动脚本存在，但是否作为正式支持平台，还是仅供开发测试。
7. **维护者身份表达**：个人项目、团队项目或组织项目；海外社区必须明确。
8. **AI 辅助开发披露**：Reddit 等社区可能要求或关注，需由维护者给出准确说明。
9. **路线优先级**：任务队列、轻量认证、备份迁移、跨浏览器同步中，下一阶段最先做什么。
10. **README 冲突处理**：确认 MIT 许可证为正式选择，并删除“尚未提供许可证”的旧说明。

## 最终选择

### 如果只能选择 3 个平台

1. **B站**：最能用真实双设备操作证明“一台主机、多端浏览器”，也能一次覆盖 UI、文件、视觉和图片流程。
2. **V2EX**：目标用户与当前 Beta 阶段最匹配，适合获得克制、具体的局域网和本地模型反馈。
3. **掘金**：项目有足够工程深度，可用架构文章建立长期搜索与技术可信度。

### 如果只能制作 3 个素材

1. **双设备 30 秒 GIF**：最短路径证明项目的核心差异，不需要读者先理解技术栈。
2. **局域网架构图**：解释 9090、Ollama、图片服务、主机权限和可信内网边界。
3. **完整 5 分钟 Demo**：覆盖文件、资料引用、图片理解、图片创作和当前限制，可拆分给多个平台重新剪辑。

