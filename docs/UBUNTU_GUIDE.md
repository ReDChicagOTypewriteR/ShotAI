# ShotAI Ubuntu 22.04 x86_64 客户端

Ubuntu 版提供与 Windows Electron 客户端相同的桌面窗口、系统托盘和 `9090`
局域网入口。精简版默认生成两种文件：

- `ShotAI-1.1.7-Ubuntu-22.04-x86_64.deb`：推荐在 Ubuntu 22.04 上安装；
- `ShotAI-1.1.7-Ubuntu-22.04-x86_64.AppImage`：免安装运行和排错备用。

安装包包含 ShotAI 桌面客户端和网页服务，不包含模型权重、Ollama 或
stable-diffusion.cpp。主机需要安装 Ollama；图片创作还需要单独准备 Linux 版
`sd-server` 和对应模型。

完整对话离线版使用以下文件名：

- `ShotAI-1.1.7-Ubuntu-22.04-x86_64-Full-Ollama-CUDA.deb`；
- `ShotAI-1.1.7-Ubuntu-22.04-x86_64-Full-Ollama-CUDA.AppImage`。

完整包已经包含 Ollama v0.32.14、CUDA 12/13、CPU 和 Vulkan 运行库，目标机不需要
另外下载 Ollama 或 CUDA Toolkit，但仍然需要可正常工作的 NVIDIA 驱动。模型文件
不放入安装包，可继续使用现有 Ollama 模型目录或重新导入已有 GGUF。

## 构建

构建机需要 Node.js 20.19 或更高版本，并先安装依赖：

```bash
npm install
npm run build:ubuntu

# 已准备 vendor/ollama/linux 后构建完整对话离线版
npm run build:ubuntu:full
```

产物位于 `release/electron/`。推荐在 Ubuntu 22.04 x86_64 本机或同版本 CI 中
完成最终发布构建；macOS 可以交叉生成 Linux 包，但仍需在真实 Ubuntu 主机进行
安装、托盘、显卡和局域网验收。

## 安装和启动

### 双击安装完整离线版

把完整 `.deb` 文件复制到 Ubuntu 主机后，在“文件”中双击它，选择“软件安装”，
然后点击“安装”并输入管理员密码。安装完成后，可以从应用程序菜单搜索 `ShotAI`
启动。若双击后显示压缩包内容或没有安装按钮，右键文件并选择“使用软件安装打开”。

命令行安装可作为稳定的备用方式：

```bash
sudo apt install ./ShotAI-1.1.7-Ubuntu-22.04-x86_64-Full-Ollama-CUDA.deb
shotai
```

这是一次正常的系统应用安装，不会自动安装模型，也不会修改 NVIDIA 驱动。卸载时
可以执行 `sudo apt remove shotai`；用户模型与日志默认保留在
`~/.config/ShotAI/data/`。

### 精简版

安装 DEB：

```bash
cd release/electron
sudo apt install ./ShotAI-1.1.7-Ubuntu-22.04-x86_64.deb
shotai
```

使用 AppImage：

```bash
chmod +x ShotAI-1.1.7-Ubuntu-22.04-x86_64.AppImage
./ShotAI-1.1.7-Ubuntu-22.04-x86_64.AppImage
```

若 AppImage 提示缺少 FUSE，执行 `sudo apt install libfuse2` 后重试；DEB 安装方式
不依赖用户手动处理 AppImage 的 FUSE 运行环境。

关闭窗口后 ShotAI 会留在系统托盘并继续提供内网服务。若桌面环境不显示托盘
图标，可安装 AppIndicator 支持后重新登录：

```bash
sudo apt install libappindicator3-1 gnome-shell-extension-appindicator
```

## Ollama 和 Tesla V100

先确认 NVIDIA 驱动能识别计算卡：

```bash
nvidia-smi
```

