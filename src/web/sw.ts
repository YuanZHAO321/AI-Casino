/// <reference lib="webworker" />
/**
 * Service Worker（vite-plugin-pwa injectManifest 模式）。
 * - precacheAndRoute：预缓存 app shell，离线可开。
 * - fetch 拦截 /casino-asset/*：从 casino-assets Cache 命中用户资产
 *   （头像/纹理/音乐），确保跨刷新与离线可加载。
 */
import { precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

precacheAndRoute(self.__WB_MANIFEST)
self.skipWaiting()
clientsClaim()

const ASSET_MARK = '/casino-asset/'
const ASSET_CACHE = 'casino-assets'

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)
  // 用子串匹配而非固定前缀：部署在子路径时 path 为 /<仓名>/casino-asset/...
  if (url.origin === self.location.origin && url.pathname.includes(ASSET_MARK)) {
    event.respondWith(
      caches
        .open(ASSET_CACHE)
        .then((cache) => cache.match(event.request))
        .then((res) => res ?? new Response('asset not found', { status: 404 }))
    )
  }
})
