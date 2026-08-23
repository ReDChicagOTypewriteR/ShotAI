# 快速开始

## Windows 直接使用

先准备主机、运行组件和模型，再按照[内网部署](/guide/deployment)启动 ShotAI。其他电脑不需要安装 Node.js、Ollama 或模型，只需访问主机显示的局域网地址。

## 本地开发

在项目根目录执行：

```bash
npm install
ollama serve
npm run dev
```

工作台默认地址通常是 `http://127.0.0.1:5173/`。

门户网站是独立项目：

```bash
cd portal
npm install
npm run dev
```

更多构建、验证和发布命令，请参阅仓库中的开发流程文档。
