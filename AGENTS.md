# ShotAI 统一双平台工作区约束

ShotAI 使用 `codex/unified` 作为功能开发与发布主线。公共功能以当前 Ubuntu
实现为基准，但每次实现都必须同时考虑 Ubuntu 22.04 x86_64 与 Windows
10/11 x86_64 的运行差异。

## 架构边界

- 公共核心：聊天界面、会话与资料库、模型抽象接口、Skill、并发调度和通用测试。
- Ubuntu 平台层：DEB/AppImage、Linux 路径与进程、NVIDIA/CUDA、服务端运行和主机监控。
- Windows 平台层：NSIS 安装器、Windows 路径与进程、Ollama/CUDA 运行组件和托盘行为。

公共核心不得依赖某个平台的绝对路径、命令或安装方式。平台差异统一放在
Electron 主进程、平台配置、运行组件和打包脚本中，并通过 `process.platform`
或独立构建配置选择。

## 分支与发布边界

- `codex/unified` 是后续唯一功能主线；旧 `codex/ubuntu` 和 `codex/windows`
  只保留为历史分支，不再分别实现新功能。
- Ubuntu 安装包只输出到 `release/ubuntu`。
- Windows 安装包只输出到 `release/windows`。
- 不得把模型权重放入安装包；运行组件必须使用各平台自己的二进制文件。
- 未经用户明确要求，不修改应用版本号。

## 验证要求

- 公共功能改动必须运行对应通用测试及 `npm run check:platforms`。
- Ubuntu 改动至少运行 Ubuntu 打包、主机监控和 GPU 状态检查。
- Windows 改动至少运行 Windows 构建配置、Electron 和运行组件检查。
- 正式交付分别执行 `npm run release:windows` 与 `npm run release:ubuntu`，
  或使用 `npm run release:all` 顺序生成两个平台安装包。
- 涉及 GPU 推理时，日志和监控必须能区分 CUDA 实际加载与 CPU 回退，不能只根据硬件存在推断 GPU 已启用。
