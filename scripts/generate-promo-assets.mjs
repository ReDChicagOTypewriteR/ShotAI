import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceDir = join(root, 'docs', 'images')
const outputDir = join(root, 'docs', 'promotions', 'assets')

const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;')

const dataUri = async (file, mime) => `data:${mime};base64,${(await readFile(join(sourceDir, file))).toString('base64')}`

const textBlock = (lines, x, y, size, options = {}) => {
  const { fill = '#f4f7f8', weight = 500, lineGap = Math.round(size * 1.35), anchor = 'start', opacity = 1 } = options
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" font-size="${size}px" font-weight="${weight}" text-anchor="${anchor}" opacity="${opacity}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineGap : 0}">${esc(line)}</tspan>`).join('')}</text>`
}

const baseSvg = ({ width, height, kicker, title, subtitle, footer, visual = '', titleSize = 84 }) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07090b"/><stop offset="1" stop-color="#11171a"/></linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#74f7c5" stop-opacity="0"/><stop offset="0.5" stop-color="#74f7c5"/><stop offset="1" stop-color="#74f7c5" stop-opacity="0"/></linearGradient>
    <pattern id="grid" width="54" height="54" patternUnits="userSpaceOnUse"><path d="M54 0H0V54" fill="none" stroke="#dce7e9" stroke-opacity="0.045"/></pattern>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="22" stdDeviation="22" flood-color="#000" flood-opacity="0.5"/></filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#grid)"/>
  <path d="M64 134H${width - 64}" stroke="#cfd8da" stroke-opacity="0.16"/>
  <circle cx="${width - 92}" cy="72" r="6" fill="#74f7c5"/>
  ${textBlock([kicker], 64, 88, Math.max(18, Math.round(width / 72)), { fill: '#8d9a9f', weight: 700 })}
  ${textBlock(title, 64, 258, titleSize, { weight: 800, lineGap: Math.round(titleSize * 1.14) })}
  ${subtitle ? textBlock(subtitle, 68, Math.max(380, 258 + (title.length - 1) * Math.round(titleSize * 1.14) + titleSize + 36), Math.max(22, Math.round(width / 48)), { fill: '#aeb9bc', lineGap: Math.max(34, Math.round(width / 36)) }) : ''}
  ${visual}
  <rect x="64" y="${height - 112}" width="${width - 128}" height="2" fill="url(#accent)"/>
  ${textBlock([footer], 64, height - 62, Math.max(18, Math.round(width / 74)), { fill: '#849297', weight: 600 })}
</svg>`

const panel = (x, y, width, height, content, options = {}) => {
  const { radius = 22, fill = '#0b0f12', stroke = '#526067', opacity = 1 } = options
  return `<g filter="url(#shadow)"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2" opacity="${opacity}"/>${content}</g>`
}

const image = (href, x, y, width, height, preserve = 'xMidYMid meet', opacity = 1) => `<image href="${href}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="${preserve}" opacity="${opacity}"/>`

