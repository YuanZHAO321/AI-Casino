import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'
import { rename } from 'fs/promises'

// GitHub Pages 从 /docs 部署：输出目录即 docs。
const OUT_DIR = 'docs'

// 相对 base：不写死仓名，产物在任意子路径（GitHub Pages 项目页 user.github.io/<仓名>/）
// 与根路径下都能正确加载——便于以后改项目名。根路径部署可用 WEB_BASE=/ 覆盖。
const BASE = process.env.WEB_BASE ?? './'

/**
 * 入口 HTML 是 index.web.html（与 Electron 的 index.html 区分），但静态托管期望
 * 根路径返回 index.html。在 PWA 生成 SW 之前（closeBundle 按插件顺序串行）把产物
 * 改名，确保 precache 收录的是 index.html。
 */
function renameHtml(): Plugin {
  return {
    name: 'rename-web-html',
    closeBundle: async () => {
      try {
        await rename(resolve(__dirname, OUT_DIR, 'index.web.html'), resolve(__dirname, OUT_DIR, 'index.html'))
      } catch {
        /* 已是 index.html 或不存在 */
      }
    }
  }
}

export default defineConfig({
  root: __dirname,
  base: BASE,
  publicDir: resolve(__dirname, 'assets'),
  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
  },
  plugins: [
    react(),
    renameHtml(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/web',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: null, // 手动经 virtual:pwa-register 注册（见 src/web/main.tsx）
      includeAssets: ['textures/felt.png', 'textures/card-back.png', 'textures/ambience.png'],
      manifest: {
        name: 'AI Casino — AI 陪玩赌场',
        short_name: 'AI Casino',
        description: 'AI 对手与陪玩的拟真赌场（21 点）',
        lang: 'zh',
        theme_color: '#0d1f17',
        background_color: '#0d1f17',
        display: 'standalone',
        orientation: 'any',
        // 绝对路径 = base，安装后 scope/起始页锁定到部署子路径
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,woff2}'],
        // 用户资产由 SW 的 /casino-asset 路由按需缓存，不进 precache
        globIgnores: ['**/casino-asset/**'],
        // 毡面/牌背纹理 ~3MB，提高上限以纳入离线 precache
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      },
      devOptions: { enabled: true, type: 'module' }
    })
  ],
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.web.html')
    }
  }
})
