import { app, dialog, BrowserWindow } from 'electron'
import { fork, ChildProcess } from 'child_process'
import { spawn } from 'child_process'
import { promises as fs, createWriteStream, existsSync } from 'fs'
import { join, basename } from 'path'
import { assetPath } from './files'

/**
 * 神经 TTS（sherpa-onnx，工作进程） + OpenAI 兼容 TTS API + 模型下载/导入管理。
 * 模型存 userData/casino-files/tts-models/<modelId>/
 */

export interface NeuralModelInfo {
  id: string
  type: 'kokoro' | 'vits'
  /** 估算下载体积（MB），仅内置可下载模型有 */
  sizeMB?: number
  builtin: boolean
  installed: boolean
}

const DOWNLOADABLE: Record<string, { url: string; type: 'kokoro' | 'vits'; sizeMB: number }> = {
  'kokoro-multi-lang-v1_0': {
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2',
    type: 'kokoro',
    sizeMB: 305
  },
  'vits-melo-tts-zh_en': {
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-melo-tts-zh_en.tar.bz2',
    type: 'vits',
    sizeMB: 163
  }
}

function modelsRoot(): string {
  return assetPath('tts-models')
}

function detectType(dir: string): 'kokoro' | 'vits' | null {
  if (existsSync(join(dir, 'voices.bin'))) return 'kokoro'
  if (existsSync(join(dir, 'model.onnx'))) return 'vits'
  return null
}

export async function listModels(): Promise<NeuralModelInfo[]> {
  const out: NeuralModelInfo[] = []
  const root = modelsRoot()
  const installed = new Set<string>()
  try {
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const type = detectType(join(root, entry.name))
      if (type) {
        installed.add(entry.name)
        out.push({
          id: entry.name,
          type,
          builtin: entry.name in DOWNLOADABLE,
          sizeMB: DOWNLOADABLE[entry.name]?.sizeMB,
          installed: true
        })
      }
    }
  } catch {
    /* 目录不存在 */
  }
  for (const [id, info] of Object.entries(DOWNLOADABLE)) {
    if (!installed.has(id)) {
      out.push({ id, type: info.type, sizeMB: info.sizeMB, builtin: true, installed: false })
    }
  }
  return out
}

/* ---------------- 下载与导入 ---------------- */

let downloadAbort: AbortController | null = null

export async function downloadModel(
  win: BrowserWindow,
  modelId: string
): Promise<{ ok: boolean; error?: string }> {
  const info = DOWNLOADABLE[modelId]
  if (!info) return { ok: false, error: '未知模型' }
  const root = modelsRoot()
  await fs.mkdir(root, { recursive: true })
  const archive = join(root, `${modelId}.tar.bz2`)
  downloadAbort = new AbortController()
  try {
    const res = await fetch(info.url, { signal: downloadAbort.signal, redirect: 'follow' })
    if (!res.ok || !res.body) return { ok: false, error: `HTTP ${res.status}` }
    const total = Number(res.headers.get('content-length') ?? 0)
    let received = 0
    const file = createWriteStream(archive)
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      file.write(Buffer.from(value))
      win.webContents.send('tts:download-progress', { modelId, received, total })
    }
    await new Promise<void>((resolve, reject) => file.end((e?: Error) => (e ? reject(e) : resolve())))
    const extracted = await extractArchive(archive, root)
    await fs.unlink(archive).catch(() => {})
    if (!extracted) return { ok: false, error: '解压失败（需要系统 tar）' }
    return detectType(join(root, modelId)) ? { ok: true } : { ok: false, error: '模型文件不完整' }
  } catch (err) {
    await fs.unlink(archive).catch(() => {})
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    downloadAbort = null
  }
}

export function cancelDownload(): void {
  downloadAbort?.abort(new Error('已取消'))
}

function extractArchive(archive: string, dest: string): Promise<boolean> {
  // macOS 自带 bsdtar；Windows 10+ 自带 tar.exe
  return new Promise((resolve) => {
    const p = spawn('tar', ['-xf', archive, '-C', dest])
    p.on('error', () => resolve(false))
    p.on('exit', (code) => resolve(code === 0))
  })
}