使用完整离线版时不需要执行本节的 Ollama 安装命令。使用精简版时，安装并启动
Linux x86_64 版 Ollama。ShotAI 会优先连接已经运行的
`http://127.0.0.1:11434`；如果服务未运行但系统 PATH 中能找到 `ollama`，
ShotAI 会以当前桌面用户启动它。不要把 Ollama 改成监听 `0.0.0.0`，局域网客户
端统一通过 ShotAI 的 `/ollama/` 代理访问。

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl start ollama
sudo systemctl status ollama
ollama pull qwen3-vl:8b-instruct-q4_K_M
```

首次对话后可执行 `ollama ps`，确认模型实际使用 GPU。Ollama 官方硬件列表包含
计算能力 7.0 的 V100，当前要求 NVIDIA 驱动 550 或更新版本。AMD Oland 卡可以继续
负责桌面显示，两者不冲突。若机器有多张 V100，可通过 Ollama 服务的
`CUDA_VISIBLE_DEVICES` 设置选择计算卡，优先使用 `nvidia-smi -L` 显示的 GPU UUID。

参考：[Ollama Linux 安装](https://docs.ollama.com/linux)和
[Ollama GPU 支持](https://docs.ollama.com/gpu)。

## 图片创作运行组件

若要启用与完整 Windows 包相同的本地图片创作，需要把适用于 Linux x86_64 和
当前 CUDA 驱动的 stable-diffusion.cpp 文件放到：

```text
~/.config/ShotAI/data/runtime/image/
└── sd-server
```

并添加执行权限：

```bash
chmod +x ~/.config/ShotAI/data/runtime/image/sd-server
```

模型通过 ShotAI 的“添加模型”导入，默认保存到：

```text
~/.config/ShotAI/data/models/image/
```

若不准备 `sd-server`，聊天、图片理解、文档问答、资料库和内网共享仍可正常使用，
只有 stable-diffusion.cpp 图片生成不可用。

当前 stable-diffusion.cpp 官方 Release 没有提供兼容 Ubuntu 22.04 的 Linux CUDA
预编译包；其 Linux 预编译文件面向 Ubuntu 24.04。为避免 glibc 兼容问题，本项目
没有把该文件放进 22.04 完整包。需要图片生成功能时，应在目标 Ubuntu 22.04 主机
按官方说明使用 `-DSD_CUDA=ON` 编译，并把生成的 `sd-server` 与依赖库放入上述目录。

## 这台主机的局域网配置

ShotAI 默认监听 `0.0.0.0:9090`，所以这台主机的访问地址是：

```text
本机：http://127.0.0.1:9090
内网：http://10.16.232.23:9090
```

默认路由 `10.16.232.1` 不需要写入 ShotAI 配置。若启用了 UFW，先用
`ip -4 route` 确认实际子网，再只允许该可信子网访问 9090。例如确认子网确实是
`10.16.232.0/24` 后执行：

```bash
sudo ufw allow from 10.16.232.0/24 to any port 9090 proto tcp
```

不要向局域网开放 `11434` 或 `1234`。这两个运行组件端口应继续只监听
`127.0.0.1`。

## 复用以前的模型

如果以前使用的是 ShotAI Windows 完整版，可以把原数据目录中完整的
`models/ollama` 文件夹复制到 Ubuntu 的：

```text
~/.config/ShotAI/data/models/ollama/
```

需要同时保留 `blobs` 和 `manifests`，不要只复制某个散列文件。复制前先从托盘
退出 ShotAI，复制完成后重新启动。如果只有独立 `.gguf` 或视觉模型的 `mmproj`
文件，直接在 ShotAI“添加模型”中重新选择即可，不需要重新下载。Windows 的
`ollama.exe`、DLL 和 `sd-server.exe` 不能复制到 Ubuntu，完整包已经用 Linux
Ollama 和 Linux CUDA 库替换它们。

针对 V100 服务器的模型组合、完全离线搬运方法和导入故障诊断，见
[Ubuntu 离线模型方案](UBUNTU_OFFLINE_MODELS.md)。

## 验收

1. 打开 `http://127.0.0.1:9090/healthz`，确认网页和代理状态；
2. 在主机添加模型并完成一次文本对话；
3. 上传图片和文档，验证图片理解与文档问答；
4. 从另一台电脑打开 `http://10.16.232.23:9090`；
5. 执行 `nvidia-smi` 和 `ollama ps`，确认 V100 正在承担推理；
6. 关闭桌面窗口，确认托盘仍在且内网页面继续可用；
7. 退出托盘程序，确认 9090 服务停止。

日志和运行数据默认位于 `~/.config/ShotAI/data/`。启动失败时先查看
`logs/desktop.log`，图片组件失败时查看 `logs/image-runtime.log`。
