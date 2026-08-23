# ShotAI Ubuntu 工作区约束

本工作区只负责 Ubuntu 22.04 x86_64 版本，工作分支固定为 `codex/ubuntu`。

## 架构边界

- 公共核心：聊天界面、会话与资料库、模型抽象接口、通用测试。
- Ubuntu 平台层：DEB/AppImage、systemd/服务器模式、V100/CUDA/vLLM、多人并发、主机监控。
- Windows 平台层不在本工作区实现。

公共核心改动必须保持平台无关；Ubuntu 专用行为应放在 Linux/Ubuntu 配置、启动器、服务和测试中，避免在公共界面中散落平台判断。

## 发布边界

- Ubuntu 安装包只能输出到 `release/ubuntu`。
- 不得构建、删除或修改 `release/windows`。
- 不运行 Windows 安装器或 Windows runtime 的构建任务。
- 未经用户明确要求，不修改应用版本号。

## 验证要求

- 公共核心改动运行对应的通用测试。
- Ubuntu 平台改动至少运行 Ubuntu 打包检查、主机监控检查和相关功能测试。
- 涉及 GPU 推理时，日志和监控必须能区分 CUDA 实际加载与 CPU 回退，不能只根据硬件存在推断 GPU 已启用。
