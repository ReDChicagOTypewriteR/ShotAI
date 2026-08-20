# Ubuntu 离线模型方案（V100 服务器）

适用目标：Ubuntu 22.04 x86_64、125 GiB 内存、Tesla V100 32GB（单卡或双卡）、完全离线环境。

## 推荐组合

| 用途 | 推荐模型 | 下载体积 | 建议上下文 |
| --- | --- | ---: | ---: |
| 主模型、中文、图片识别 | `qwen3.5:27b-q4_K_M` | 约 17 GB | 8K–16K |
| 快速备用、并发 | `qwen3.5:9b-q4_K_M` | 约 6.6 GB | 8K–16K |
| 编程 | `qwen3-coder:30b` | 约 19 GB | 16K–32K |
| 本地资料检索 | `bge-m3` | 约 1.2 GB | 模型默认值 |

整套模型约 44 GB，加上缓存和运行空间，建议至少预留 80 GB。不要直接把上下文设成模型标称的 256K；V100 上先使用 8K，确认稳定后再增加。

如果确认两张 V100 都能被 `nvidia-smi` 识别，可以把主模型升级为 `qwen3.5:35b-a3b-q4_K_M`（约 24 GB）。单张 V100 也可能装得下权重，但长上下文和并发会明显增加显存压力，因此 27B 是更稳妥的默认方案。

## 完全离线时的准备方式

推荐在一台能联网的 Linux x86_64 电脑上，用与服务器相同版本的 Ollama 下载官方模型，然后整体搬运模型仓库。这样会保留清单、模板、视觉配套文件和校验信息，比单独搬运第三方 GGUF 更可靠。

联网电脑依次准备：

```bash
ollama pull qwen3.5:27b-q4_K_M
ollama pull qwen3.5:9b-q4_K_M
ollama pull qwen3-coder:30b
ollama pull bge-m3
tar -C "$HOME/.ollama" -caf shotai-v100-models.tar.zst models
```

把压缩包复制到离线 Ubuntu。先完全退出 ShotAI，再解压到 ShotAI 自带服务的数据目录：

```bash
mkdir -p "$HOME/.config/ShotAI/data/models/ollama"
tar -xaf shotai-v100-models.tar.zst -C "$HOME/.config/ShotAI/data/models/ollama" --strip-components=1
```

如果 `systemctl is-active ollama` 显示 `active`，ShotAI 会使用已经运行的系统 Ollama，而不会启动内置版本。此时模型目录通常是 `/usr/share/ollama/.ollama/models`，应更新系统服务或停止它后再让 ShotAI 使用内置服务，不能把两个目录混用。

## 导入失败的排查顺序

1. 在 ShotAI 设置中确认实际 Ollama 版本。旧服务占用 `127.0.0.1:11434` 时，新离线包内置的 Ollama 不会启动。
2. 在 Ubuntu 主机本机导入。默认禁止局域网普通客户端执行模型写入操作。
3. 多分片 GGUF 必须一次选中全部 `00001-of-000NN` 文件；视觉模型的主文件和 `mmproj` 必须来自同一版本。
4. Hugging Face 上的第三方 Qwen3.5 GGUF 可能使用 Ollama 尚不兼容的元数据。优先搬运 Ollama 官方模型仓库。
5. 如果文件创建成功但首次加载失败，检查 `nvidia-smi`、显存占用和驱动；先把上下文降到 8K。

运行项目附带的诊断脚本：

```bash
chmod +x scripts/diagnose-ubuntu-models.sh
./scripts/diagnose-ubuntu-models.sh
```

脚本会生成 `shotai-model-diagnostics.txt`。它只读取系统、服务、显卡、磁盘和 ShotAI/Ollama 日志，不修改模型。
