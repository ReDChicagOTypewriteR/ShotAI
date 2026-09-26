# 安装与部署指南

## 下载

从 [GitHub Releases](https://github.com/ReDChicagOTypewriteR/ShotAI/releases) 下载对应平台的正式安装包。安装包不包含模型权重。

| 平台 | 1.2.0 安装包 |
| --- | --- |
| Windows 10/11 x86_64 | `ShotAI-1.2.0-Windows-x64-Full-CUDA12-Setup.exe` |
| Ubuntu 22.04 LTS x86_64 | `ShotAI-1.2.0-Ubuntu-22.04-x86_64-Full-Ollama-CUDA.deb` |

## Windows 安装

1. 双击 Windows EXE 安装包；
2. 按向导完成安装；
3. 从桌面或开始菜单启动 ShotAI；
4. 在主机的“模型管理”中导入模型；
5. 将界面显示的 `http://主机IPv4地址:9090` 提供给可信局域网使用者。

Windows 完整版包含 Ollama CUDA 12 与图片运行组件，不包含模型权重。关闭主窗口后，ShotAI 默认继续在托盘运行；需要停止局域网服务时，请从托盘完全退出。

## Ubuntu 22.04 离线安装

将 DEB 复制到 Ubuntu 主机，在文件所在目录打开终端：

```bash
sudo dpkg -i ShotAI-1.2.0-Ubuntu-22.04-x86_64-Full-Ollama-CUDA.deb
shotai
```

也可以右键 DEB 并选择系统的软件安装工具。若双击进入压缩包或没有反应，使用上面的 `dpkg` 方式。

Ubuntu 完整版包含独立 Ollama、CUDA 运行库和面向 NVIDIA V100（sm_70）构建的 Linux 图片运行器，不包含模型权重或 NVIDIA 驱动。需要 GPU 推理时，应先安装与显卡匹配的 NVIDIA 驱动，并确认：

```bash
nvidia-smi
```

图片模型导入后会直接使用安装包内的 `sd-server`。启动记录写入 `~/.config/ShotAI/data/logs/image-runtime.log`；应以日志中的 CUDA 后端初始化结果和实际显存占用判断是否使用 GPU，不能只依据系统检测到显卡。

## 第一次启动

1. 在主机启动 ShotAI；
2. 打开“模型管理”并导入聊天、视觉、Embedding 或图片模型；
3. 完成一次对话，确认模型能够实际加载；
4. 需要 GPU 时，在主机监控中确认显存占用和 GPU 推理状态；
5. 从另一台局域网设备打开 `http://主机IPv4地址:9090`。

默认最多接纳五条活跃请求：两条同时推理、三条等待。管理员可在数据目录的 `lan.config.json` 中调整容量，修改后需要完全退出并重新启动 ShotAI。

## 数据与日志

### Windows

模型、配置和日志位于 ShotAI 用户数据目录。程序升级和普通卸载默认保留这些数据。

### Ubuntu

```text
~/.config/ShotAI/data/
├── models/
├── runtime/
└── logs/
```

模型导入失败时，还可查看桌面的 `ShotAI-model-import.log` 或 `ShotAI-logs/`。

## 更新与卸载

- 更新：退出 ShotAI 后安装新版本，默认沿用原数据目录；
- Windows 卸载：使用系统“已安装的应用”；
- Ubuntu 卸载：执行 `sudo dpkg -r shotai`；
- 删除模型和配置：请先备份，再通过 ShotAI 设置或手动处理用户数据目录。

## 局域网与安全

- ShotAI 默认通过 `9090` 提供局域网入口；
- 防火墙只应允许可信内网访问该端口；
- Ollama 和图片运行组件应继续只监听本机；
- 不要把 ShotAI 服务直接暴露到公网；
- 修改端口、并发或监控配置后，需要完全重启 ShotAI。

安装或运行异常见[常见问题](FAQ.md)，模型兼容范围见[支持的模型与厂商](SUPPORTED_MODELS.md)。

## 双平台构建

源码统一维护，平台运行组件与安装器分别打包：

```bash
npm run release:windows
npm run release:ubuntu
```

需要顺序生成两套安装包时使用 `npm run release:all`。Windows 产物只写入
`release/windows`，Ubuntu 产物只写入 `release/ubuntu`。
