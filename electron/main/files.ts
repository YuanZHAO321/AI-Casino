import { app, dialog, protocol, net, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join, extname, basename, normalize } from 'path'
import { pathToFileURL } from 'url'

/**
 * 用户自定义文件（纹理/头像/音乐/TTS模型）统一存 userData 下，
 * 渲染层通过 casino-asset://<相对路径> 访问。
 */

const ROOT_DIRS = ['custom', 'music', 'tts-models'] as const
export type AssetDir = (typeof ROOT_DIRS)[number]

function assetRoot(): string {
  return join(app.getPath('userData'), 'casino-files')
}

export function registerAssetProtocol(): void {
  protocol.handle('casino-asset', (req) => {
    const url = new URL(req.url)
    // casino-asset://custom/xxx.png → host=custom, pathname=/xxx.png
    const rel = normalize(join(url.host, decodeURIComponent(url.pathname))).replace(/^([/\\])+/, '')
    if (rel.includes('..')) return new Response('forbidden', { status: 403 })
    const top = rel.split(/[/\\]/)[0] as AssetDir
    if (!ROOT_DIRS.includes(top)) return new Response('forbidden', { status: 403 })
    const file = join(assetRoot(), rel)
    return net.fetch(pathToFileURL(file).toString())
  })
}

const IMPORT_FILTERS: Record<string, Electron.FileFilter[]> = {
  image: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  audio: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'] }],
  'tts-model': [{ name: 'TTS Model', extensions: ['bz2', 'gz', 'tar', 'onnx'] }]
}

/** 弹文件选择框并拷入 userData，返回 casino-asset URL */
export async function importFile(
  win: BrowserWindow | null,
  kind: 'image' | 'audio',
  dir: AssetDir
): Promise<{ ok: boolean; url?: string; name?: string; error?: string }> {
  const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
    properties: ['openFile'],
    filters: IMPORT_FILTERS[kind]
  })
  if (result.canceled || result.filePaths.length === 0) return { ok: false, error: 'canceled' }
  const src = result.filePaths[0]
  try {
    const destDir = join(assetRoot(), dir)
    await fs.mkdir(destDir, { recursive: true })
    const ext = extname(src)
    const name = basename(src, ext)
    const fileName = `${Date.now()}-${name.replace(/[^\w一-龥-]+/g, '_')}${ext}`
    await fs.copyFile(src, join(destDir, fileName))
    return { ok: true, url: `casino-asset://${dir}/${fileName}`, name: basename(src) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 删除 casino-asset URL 对应的文件 */
export async function removeAsset(url: string): Promise<boolean> {
  try {
    const u = new URL(url)
    if (u.protocol !== 'casino-asset:') return false
    const rel = normalize(join(u.host, decodeURIComponent(u.pathname))).replace(/^([/\\])+/, '')
    if (rel.includes('..') || !ROOT_DIRS.includes(rel.split(/[/\\]/)[0] as AssetDir)) return false
    await fs.unlink(join(assetRoot(), rel))
    return true
  } catch {
    return false
  }
}

export function assetPath(rel: string): string {
  return join(assetRoot(), rel)
}
