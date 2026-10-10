# 支持的模型与厂商

ShotAI 不使用固定的模型白名单。实际兼容性由模型格式、运行组件版本、量化方式和设备资源共同决定。安装包不包含模型权重，使用前请确认模型许可证允许对应的个人、组织或商业用途。

## 对话与推理

此类模型通过 Ollama 运行，优先使用 Ollama 可读取的 GGUF 或官方模型仓库格式。

| 厂商 / 组织 | 代表系列 | 常见用途 |
| --- | --- | --- |
| 阿里云通义千问 | Qwen 2.5、Qwen 3、Qwen 3.5、Qwen Coder、Qwen Math | 中文对话、写作、代码和数学 |
| DeepSeek | DeepSeek R1 Distill、DeepSeek Coder 等兼容版本 | 推理、代码和复杂分析 |
| Meta | Llama 3、Llama 3.1、Llama 3.2 | 通用对话和多语言任务 |
| Google | Gemma 2、Gemma 3 | 通用问答和轻量部署 |
| Mistral AI | Mistral、Mixtral、Mistral Nemo | 通用对话和长文本 |
| Microsoft | Phi 3、Phi 3.5、Phi 4 | 小型部署和快速推理 |
| 零一万物 | Yi、Yi 1.5 等兼容版本 | 中文和双语对话 |

模型参数规模越大，对显存、内存和响应时间的要求越高。多人环境应优先使用适合设备的量化版本，并从较短上下文开始测试。

## 图片理解

| 厂商 / 组织 | 代表系列 | 导入说明 |
| --- | --- | --- |
| 阿里云通义千问 | Qwen2.5-VL、Qwen3-VL 兼容版本 | 部分 GGUF 需要同版本 `mmproj` |
| Meta | Llama 3.2 Vision 兼容版本 | 按模型发布页准备视觉配套文件 |
| OpenBMB / 面壁智能 | MiniCPM-V 兼容 GGUF | 主模型与同版本 `mmproj` 一起导入 |
| LLaVA 社区 | LLaVA、LLaVA-NeXT 兼容版本 | 主模型与同版本 `mmproj` 一起导入 |

视觉主模型和 `mmproj` 应来自同一个发布页面及同一版本。多分片模型必须一次选择完整分片。

## 资料检索

| 厂商 / 组织 | 代表系列 |
| --- | --- |
| 阿里云通义千问 | Qwen Embedding |
| 北京智源人工智能研究院 | BGE、BGE-M3 兼容版本 |
| Nomic AI | Nomic Embed Text |

Embedding 模型是可选项。未配置时，资料库仍可使用关键词检索。

## 图片生成与修改

图片模型通过本地图片运行组件执行，不经过 Ollama。

| 厂商 / 组织 | 代表系列 | 说明 |
| --- | --- | --- |
| Black Forest Labs | FLUX.2 Klein 4B / 9B GGUF | 支持文字生成图片和参考图修改；部分版本需要文本编码器与 VAE |
| Stability AI | Stable Diffusion、SDXL、SD3 兼容版本 | 能力取决于模型结构和本地运行组件 |
| 社区模型 | Juggernaut、DreamShaper 等兼容版本 | 适用于写实、插画和风格化任务 |

Windows 和 Ubuntu 主安装包均不包含图片运行组件或图片模型。图片功能需另装对应平台的可选扩展；Ubuntu 扩展面向 Ubuntu 22.04 x86_64、CUDA 12 和 NVIDIA V100（sm_70）构建，其他 NVIDIA 架构需使用匹配的运行组件。

## 导入原则

- 优先从模型作者、厂商或可信发布者处下载；
- 主模型、视觉配套文件、文本编码器和 VAE 不要混用不同版本；
- 不要仅根据文件名判断兼容性，导入后应进行一次实际加载测试；
- 超大模型能被识别不等于能在当前设备上稳定运行；
- 模型授权与 ShotAI 项目许可相互独立。
