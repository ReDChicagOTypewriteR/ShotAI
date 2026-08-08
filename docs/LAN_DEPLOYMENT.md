# ShotAI 内网部署与测试说明

> 当前 Windows 安装版直接运行 `ShotAI.exe`；旧版便携交付目录使用
> `start-windows.bat`。两种方式均在 9090 提供同一套局域网工作台。

## 目录用途

该目录是已经完成生产构建的 ShotAI 网页版。Windows 主机不需要安装
Node.js 或 npm，启动器使用系统 PowerShell 提供静态网页和 Ollama
同源代理。

Ollama 只运行在主机上，其他电脑通过 ShotAI 网页服务器的 `/ollama`
代理访问模型。

## 主机启动

1. 当前完整安装包已经带有 Windows Ollama 免安装运行组件，无需单独安装。
2. Windows 右键以管理员身份运行 `start-windows.bat`；Linux 执行
   `./start-linux.sh`。Windows 启动器会保留窗口并显示错误信息；请保持该
   窗口开启，按 `Ctrl+C` 可停止服务。
3. 终端会显示类似 `http://192.168.1.20:9090` 的内网地址。
4. 其他电脑使用浏览器打开该地址。

默认配置文件为 `lan.config.json`：

```json
{
  "host": "0.0.0.0",
  "port": 9090,
  "version": "1.1.6",
  "allowLanAdministration": false,
  "ollamaUrl": "http://127.0.0.1:11434",
  "imageRuntime": {
    "url": "http://127.0.0.1:1234",
    "modelLabel": "FLUX.2 Klein 4B",
    "mode": "auto",
    "model": "",
    "diffusionModel": "",
    "textEncoder": "",
    "vae": "",
    "steps": 4,
    "cfgScale": 1
  }
}
```

如果 9090 被占用，可以将 `port` 修改为 9091 或其他端口。

## 浏览器兼容与缓存

生产构建已兼容 Chrome 80、Edge 80、Firefox 78、Safari 13.1 及之后版本。
推荐在内网电脑统一使用新版 Chrome 或 Chromium Edge。更旧、完全不支持
ES Module 的浏览器会显示升级提示，不会只留下黑色空白页。

升级 ShotAI 后必须同时替换 `web/index.html` 和 `web/assets` 整个目录，不要
只覆盖单个 JavaScript 文件。若控制台仍显示旧文件名，请按 `Ctrl+F5` 强制
刷新。Nginx 配置中的 `index.html` 已设置为不缓存，修改配置后需要重新加载
Nginx。

## Windows 防火墙

如果主机本机可以打开、其他电脑无法访问，请在管理员 PowerShell 执行：

```powershell
New-NetFirewallRule -DisplayName "ShotAI LAN 9090" -Direction Inbound -Protocol TCP -LocalPort 9090 -Action Allow
```

如果修改了端口，请同步修改命令中的 `9090`。

Windows 启动器会自动添加对应端口的防火墙入站规则。

## Windows 图片创作

图片创作不通过 Ollama，而是使用免 Python 的 stable-diffusion.cpp。最新完整
离线包已经带有 Windows CUDA 运行文件，目标电脑不需要联网。使用方法：

1. 运行 `start-windows.bat`，在主机进入输入框左侧“+ → 创作图片”。
2. 点击“选择下载好的模型文件”。单文件版选择一个文件，三文件版一次选中三个文件。
3. ShotAI 会保存文件并重新载入图片服务；如页面提示重启，关闭启动窗口后重新运行即可。

也可以把文件手动放入 `models/image` 后重新运行 ShotAI，适合制作完全离线的预装包。

部署目录中的 `prepare-image-runtime.bat` 是修复工具。只有运行文件被删除、损坏或
需要更新时才需要在联网环境运行，正常离线部署不需要执行。

当前支持两种模型结构：

- 单文件模式：`flux2-klein-4b.q4_k.gguf`，约 4.96GB，直接放入
  `models/image`。
- 三文件模式：FLUX.2 Klein 主模型、Qwen3 4B 文字理解文件和 FLUX.2
  图片解码文件，三个文件一起放入 `models/image`。

如果自动识别不到，可以在 `lan.config.json` 的 `imageRuntime` 中填写相对
路径。`model` 用于单文件模式；三文件模式填写 `diffusionModel`、
`textEncoder` 和 `vae`。

图片服务只监听主机的 `127.0.0.1:1234`，其他电脑仍通过 ShotAI 的
`/image/` 地址访问，不需要单独安装任何程序，也不应把 1234 端口开放到
局域网。

