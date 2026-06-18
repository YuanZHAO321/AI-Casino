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
    event.respondWith(serveAsset(event.request))
  }
})

async function serveAsset(req: Request): Promise<Response> {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(req)
  if (!cached) return new Response('asset not found', { status: 404 })

  // Safari 的 <audio>/<video> 会发 Range 请求，且要求服务端返回 206 才肯播放；
  // 否则缓存里的音乐导入成功也无法播放。这里据 Range 头切片返回 206。
  const range = req.headers.get('range')
  if (!range) return cached

  const buf = await cached.arrayBuffer()
  const total = buf.byteLength
  const m = /bytes=(\d*)-(\d*)/.exec(range)
  if (!m) return cached
  const start = m[1] ? parseInt(m[1], 10) : 0
  const end = m[2] ? parseInt(m[2], 10) : total - 1
  if (Number.isNaN(start) || start >= total) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${total}` }
    })
  }
  const last = Math.min(end, total - 1)
  const slice = buf.slice(start, last + 1)
  const headers = new Headers(cached.headers)
  headers.set('Content-Range', `bytes ${start}-${last}/${total}`)
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Content-Length', String(slice.byteLength))
  return new Response(slice, { status: 206, statusText: 'Partial Content', headers })
}