const buildVerticalCards = async () => {
  const hero = await dataUri('readme-hero.svg', 'image/svg+xml')
  const network = await dataUri('readme-network.svg', 'image/svg+xml')
  const capabilities = await dataUri('readme-capabilities.svg', 'image/svg+xml')
  const preview = await dataUri('shotai-product-preview.png', 'image/png')
  const cards = []

  cards.push(baseSvg({
    width: 1242,
    height: 1660,
    kicker: 'SHOTAI / LOCAL-FIRST AI WORKBENCH',
    title: ['一台主机', '多台电脑直接用'],
    subtitle: ['本地 AI · 可信局域网', '把模型、文件、资料和图片能力放进一个工作台'],
    footer: 'ShotAI 1.1.6  ·  Windows 主机  ·  浏览器客户端',
    visual: panel(70, 700, 1102, 650, image(hero, 92, 722, 1058, 604, 'xMidYMid meet')),
    titleSize: 96
  }))

  cards.push(baseSvg({
    width: 1242,
    height: 1660,
    kicker: '01 / WHY',
    title: ['本地 AI 最麻烦的', '不是第一台电脑'],
    subtitle: ['是第二台、第三台。', '重复安装、重复下载、重复排错。'],
    footer: '把部署单位从“每台电脑”换成“一台主机”',
    visual: `<g opacity="0.9">${[0, 1, 2].map((i) => panel(98 + i * 330, 720 - i * 32, 270, 360, `${textBlock(['电脑', String.fromCharCode(65 + i)], 233 + i * 330, 850 - i * 32, 32, { anchor: 'middle', weight: 800 })}${textBlock(['运行时', '模型', '配置'], 233 + i * 330, 960 - i * 32, 22, { anchor: 'middle', fill: '#95a2a7', lineGap: 38 })}${textBlock(['重复安装'], 233 + i * 330, 1160 - i * 32, 24, { anchor: 'middle', fill: '#ff8e8e', weight: 700 })}`)).join('')}</g>`,
    titleSize: 80
  }))

  cards.push(baseSvg({
    width: 1242,
    height: 1660,
    kicker: '02 / LAN ARCHITECTURE',
    title: ['模型和计算', '集中在主机'],
    subtitle: ['其他电脑只需要浏览器。', 'ShotAI 通过 9090 统一提供网页和本地服务代理。'],
    footer: '浏览器 → ShotAI:9090 → Ollama / Image Engine',
    visual: panel(70, 680, 1102, 680, image(network, 92, 710, 1058, 620, 'xMidYMid meet')),
    titleSize: 86
  }))

  cards.push(baseSvg({
    width: 1242,
    height: 1660,
    kicker: '03 / WORKBENCH',
    title: ['不想再开五个工具', '所以做成一个工作台'],
    subtitle: ['对话、文件、模型和图片创作', '从同一个入口开始。'],
    footer: '真实工作台界面 / 黑白工业风',
    visual: panel(70, 650, 1102, 720, image(preview, 92, 672, 1058, 676, 'xMidYMid meet')),
    titleSize: 76
  }))

  cards.push(baseSvg({
    width: 1242,
    height: 1660,
    kicker: '04 / FILES',
    title: ['把文件放进来', '直接问'],
    subtitle: ['TXT / Markdown / PDF / DOCX / Excel', '少一次复制粘贴，多一次直接工作。'],
    footer: '文件在浏览器中解析，再交给主机上的本地模型',
    visual: panel(92, 720, 1058, 470, `${textBlock(['PDF'], 240, 900, 44, { anchor: 'middle', weight: 800 })}${textBlock(['DOCX'], 620, 900, 44, { anchor: 'middle', weight: 800 })}${textBlock(['XLSX'], 1000, 900, 44, { anchor: 'middle', weight: 800, fill: '#74f7c5' })}${[240, 620, 1000].map((x) => `<rect x="${x - 112}" y="800" width="224" height="210" rx="16" fill="#151c20" stroke="#526067"/><path d="M${x - 70} 1050h140" stroke="#74f7c5" stroke-opacity="0.5" stroke-width="3"/>`).join('')}`),
    titleSize: 90
  }))

  cards.push(baseSvg({
    width: 1242,
    height: 1660,
    kicker: '05 / LOCAL RETRIEVAL',
    title: ['不只给答案', '还告诉你参考了哪份资料'],
    subtitle: ['有 Embedding 走向量检索，', '没有时也能回退到关键词检索。'],
    footer: '引用是检索过程的展示，不等同于独立事实核验',
    visual: panel(88, 700, 1066, 570, `${textBlock(['回答内容'], 140, 820, 28, { fill: '#dfe7e9', weight: 700 })}${textBlock(['这是基于本地资料整理出的回答。'], 140, 890, 25, { fill: '#aab7bb' })}${textBlock(['参考来源'], 140, 1000, 25, { fill: '#74f7c5', weight: 700 })}${['项目说明.pdf  ·  第 03 节', '内部手册.docx  ·  第 12 页', '数据表格.xlsx  ·  Sheet1'].map((line, index) => `${textBlock([line], 150, 1065 + index * 58, 23, { fill: '#e1e8ea' })}<circle cx="112" cy="${1058 + index * 58}" r="5" fill="#74f7c5"/>`).join('')}`),
    titleSize: 72
  }))

  cards.push(baseSvg({
    width: 1242,
    height: 1660,
    kicker: '06 / VISION + CREATE',
    title: ['识图和生图', '都在同一个工作台里'],
    subtitle: ['上传图片让视觉模型分析，', '也可以调用本地图片组件生成或修改。'],
    footer: '普通对话、视觉、Embedding、图片模型按任务分工',
    visual: panel(70, 690, 1102, 650, image(capabilities, 92, 712, 1058, 606, 'xMidYMid meet')),
    titleSize: 82
  }))

  cards.push(baseSvg({
    width: 1242,
    height: 1660,
    kicker: '07 / HOST & CLIENT',
    title: ['主机负责模型', '其他电脑负责使用'],
    subtitle: ['默认只有主机能添加、删除和重载模型。', '内网浏览器主要负责提交任务。'],
    footer: '这不是完整账号权限系统，而是清晰的默认边界',
    visual: (() => {
      const host = `${textBlock(['HOST'], 310, 840, 24, { anchor: 'middle', fill: '#74f7c5', weight: 800 })}${textBlock(['模型管理', '运行组件', '9090 服务'], 310, 920, 28, { anchor: 'middle', lineGap: 48 })}`
      const clients = `${textBlock(['CLIENTS'], 932, 840, 24, { anchor: 'middle', fill: '#b7c1c4', weight: 800 })}${textBlock(['浏览器访问', '发起任务', '查看结果'], 932, 920, 28, { anchor: 'middle', lineGap: 48 })}`
      return `${panel(95, 720, 430, 390, host)}${panel(717, 720, 430, 390, clients)}${textBlock(['主机  ───────────  内网浏览器'], 621, 1230, 26, { anchor: 'middle', fill: '#74f7c5', weight: 700 })}`
    })(),
    titleSize: 82
  }))

  cards.push(baseSvg({
    width: 1242,
    height: 1660,
    kicker: '08 / HONEST BETA',
    title: ['Beta 版本', '适合可信局域网'],
    subtitle: ['没有账号、HTTPS、审计日志和多人任务队列。', '模型需要自己准备，不要把 9090 暴露到公网。'],
    footer: '把边界写清楚，比把它叫“AI 神器”更重要',
    visual: panel(100, 720, 1042, 420, `${['没有账号 / HTTPS / 审计', '记录默认保存在当前浏览器', '没有多人任务队列和显存配额', '模型权重不随仓库提供'].map((line, index) => `${textBlock([line], 210, 820 + index * 72, 27, { fill: index === 0 ? '#ffb0b0' : '#dce5e7', weight: 650 })}<circle cx="155" cy="${810 + index * 72}" r="6" fill="${index === 0 ? '#ff8e8e' : '#74f7c5'}"/>`).join('')}`),
    titleSize: 90
  }))

  return cards
}

