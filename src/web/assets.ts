/**
 * 用户自定义文件（纹理/头像/音乐）存于 Cache Storage，替代 Electron 的
 * casino-asset:// 协议 + userData 文件。资产 URL 改为同源相对路径
 * /casino-asset/<dir>/<file>，<img>/<audio> 可直接加载，Service Worker
 * 拦截该前缀从 Cache 命中，确保跨刷新/离线可用（见 sw.ts）。
 */
import type { ImportResult } from '../../electron/preload/api.d'
import { pickFile } from './filepick'

// 相对前缀（无前导 /）：随文档 base 解析，部署在子路径 /<仓名>/ 下也正确。
// <img>/<audio> 用此相对 URL 时浏览器按文档基址解析；SW 按子串 /casino-asset/ 命中。
export const ASSET_PREFIX = 'casino-asset'
export const ASSET_CACHE = 'casino-assets'
const ROOT_DIRS = ['custom', 'music'] as const
export type AssetDir = (typeof ROOT_DIRS)[number]

// 同时给扩展名与 MIME：iOS「文件」App 据扩展名放行，只给 audio/* 时会被误导到
// 照片/视频选择器（用户只能选到 .mov）。扩展名 + audio/* 才能在 Files 里选到 mp3/wav。
const ACCEPT: Record<string, string> = {
  image: '.png,.jpg,.jpeg,.webp,.gif,image/*',
  audio: '.mp3,.m4a,.aac,.wav,.oga,.ogg,.flac,.opus,.weba,audio/*'
}

function makeFileName(original: string): string {
  const dot = original.lastIndexOf('.')
  const ext = dot >= 0 ? original.slice(dot) : ''
  const base = (dot >= 0 ? original.slice(0, dot) : original).replace(/[^\w一-龥-]+/g, '_')
  return `${Date.now()}-${base}${ext}`
}

export async function importFile(kind: 'image' | 'audio', dir: AssetDir): Promise<ImportResult> {
  const file = await pickFile(ACCEPT[kind] ?? '*/*')
  if (!file) return { ok: false, error: 'canceled' }
  try {
    const fileName = makeFileName(file.name)
    const path = `${ASSET_PREFIX}/${dir}/${fileName}`
    const cache = await caches.open(ASSET_CACHE)
    await cache.put(
      path,
      new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } })
    )
    return { ok: true, url: path, name: file.name }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

const MARK = '/casino-asset/'

export async function removeFile(url: string): Promise<boolean> {
  // url 可能是相对（'casino-asset/...'）或绝对（含 base）；只要包含标记即按原样删，
  // cache.delete 会按文档基址解析，与写入时一致。
  if (!url.includes('casino-asset/')) return false
  try {
    const cache = await caches.open(ASSET_CACHE)
    return await cache.delete(url)
  } catch {
    return false
  }
}

/** 写入资产（导入备份用）：rel 形如 custom/xxx.png */
export async function putAsset(rel: string, blob: Blob): Promise<void> {
  const cache = await caches.open(ASSET_CACHE)
  await cache.put(`${ASSET_PREFIX}/${rel}`, new Response(blob))
}

/** 列出 custom 目录的资产名（导出备份用） */
export async function listCustom(): Promise<string[]> {
  try {
    const cache = await caches.open(ASSET_CACHE)
    const marker = `${MARK}custom/` // '/casino-asset/custom/'，base 无关
    const names: string[] = []
    for (const req of await cache.keys()) {
      const path = new URL(req.url).pathname
      const i = path.indexOf(marker)
      if (i >= 0) names.push(path.slice(i + marker.length))
    }
    return names
  } catch {
    return []
  }
}

/** 读取 custom 资产为 Blob（导出备份用） */
export async function readCustom(name: string): Promise<Blob | null> {
  try {
    const cache = await caches.open(ASSET_CACHE)
    const res = await cache.match(`${ASSET_PREFIX}/custom/${name}`)
    return res ? await res.blob() : null
  } catch {
    return null
  }
}