/** 本地导入：选 .tar.bz2/.tar.gz 压缩包或已解压的模型文件夹（国内无梯子场景） */
export async function importLocalModel(
  win: BrowserWindow
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'openDirectory'],
    filters: [{ name: 'TTS 模型（压缩包或文件夹）', extensions: ['bz2', 'gz', 'tar', 'tgz'] }],
    message: '选择 sherpa-onnx TTS 模型压缩包（.tar.bz2）或已解压的模型文件夹'
  })
  if (result.canceled || result.filePaths.length === 0) return { ok: false, error: 'canceled' }
  const src = result.filePaths[0]
  const root = modelsRoot()
  await fs.mkdir(root, { recursive: true })
  try {
    const stat = await fs.stat(src)
    if (stat.isDirectory()) {
      const id = basename(src)
      if (!detectType(src)) return { ok: false, error: '该文件夹不是有效的 sherpa-onnx TTS 模型' }
      await fs.cp(src, join(root, id), { recursive: true })
      return { ok: true, id }
    }
    const before = new Set(await fs.readdir(root))
    if (!(await extractArchive(src, root))) return { ok: false, error: '解压失败' }
    const after = await fs.readdir(root)
    const fresh = after.find((n) => !before.has(n) && detectType(join(root, n)))
    return fresh ? { ok: true, id: fresh } : { ok: false, error: '压缩包内未找到有效模型' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function removeModel(modelId: string): Promise<boolean> {
  if (modelId.includes('..') || modelId.includes('/')) return false
  try {
    if (loadedModelId === modelId) shutdownWorker()
    await fs.rm(join(modelsRoot(), modelId), { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

/* ---------------- 工作进程与合成 ---------------- */

let worker: ChildProcess | null = null
let loadedModelId: string | null = null
let msgSeq = 0
const pending = new Map<number, (res: WorkerReply) => void>()

interface WorkerReply {
  id: number
  ok: boolean
  error?: string
  numSpeakers?: number
  sampleRate?: number
}

function workerPath(): string {
  return join(__dirname, 'ttsWorker.js')
}

function spawnWorker(): ChildProcess {
  const w = fork(workerPath(), [], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc']
  })
  w.on('message', (msg: WorkerReply) => {
    pending.get(msg.id)?.(msg)
    pending.delete(msg.id)
  })
  w.on('exit', () => {
    if (worker === w) {
      worker = null
      loadedModelId = null
      for (const resolve of pending.values()) resolve({ id: -1, ok: false, error: 'TTS 进程退出' })
      pending.clear()
    }
  })
  return w
}

function shutdownWorker(): void {
  worker?.kill()
  worker = null
  loadedModelId = null
}

function callWorker(msg: Record<string, unknown>, timeoutMs = 60000): Promise<WorkerReply> {
  return new Promise((resolve) => {
    if (!worker) {
      resolve({ id: -1, ok: false, error: 'worker 未启动' })
      return
    }
    const id = ++msgSeq
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve({ id, ok: false, error: 'TTS 超时' })
    }, timeoutMs)
    pending.set(id, (res) => {
      clearTimeout(timer)
      resolve(res)
    })
    worker.send({ ...msg, id })
  })
}

export async function ensureNeuralLoaded(
  modelId: string
): Promise<{ ok: boolean; numSpeakers?: number; error?: string }> {
  const dir = join(modelsRoot(), modelId)
  const type = detectType(dir)
  if (!type) return { ok: false, error: `模型 ${modelId} 未安装` }
  if (loadedModelId === modelId && worker) return { ok: true }
  try {
    shutdownWorker()
    worker = spawnWorker()
    const res = await callWorker({ cmd: 'load', modelDir: dir, modelType: type }, 120000)
    if (!res.ok) {
      shutdownWorker()
      return { ok: false, error: res.error }
    }
    loadedModelId = modelId
    return { ok: true, numSpeakers: res.numSpeakers }
  } catch (err) {
    shutdownWorker()
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function synthesizeNeural(
  modelId: string,
  text: string,
  sid: number,
  speed: number
): Promise<{ ok: boolean; wavBase64?: string; error?: string }> {
  const load = await ensureNeuralLoaded(modelId)
  if (!load.ok) return { ok: false, error: load.error }
  const outPath = join(app.getPath('temp'), `casino-tts-${Date.now()}.wav`)
  const res = await callWorker({ cmd: 'synth', text, sid, speed, outPath })
  if (!res.ok) return { ok: false, error: res.error }
  try {
    const wav = await fs.readFile(outPath)
    await fs.unlink(outPath).catch(() => {})
    return { ok: true, wavBase64: wav.toString('base64') }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/* ---------------- OpenAI 兼容 TTS API ---------------- */

export async function apiTts(req: {
  baseURL: string
  apiKey: string
  model: string
  voice: string
  input: string
}): Promise<{ ok: boolean; audioBase64?: string; mime?: string; error?: string }> {
  let url = req.baseURL.trim().replace(/\/+$/, '')
  if (!/\/v\d+$/.test(url)) url += '/v1'
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(new Error('TTS API 超时')), 30000)
    const res = await fetch(`${url}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.apiKey}`
      },
      body: JSON.stringify({
        model: req.model,
        voice: req.voice,
        input: req.input,
        response_format: 'mp3'
      }),
      signal: ctrl.signal
    })
    clearTimeout(timer)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return { ok: true, audioBase64: buf.toString('base64'), mime: 'audio/mpeg' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
