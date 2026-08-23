import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'ShotAI 文档',
  description: 'ShotAI 本地与内网 AI 工作台使用说明',
  base: '/docs/',
  outDir: '../dist/docs',
  cleanUrls: false,
  themeConfig: {
    siteTitle: 'SHOTAI 文档',
    nav: [
      { text: '首页', link: '/' },
      { text: '开始使用', link: '/guide/' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '使用指南',
          items: [
            { text: '开始使用', link: '/guide/' },
            { text: '产品概览', link: '/guide/overview.html' },
            { text: '快速开始', link: '/guide/quick-start.html' },
            { text: '内网部署', link: '/guide/deployment.html' },
            { text: '常见问题', link: '/guide/faq.html' },
          ],
        },
      ],
    },
    outline: 'deep',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/ReDChicagOTypewriteR/ShotAI' },
    ],
    footer: {
      message: '在断网的孤岛中，我们仍能对话。',
      copyright: 'Copyright © 2026 ShotAI',
    },
  },
})
