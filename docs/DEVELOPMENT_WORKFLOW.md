# ShotAI 开发与代码更新流程

这份文档面向 ShotAI 的维护者和贡献者，记录从本地开发、验证、提交，到同步 GitHub 和制作发布包的完整流程。

它针对当前版本的真实结构编写：ShotAI 是一个由 Vue/Vite 工作台、独立门户、Node.js 内网服务、Ollama 代理、Windows Electron 客户端和可选图片运行组件组成的本地 AI 工作台。

## 先确认当前产品边界

在修改代码前，先判断改动属于哪一条产品路径。当前已经可以使用的能力包括：

| 能力 | 主要位置 | 当前边界 |
| --- | --- | --- |
| 本地流式对话 | src/App.vue、src/services/ollama.ts | 依赖 Ollama；支持停止、继续、编辑后重答和重新生成 |
| 多会话与本地数据 | src/App.vue、IndexedDB 相关服务 | 会话、设置和资料保存在当前浏览器，不跨电脑同步 |
| 图片理解 | src/App.vue、视觉模型导入逻辑 | Ollama 模型必须具备 vision 能力 |
| 附件解析 | src/services/、聊天输入组件 | 支持 TXT、Markdown、PDF、DOCX；扫描型 PDF 没有 OCR 流程 |
| 本地知识库 | src/services/、知识库界面 | 有 Embedding 时使用向量检索，否则回退到关键词检索 |
| 模型管理 | src/services/ollama.ts、模型管理界面 | 支持单 GGUF，以及视觉主模型与 mmproj 配对导入 |
| 内网访问 | scripts/serve-lan.mjs、lan.config.json | 默认由主机提供 9090，客户端通过浏览器访问 |
| 本地图片创作 | src/services/image-runtime.ts、Windows 图片运行组件 | 依赖 stable-diffusion.cpp 和对应模型；支持文字生图与参考图修改 |
| Windows 桌面客户端 | desktop/electron/ | Electron 主进程提供网页、托盘和内网服务 |

当前尚未实现或不应在文档中描述为已实现的能力：账号登录、细分角色、HTTPS、审计日志、跨浏览器共享历史、主机级图片任务队列和扫描 PDF OCR。

## 一次性准备

根项目的 Vite 8 要求 Node.js ^20.19.0 或 >=22.12.0。工作台开发还需要主机可访问 Ollama；只通过浏览器访问内网工作台的客户端不需要安装 Node.js 或 Ollama。

~~~bash
cd /Users/alexjoker/Desktop/coding/ShotAI
npm install

cd portal
npm install
cd ..
~~~

开发对话功能时，在另一个终端启动 Ollama：

~~~bash
ollama serve
~~~

## 推荐的日常更新流程

### 1. 从最新 main 开始

~~~bash
cd /Users/alexjoker/Desktop/coding/ShotAI
git switch main
git pull --rebase origin main
~~~

如果远程仓库有其他人的提交，先完成这一步，再创建自己的分支。

### 2. 为一次改动创建分支

~~~bash
git switch -c feature/<简短描述>
~~~

示例：

~~~bash
git switch -c feature/vision-import-error
~~~

一个分支尽量只解决一个问题，例如“修复视觉模型导入提示”，不要同时混入无关的样式重构和发布包生成。

### 3. 修改前后都检查工作区

~~~bash
git status --short
git diff
~~~

确认修改的文件属于当前任务。特别注意不要提交：

- node_modules/、dist/、portal/dist/
- release/ 中的安装包和运行组件
- .env、本地 Token、私钥或用户数据
- GGUF、safetensors、DLL、EXE 等大型模型和二进制文件

项目根目录的 .gitignore 已经覆盖这些常见产物，但提交前仍应检查暂存区。

### 4. 运行与改动相关的验证

先运行最小验证，再运行完整构建：

| 改动范围 | 建议命令 |
| --- | --- |
| Vue 工作台、聊天交互 | npm run check:chat-ux、npm run check:answer-ui |
| Ollama API 或同源代理 | npm run check:ollama、npm run check:lan-proxy |
| 附件解析与本地恢复 | npm run check:attachment-ui |
| 图片理解或视觉模型导入 | npm run check:vision-ui、npm run check:vision-import |
| 知识库与检索 | npm run check:rag-ui；该脚本目前仍依赖旧版界面文案，失败时需人工检查并记录原因 |
| 图片生成、参考图修改 | npm run check:image-generation |
| 门户网站 | cd portal && npm run check:static && npm run build |
| Electron 客户端 | npm run check:electron；完整安装包使用 npm run check:electron-full |
| Windows 启动器 | npm run check:windows-launcher、npm run check:windows-chat-ready、npm run check:windows-image-runtime |

所有前端改动至少执行：

~~~bash
npm run build
~~~

需要检查本地页面时：

~~~bash
# 终端 A
npm run dev

# 终端 B
ollama serve
~~~

工作台开发地址通常是 http://127.0.0.1:5173/，门户在 portal/ 目录启动后通常使用 http://127.0.0.1:5174/。构建产物预览使用：

~~~bash
npm run preview
~~~

生产预览端口由 vite.config.ts 配置为 9090；如果端口被占用，以终端输出为准。

