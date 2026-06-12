import { dialog, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join, basename } from 'path'
import { load, save } from './storage'
import { assetPath } from './files'

/**
 * 数据导出/导入。
 * - 全量（'all'）：全部存储键 + custom 目录文件（纹理/头像），用于换设备。
 * - 部分（'api' / 'personas' / 'history' 任选）：导入时按 id 合并而非覆盖。
 * 不含 music 与 tts-models（体积大且可重新获取）。
 */

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

async function collectCustomFiles(filter?: (name: string) => boolean): Promise<BackupFile['customFiles']> {
  const out: BackupFile['customFiles'] = []
  const customDir = assetPath('custom')
  try {
    for (const name of await fs.readdir(customDir)) {
      if (filter && !filter(name)) continue
      const buf = await fs.readFile(join(customDir, name))
      if (buf.byteLength <= 20 * 1024 * 1024) out.push({ name, base64: buf.toString('base64') })
    }
  } catch {
    /* custom 目录不存在 */
  }
  return out
}

export async function exportData(
  win: BrowserWindow,
  sections: ExportSection[]
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const full = sections.includes('all')
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const tag = full ? 'full' : sections.join('+')
  const result = await dialog.showSaveDialog(win, {
    defaultPath: `ai-casino-${tag}-${stamp}.json`,
    filters: [{ name: 'AI Casino Backup', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return { ok: false, error: 'canceled' }
  try {
    const keys = full
      ? ALL_KEYS
      : sections.flatMap((s) => (s === 'all' ? [] : SECTION_KEYS[s]))
    const data: Record<string, unknown> = {}
    for (const key of keys) {
      const v = await load(key)
      if (v !== null) data[key] = v
    }
    // 自定义文件：全量带全部；含角色时带头像引用的文件
    let customFiles: BackupFile['customFiles'] = []
    if (full) {
      customFiles = await collectCustomFiles()
    } else if (sections.includes('personas')) {
      const personas = (data['personas'] as { avatar?: string }[]) ?? []
      const referenced = new Set(
        personas
          .map((p) => p.avatar)
          .filter((u): u is string => !!u)
          .map((u) => basename(new URL(u).pathname))
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
    await fs.writeFile(result.filePath, JSON.stringify(backup), 'utf8')
    return { ok: true, path: result.filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 按 id 合并数组（导入项覆盖同 id 旧项，新项追加） */
function mergeById<T extends { id?: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of existing) if (item?.id) map.set(item.id, item)
  for (const item of incoming) if (item?.id) map.set(item.id, item)
  return [...map.values()]
}

export async function importData(
  win: BrowserWindow
): Promise<{ ok: boolean; sections?: ExportSection[]; error?: string }> {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'AI Casino Backup', extensions: ['json'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return { ok: false, error: 'canceled' }
  try {
    const text = await fs.readFile(result.filePaths[0], 'utf8')
    const backup = JSON.parse(text) as Partial<BackupFile>
    if (backup.app !== 'ai-casino' || !backup.data || typeof backup.data !== 'object') {
      return { ok: false, error: '不是有效的 AI Casino 备份文件' }
    }
    const sections = Array.isArray(backup.sections) && backup.sections.length
      ? backup.sections
      : (['all'] as ExportSection[]) // 旧版备份按全量处理
    const full = sections.includes('all')

    if (full) {
      for (const key of ALL_KEYS) {
        if (key in backup.data) await save(key, backup.data[key])
      }
    } else {
      // 部分导入：按 id 合并
      const mergeKeys = ['profiles', 'personas', 'history', 'matches', 'reports', 'achievements']
      for (const key of mergeKeys) {
        if (!(key in backup.data)) continue
        const incoming = backup.data[key]
        if (!Array.isArray(incoming)) continue
        const existing = ((await load(key)) as { id?: string }[]) ?? []
        let merged = mergeById(existing, incoming as { id?: string }[])
        if (key === 'history') {
          merged = merged.sort(
            (a, b) =>
              ((a as { timestamp?: number }).timestamp ?? 0) -
              ((b as { timestamp?: number }).timestamp ?? 0)
          )
        }
        await save(key, merged)
      }
    }

    if (Array.isArray(backup.customFiles)) {
      const customDir = assetPath('custom')
      await fs.mkdir(customDir, { recursive: true })
      for (const f of backup.customFiles) {
        const name = basename(f.name) // 防路径穿越
        if (!name || typeof f.base64 !== 'string') continue
        await fs.writeFile(join(customDir, name), Buffer.from(f.base64, 'base64'))
      }
    }
    return { ok: true, sections }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