默认只有主机可以添加或删除聊天模型、图片模型。其他电脑可以正常使用，
但会显示“内网使用模式”。只有明确需要时，才把 `allowLanAdministration`
改为 `true`。

## 9090 端口出现 403 / 404

如果只把 `dist` 上传到 Nginx、Apache 或其他静态文件服务器，网页可以
打开，但 `/ollama/api/show` 和 `/ollama/api/chat` 不会自动转发给
Ollama。常见表现是：

- 静态资源 404：通常是旧构建使用了绝对 `/assets` 路径。
- `/ollama/api/show` 403：代理转发了内网浏览器的 `Origin`，或服务器禁止
  POST。
- `/ollama/api/chat` 403：同样通常是 `Origin` 校验或 POST 代理规则问题。

当前构建已经把网页资源改为相对路径。使用 Nginx 时复制
`deploy/nginx/shotai.conf` 中的配置，尤其要保留：

```nginx
location /ollama/ {
    proxy_pass http://127.0.0.1:11434/;
    proxy_http_version 1.1;
    proxy_set_header Host 127.0.0.1:11434;
    proxy_set_header Origin "";
    proxy_set_header Referer "";
    proxy_set_header X-ShotAI-Proxy "nginx";
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_read_timeout 3600s;
}
```

如果使用 Nginx 并启用了图片创作，还需要加入：

```nginx
location /image/ {
    proxy_pass http://127.0.0.1:1234/;
    proxy_set_header Origin "";
    proxy_set_header Referer "";
    proxy_buffering off;
    proxy_read_timeout 3600s;
}
```

`Origin` 和 `Referer` 的清理不能省略：浏览器在内网 IP 页面发起 POST 时
会带上该页面来源，而 Ollama 默认只信任回环地址。不要对 `/ollama/` 设置
`limit_except GET`，因为模型详情、聊天、导入模型都需要 POST。修改后执行：

```bash
nginx -t
nginx -s reload
```

不建议用 `OLLAMA_ORIGINS=*` 暴露 Ollama。ShotAI 已通过同源代理解决来源
问题，Ollama 继续只监听 `127.0.0.1:11434` 即可。

也可以不使用现有静态服务器，直接运行 ShotAI 部署包自带的启动器。

## 推荐模型

建议先用于稳定性测试：

- 模型：Qwen3-VL-8B-Instruct
- 量化：Q4_K_M
- Ollama 模型大小：约 6.1GB
- Hugging Face：
  `https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF`
- Ollama 需要 0.12.7 或更高版本

推荐直接使用 Ollama 完整模型：

```bash
ollama pull qwen3-vl:8b-instruct-q4_K_M
```

需要更高质量、约 20GB 的模型时使用：

```bash
ollama pull qwen3-vl:30b-a3b-instruct-q4_K_M
```

对应的 Hugging Face 官方路径：

- `https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct-GGUF`

8B Q4_K_M 约 6.1GB，可为 4070 Ti 12GB 留出图片编码和上下文缓存空间，
适合验证图片发送、OCR、中文问答和内网多客户端访问。30B Q4_K_M 约
20GB，会使用部分系统内存，质量更高，但首字响应会明显更慢。

重要：Qwen3-VL 的 GGUF 仓库包含语言模型和独立的 `mmproj` 视觉编码器。
不要只把一个语言 GGUF 文件通过 ShotAI 的“单文件导入”创建为模型，否则
Ollama 只会识别为文本模型。联网准备时使用上方 `ollama pull`；从 Hugging
Face 准备时可执行：

```bash
ollama run hf.co/Qwen/Qwen3-VL-30B-A3B-Instruct-GGUF:Q4_K_M
```

## 明日测试顺序

1. 主机打开 `http://127.0.0.1:9090/healthz`，确认返回 `status: ok`。
2. 在 ShotAI 模型中心刷新，确认模型显示 `VISION`。
3. 发送纯文本问题，确认流式输出。
4. 上传一张图片并要求描述或 OCR。
5. 上传 TXT、Markdown、PDF 或 DOCX，确认附件卡片和文档问答。
6. 在第二台电脑打开内网地址，重复文本、图片和文档测试。
7. 两台电脑同时提问，观察 Ollama 排队和主机内存占用。
8. 打开“创作图片”，生成一张正方形图片并下载。

每台客户端的会话和知识库保存在各自浏览器中，不会自动同步到其他电脑。
