import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const portalDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const projectDirectory = dirname(portalDirectory)
const portalPackage = JSON.parse(
  await readFile(join(portalDirectory, 'package.json'), 'utf8'),
)
const outputDirectory = join(
  projectDirectory,
  'release',
  `ShotAI-${portalPackage.version}-Portal-Static`,
)

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })
await cp(join(portalDirectory, 'dist'), outputDirectory, { recursive: true })

// 兼容将 docs 子目录作为静态根目录的服务器配置：这类配置仍会请求 /docs/*。
// 保留一份轻量镜像，避免文档页和资源因部署根目录不同而 404。
const docsDirectory = join(outputDirectory, 'docs')
const docsCompatDirectory = join(docsDirectory, 'docs')
await mkdir(docsCompatDirectory, { recursive: true })
await cp(join(docsDirectory, 'assets'), join(docsCompatDirectory, 'assets'), {
  recursive: true,
})
await cp(join(docsDirectory, 'guide'), join(docsCompatDirectory, 'guide'), {
  recursive: true,
})
await cp(join(docsDirectory, 'index.html'), join(docsCompatDirectory, 'index.html'))
await cp(join(docsDirectory, 'vp-icons.css'), join(docsCompatDirectory, 'vp-icons.css'))
await cp(join(docsDirectory, 'hashmap.json'), join(docsCompatDirectory, 'hashmap.json'))

// 静态包部署在站点根目录时，嵌套文档页需要回到 docs 目录寻找共享资源。
// 保留 VitePress 的路由结构，同时将资源引用改成适用于 docs/guide/ 的相对路径。
const docsGuideDirectories = [
  join(outputDirectory, 'docs', 'guide'),
  join(outputDirectory, 'docs', 'docs', 'guide'),
]
for (const docsGuideDirectory of docsGuideDirectories) {
  for (const filename of await readdir(docsGuideDirectory)) {
    if (!filename.endsWith('.html')) continue
    const filePath = join(docsGuideDirectory, filename)
    const html = await readFile(filePath, 'utf8')
    const fixedHtml = html
      .replaceAll('href="/docs/assets/', 'href="../assets/')
      .replaceAll('src="/docs/assets/', 'src="../assets/')
      .replaceAll('href="/docs/vp-icons.css"', 'href="../vp-icons.css"')
      .replaceAll('href="/docs/guide/"', 'href="./index.html"')
      .replaceAll('href="/docs/guide/', 'href="./')
      .replaceAll('href="/docs/"', 'href="../index.html"')
      // 静态发布不依赖 VitePress hydration，避免部署根路径变化导致模块 404。
      .replace(/\s*<link rel="modulepreload"[^>]*>/g, '')
      .replace(/\s*<script type="module"[^>]*>\s*/g, '')
    if (fixedHtml !== html) await writeFile(filePath, fixedHtml)

    // 普通静态服务器不会把 quick-start.html 自动映射到 quick-start/。
    // 为 VitePress 的 clean URL 导航补充目录索引别名。
    if (filename !== 'index.html') {
      const aliasDirectory = join(docsGuideDirectory, filename.slice(0, -'.html'.length))
      await mkdir(aliasDirectory, { recursive: true })
      await cp(filePath, join(aliasDirectory, 'index.html'))
    }
  }
}

// 文档首页也使用相对地址，确保整套静态文件放在任意站点子目录都能工作。
for (const docsRootDirectory of [
  join(outputDirectory, 'docs'),
  join(outputDirectory, 'docs', 'docs'),
]) {
  const filePath = join(docsRootDirectory, 'index.html')
  const html = await readFile(filePath, 'utf8')
  const fixedHtml = html
    .replaceAll('href="/docs/assets/', 'href="./assets/')
    .replaceAll('src="/docs/assets/', 'src="./assets/')
    .replaceAll('href="/docs/vp-icons.css"', 'href="./vp-icons.css"')
    .replaceAll('href="/docs/guide/"', 'href="./guide/index.html"')
    .replaceAll('href="/docs/guide/', 'href="./guide/')
    .replaceAll('href="/docs/"', 'href="./index.html"')
    .replace(/\s*<link rel="modulepreload"[^>]*>/g, '')
    .replace(/\s*<script type="module"[^>]*>\s*/g, '')
  if (fixedHtml !== html) await writeFile(filePath, fixedHtml)
}

console.log(`ShotAI 门户静态目录已生成：${outputDirectory}`)
console.log('目录内包含门户、文档页面以及文档所需的 JS、CSS 和字体资源，可直接上传静态服务器。')