### 5. 暂存并复查提交内容

优先添加明确的文件；确认整棵工作区都属于当前任务时，才使用 git add .：

~~~bash
git add src/App.vue src/services/ollama.ts
git diff --cached --stat
git diff --cached --name-only
~~~

确认暂存内容后提交：

~~~bash
git commit -m "Fix vision model import feedback"
~~~

提交信息应说明结果，而不是只写 update 或 change。示例：

- Fix vision model import feedback
- Add reference image editing flow
- Document LAN deployment limits

### 6. 推送并创建合并请求

第一次推送新分支：

~~~bash
git push -u origin feature/vision-import-error
~~~

然后在 GitHub 创建 Pull Request，至少写清楚：改了什么、为什么改、如何验证、是否有已知限制。

合并到 main 后，本地清理分支：

~~~bash
git switch main
git pull --rebase origin main
git branch -d feature/vision-import-error
~~~

如果你暂时不使用分支、直接在 main 开发，则每次更新仍遵循：

~~~bash
git pull --rebase origin main
git add .
git commit -m "Describe the change"
git push
~~~

## 发布前流程

### 更新版本和变更记录

根目录 package.json 与 portal/package.json 当前保持相同版本号。发布新版本时：

1. 同步修改两个 package.json 的 version。
2. 在 CHANGELOG.md 添加版本、日期、已实现变化和已知边界。
3. 运行工作台和门户构建。
4. 运行与本次发布相关的检查脚本。
5. 提交并创建版本标签。

~~~bash
npm run build
cd portal && npm run build && cd ..
git add package.json portal/package.json CHANGELOG.md
git commit -m "Release v1.1.4"
git tag -a v1.1.4 -m "ShotAI v1.1.4"
git push origin main
git push origin v1.1.4
~~~

### 选择正确的交付包

~~~bash
# 通用内网交付目录
npm run package:lan

# Electron Windows 安装包
npm run build:win

# 完整 Electron 包
npm run electron:pack:win:full

# 原生 Windows 精简启动器
SHOTAI_GO_BIN=/path/to/go npm run package:windows-lite

# 对话包与独立图片运行组件
npm run package:windows-chat-ready
npm run package:windows-image-runtime
~~~

这些命令会生成 release/ 内容。它们不应进入 Git 提交，应作为 GitHub Release 的附件上传。模型权重也不随源码仓库发布，必须单独准备并确认授权。

## 端口和部署边界

| 服务 | 默认地址 | 用途 |
| --- | --- | --- |
| 工作台开发服务器 | 127.0.0.1:5173 | Vite 开发与热更新 |
| 门户开发服务器 | 127.0.0.1:5174 | portal/ 独立门户 |
| ShotAI 内网服务 | 主机IP:9090 | 网页、健康检查、Ollama 和图片代理 |
| Ollama | 127.0.0.1:11434 | 本地模型服务 |
| 图片运行组件 | 127.0.0.1:1234 | stable-diffusion.cpp 图片接口 |

当前版本适用于可信局域网，不是公网多租户服务。不要将 9090、/ollama 或 /image 直接暴露到公网；上线前应补充 HTTPS、身份认证、访问控制和审计。

## 常见 Git 问题

### rejected (fetch first)

远程有本地没有的提交，先同步：

~~~bash
git pull --rebase origin main
git push
~~~

### Permission denied (publickey)

确认远程使用 SSH：

~~~bash
git remote -v
~~~

应显示类似：

~~~text
git@github.com:ReDChicagOTypewriteR/ShotAI.git
~~~

再测试：

~~~bash
ssh -T git@github.com
~~~

### 误把构建产物加入暂存区

在首次提交前可以取消暂存，不删除本地文件：

~~~bash
git restore --staged release/ dist/ portal/dist/
~~~

然后确认 .gitignore 已经覆盖对应路径。

### 构建成功但功能检查失败

先区分是代码问题、运行时依赖问题，还是检查脚本的旧选择器问题。当前 check:rag-ui 已知依赖旧版知识库文案，不能单独作为当前知识库功能是否可用的结论；需要结合实际页面和其他检查结果判断。

## 合并前检查清单

- [ ] 已从最新 main 创建分支，或已执行 git pull --rebase origin main
- [ ] 改动只涉及当前任务，没有混入无关文件
- [ ] 没有提交 .env、Token、私钥、用户数据、模型权重和 release/
- [ ] 已运行与改动相关的 check:* 脚本
- [ ] npm run build 通过；门户改动已运行 cd portal && npm run build
- [ ] 已人工检查工作台和门户的实际页面
- [ ] 已更新 CHANGELOG.md 或对应文档
- [ ] Commit 信息能说明实际变化
- [ ] Pull Request 中写明验证命令和已知限制

## 文档索引

- [用户指南](USER_GUIDE.md)：面向使用者的本地与内网使用说明
- [内网部署](LAN_DEPLOYMENT.md)：端口、代理、防火墙和运行组件
- [Electron Windows 客户端](ELECTRON_WINDOWS_GUIDE.md)：桌面客户端与安装方式
- [产品架构](PRODUCT_ARCHITECTURE.md)：模块关系和数据流
- [ShotAI 主 README](../README.md)：项目定位、能力边界和快速开始

