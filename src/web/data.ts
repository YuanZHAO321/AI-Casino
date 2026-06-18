/**
 * 数据导出/导入（浏览器版）。逻辑移植自 electron/main/dataTransfer.ts：
 * - 全量('all')：全部存储键 + custom 资产（头像/纹理）。
 * - 部分('api'/'personas'/'history')：导入时按 id 合并。
 * 导出 = 触发浏览器下载；导入 = <input type=file> 读取。
 * 不含 music/tts-models（体积大且可重新获取）。
 */
import { idbGet, idbSet } from './idb'
import { listCustom, readCustom, putAsset } from './assets'
import { pickFile } from './filepick'

export type ExportSection = 'all' | 'api' | 'personas' | 'history'

const ALL_KEYS = [
  'settings', 'profiles', 'personas', 'history', 'matches',
  'achievements', 'reports', 'memories', 'shoe'
] as const

const SECTION_KEYS: Record<Exclude<ExportSection, 'all'>, readonly string[]> = {
  api: ['profiles'],
  personas: ['personas'],
  history: ['history', 'matches', 'achievements', 'reports']
}

interface BackupFile {
  app: 'ai-casino'
  version: number
  exportedAt: number
  sections: ExportSection[]
  data: Record<string, unknown>
  customFiles: { name: string; base64: string }[]
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

function base64ToBlob(b64: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes])
}

async function collectCustomFiles(filter?: (name: string) => boolean): Promise<BackupFile['customFiles']> {
  const out: BackupFile['customFiles'] = []
  for (const name of await listCustom()) {
    if (filter && !filter(name)) continue
    const blob = await readCustom(name)
    if (blob && blob.size <= 20 * 1024 * 1024) out.push({ name, base64: await blobToBase64(blob) })
  }
  return out
}

function pathBasename(url: string): string {
  try {
    return decodeURIComponent(new URL(url, location.origin).pathname.split('/').pop() ?? '')
  } catch {
    return url.split('/').pop() ?? ''
  }
}

export async function exportData(
  sections: ExportSection[]
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const full = sections.includes('all')
    const keys = full ? ALL_KEYS : sections.flatMap((s) => (s === 'all' ? [] : SECTION_KEYS[s]))
    const data: Record<string, unknown> = {}
    for (const key of keys) {
      const v = await idbGet(key)
      if (v !== null) data[key] = v
    }
    let customFiles: BackupFile['customFiles'] = []
    if (full) {
      customFiles = await collectCustomFiles()
    } else if (sections.includes('personas')) {
      const personas = (data['personas'] as { avatar?: string }[]) ?? []
      const referenced = new Set(
        personas.map((p) => p.avatar).filter((u): u is string => !!u).map(pathBasename)
      )
      customFiles = await collectCustomFiles((name) => referenced.has(name))
    }
    const backup: BackupFile = {
      app: 'ai-casino',
      version: 3,
      exportedAt: Date.now(),
      sections: full ? ['all'] : sections,
      data,
      customFiles
    }
    const d = new Date()
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const tag = full ? 'full' : sections.join('+')
    const fileName = `ai-casino-${tag}-${stamp}.json`
    triggerDownload(new Blob([JSON.stringify(backup)], { type: 'application/json' }), fileName)
    return { ok: true, path: fileName }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 按 id 合并数组（导入项覆盖同 id 旧项，新项追加） */
function mergeById<T extends { id?: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of existing) if (item?.id) map.set(item.id, item)
  for (const item of incoming) if (item?.id) map.set(item.id, item)
  return [...map.values()]
}

export async function importData(): Promise<{ ok: boolean; sections?: ExportSection[]; error?: string }> {
  const file = await pickFile('application/json,.json')
  if (!file) return { ok: false, error: 'canceled' }
  try {
    const backup = JSON.parse(await file.text()) as Partial<BackupFile>
    if (backup.app !== 'ai-casino' || !backup.data || typeof backup.data !== 'object') {
      return { ok: false, error: '不是有效的 AI Casino 备份文件' }
    }
    const sections =
      Array.isArray(backup.sections) && backup.sections.length
        ? backup.sections
        : (['all'] as ExportSection[]) // 旧版备份按全量处理
    const full = sections.includes('all')

    if (full) {
      for (const key of ALL_KEYS) {
        if (key in backup.data) await idbSet(key, backup.data[key])
      }
    } else {
      const mergeKeys = ['profiles', 'personas', 'history', 'matches', 'reports', 'achievements']
      for (const key of mergeKeys) {
        if (!(key in backup.data)) continue
        const incoming = backup.data[key]
        if (!Array.isArray(incoming)) continue
        const existing = ((await idbGet(key)) as { id?: string }[]) ?? []
        let merged = mergeById(existing, incoming as { id?: string }[])
        if (key === 'history') {
          merged = merged.sort(
            (a, b) =>
              ((a as { timestamp?: number }).timestamp ?? 0) -
              ((b as { timestamp?: number }).timestamp ?? 0)
          )
        }
        await idbSet(key, merged)
      }
    }

    if (Array.isArray(backup.customFiles)) {
      for (const f of backup.customFiles) {
        const name = pathBasename(f.name) // 防路径穿越
        if (!name || typeof f.base64 !== 'string') continue
        await putAsset(`custom/${name}`, base64ToBlob(f.base64))
      }
    }
    return { ok: true, sections }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