const buildLandscapeCards = async () => {
  const hero = await dataUri('readme-hero.svg', 'image/svg+xml')
  const network = await dataUri('readme-network.svg', 'image/svg+xml')
  const capabilities = await dataUri('readme-capabilities.svg', 'image/svg+xml')
  const preview = await dataUri('shotai-product-preview.png', 'image/png')
  return [
    baseSvg({
      width: 1600,
      height: 900,
      kicker: 'SHOTAI 1.1.6 / LAN-FIRST LOCAL AI WORKBENCH',
      title: ['一台主机，', '所有人直接使用'],
      subtitle: ['Vue 3 + Electron + Ollama', '把本地模型从单机聊天做成局域网工作台。'],
      footer: '掘金配图 01 / 产品定位',
      visual: panel(820, 170, 680, 510, image(hero, 842, 192, 636, 466, 'xMidYMid meet')),
      titleSize: 82
    }),
    baseSvg({
      width: 1600,
      height: 900,
      kicker: 'ARCHITECTURE / SAME-ORIGIN PROXY',
      title: ['浏览器只访问一个地址', '主机统一代理本地能力'],
      subtitle: ['/ollama/ → Ollama  ·  /image/ → 图片运行组件'],
      footer: '掘金配图 02 / 9090 同源代理',
      visual: panel(110, 470, 1380, 330, image(network, 132, 492, 1336, 286, 'xMidYMid meet')),
      titleSize: 64
    }),
    baseSvg({
      width: 1600,
      height: 900,
      kicker: 'WORKBENCH / REAL UI',
      title: ['对话、文件、模型、图片', '从同一个入口开始'],
      subtitle: ['减少重复部署，也减少用户理解运行时的成本。'],
      footer: '掘金配图 03 / 工作台',
      visual: panel(820, 170, 680, 510, image(preview, 842, 192, 636, 466, 'xMidYMid meet')),
      titleSize: 70
    }),
    baseSvg({
      width: 1600,
      height: 900,
      kicker: 'TASK ROUTING / LOCAL CAPABILITIES',
      title: ['按任务分工', '而不是让用户切模型'],
      subtitle: ['聊天 · 视觉 · Embedding · 图片生成'],
      footer: '掘金配图 04 / 能力分工',
      visual: panel(100, 470, 1400, 320, image(capabilities, 122, 492, 1356, 276, 'xMidYMid meet')),
      titleSize: 72
    })
  ]
}

const renderPng = async (browser, svg, outputPath, width, height) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.setContent(`<html><body style="margin:0;background:#07090b">${svg}</body></html>`)
  await page.screenshot({ path: outputPath, type: 'png' })
  await page.close()
}

await mkdir(outputDir, { recursive: true })
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const verticalCards = await buildVerticalCards()
  for (const [index, svg] of verticalCards.entries()) {
    await writeFile(join(outputDir, `xiaohongshu-${String(index + 1).padStart(2, '0')}.svg`), svg)
    await renderPng(browser, svg, join(outputDir, `xiaohongshu-${String(index + 1).padStart(2, '0')}.png`), 1242, 1660)
  }
  const landscapeCards = await buildLandscapeCards()
  for (const [index, svg] of landscapeCards.entries()) {
    await writeFile(join(outputDir, `juejin-${String(index + 1).padStart(2, '0')}.svg`), svg)
    await renderPng(browser, svg, join(outputDir, `juejin-${String(index + 1).padStart(2, '0')}.png`), 1600, 900)
  }
} finally {
  await browser.close()
}

console.log(`Generated ${9 + 4} SVG/PNG promotion assets in ${outputDir}`)
