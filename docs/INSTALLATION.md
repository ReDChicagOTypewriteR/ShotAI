# 安装与部署指南

## 下载

正式发布后可从 [GitHub Releases](https://github.com/ReDChicagOTypewriteR/ShotAI/releases) 下载对应平台的安装包；下表是当前源码构建使用的文件名，不代表这些文件已上传。安装包不包含模型权重。

| 平台 | 1.3.0 安装包（实机测试预发布） |
| --- | --- |
| Windows 10/11 x86_64 | `ShotAI-1.3.0-Windows-x64-Ollama-CUDA12-Setup.exe` |
| Ubuntu 22.04 LTS x86_64 | `ShotAI-1.3.0-Ubuntu-22.04-x86_64-Ollama-CUDA12.deb` / `.AppImage` |

## Windows 安装

1. 双击 Windows EXE 安装包；
2. 按向导完成安装；
3. 从桌面或开始菜单启动 ShotAI；
4. 在主机的“模型管理”中导入模型；
5. 将界面显示的 `http://主机IPv4地址:9090` 提供给可信局域网使用者。

Windows 安装包包含 Ollama CUDA 12，不包含模型权重或图片运行组件。关闭主窗口后，ShotAI 默认继续在托盘运行；需要停止局域网服务时，请从托盘完全退出。

## Ubuntu 22.04 离线安装

将 DEB 复制到 Ubuntu 主机，在文件所在目录打开终端：

```bash
sudo dpkg -i ShotAI-1.3.0-Ubuntu-22.04-x86_64-Ollama-CUDA12.deb
shotai
```

也可以右键 DEB 并选择系统的软件安装工具。若双击进入压缩包或没有反应，使用上面的 `dpkg` 方式。

Ubuntu 安装包包含独立 Ollama 及 CUDA 12 运行库，排除 CUDA 13 和 Vulkan，不包含图片运行组件、模型权重或 NVIDIA 驱动。需要 GPU 推理时，应先安装与显卡匹配的 NVIDIA 驱动，并确认：

```bash
nvidia-smi
```

1.3.0 主机“模型管理”提供“检测加载”和“运行体检”，体检记录为运行日志目录中的 `model-health.jsonl`。桌面客户端优先将日志写入桌面 `ShotAI-logs`，不可写时回退到数据目录 `logs`。体检区分模型已安装、实际驻留、CPU / GPU 混合和短推理失败；运行库配置不是 CUDA 实际加载证明。

最多接纳五个客户端；每个客户端最多一条运行、一条等待，轮流调度。并发根据模型大小、上下文和可用显存 / 内存保守估算，未知模型按单任务处理。图片生成 / 修改独占推理时段，并在开始前释放 Ollama 驻留模型。图片服务自身可能保留权重显存，后续聊天仍可能发生 CPU 回退；请以体检和实机监控为准。

升级保留已有 `lan.config.json`。旧配置的 `concurrency.maxParallelInferences: 2` 仍是上限；新安装默认上限为 5，而不是始终并行 5 条。调整该值后需完全退出并重启 ShotAI。额度估算控制的是 ShotAI 请求放行；Ollama 的内部并行槽与缓存分配仍受启动配置限制，不能等同于精确的显存预测或 V100 性能保证。

图片功能需单独安装同平台的可选扩展：将扩展目录 `runtime/image` 内的文件复制到 ShotAI 数据目录下的 `runtime/image`，Ubuntu 还需为 `sd-server` 添加执行权限，随后重启 ShotAI。启动记录写入运行日志目录的 `image-runtime.log`；应以日志中的 CUDA 后端初始化结果和实际显存占用判断是否使用 GPU，不能只依据系统检测到显卡。

## 第一次启动

1. 在主机启动 ShotAI；
2. 打开“模型管理”并导入聊天、视觉、Embedding 或图片模型；
3. 完成一次对话，确认模型能够实际加载；
4. 需要 GPU 时，在主机监控中确认显存占用和 GPU 推理状态；
5. 从另一台局域网设备打开 `http://主机IPv4地址:9090`。

默认最多接纳五个活跃客户端，实际并行数量按资源保守估算。管理员可在数据目录的 `lan.config.json` 中调整上限，修改后需要完全退出并重新启动 ShotAI。

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
npm run release:image:windows
npm run release:image:ubuntu
```

发布前可运行 `npm run check:release`。需要顺序生成两套安装包和可选图片扩展时使用 `npm run release:all`。Windows 产物只写入
`release/windows`，Ubuntu 产物只写入 `release/ubuntu`。
