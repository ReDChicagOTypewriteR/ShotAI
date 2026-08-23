# ShotAI Portal

ShotAI 的独立产品门户，使用 Vue 3 + Vite 构建，与工作台项目完全分离。

## 本地运行

```bash
npm install
npm run dev
```

默认地址：`http://127.0.0.1:5174`

> 不要直接双击项目根目录的 `index.html`。它是 Vite 源码入口，其中的
> `/src/main.ts` 需要开发服务器编译。

## 构建

```bash
npm run build
```

构建后会生成 `dist/index.html`、产品预览图片和 `dist/docs/` VitePress 文档站。
JavaScript 与 CSS 已内联到 HTML 中，将整个 `dist` 目录上传到 Nginx、Apache、IIS
或静态托管目录即可。

本地单独运行文档站：

```bash
npm run docs:dev
```

默认地址：`http://127.0.0.1:5175/docs/`

需要生成独立交付目录时执行：

```bash
npm run package:static
```

产物位于 `../release/ShotAI-1.1.3-Portal-Static`，不包含源码、Node.js 或 ZIP。

服务器目录示例：

```text
dist/
├── index.html
├── docs/
└── shotai-product-preview.png
```

可在构建前通过 `VITE_WORKBENCH_URL` 指定“打开工作台”按钮的地址。未配置时，
按钮会跳转到本页的部署流程，不会连接错误的本机端口。
