import { app } from 'electron'
import { promises as fs } from 'fs'
import { join, dirname } from 'path'

/**
 * 简单 JSON 持久化：userData/casino-data/<key>.json
 * keys: settings | profiles | personas | history | achievements | memories | reports
 */

const VALID_KEY = /^[a-z][a-z0-9-]*$/

function fileFor(key: string): string {
  if (!VALID_KEY.test(key)) throw new Error(`非法存储 key: ${key}`)
  return join(app.getPath('userData'), 'casino-data', `${key}.json`)
}

export async function load(key: string): Promise<unknown> {
  try {
    const text = await fs.readFile(fileFor(key), 'utf8')
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function save(key: string, value: unknown): Promise<void> {
  const file = fileFor(key)
  await fs.mkdir(dirname(file), { recursive: true })
  // 先写临时文件再原子改名，避免写一半损坏
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tmp, file)
}
