/**
 * TTS（浏览器版）。神经 TTS（sherpa-onnx）是 Node 原生插件，网页端不可用，
 * 全部降级为 no-op/失败；UI 的音色回落逻辑（audio.ts defaultVoice）会自动用
 * 系统语音(Web Speech)。API TTS 经浏览器 fetch /audio/speech（移植自 tts.ts apiTts）。
 */
import type { TtsModelInfo } from '../../electron/preload/api.d'

const WEB_NEURAL_UNSUPPORTED = 'web 不支持神经 TTS，请用系统语音或 API 语音'

export function listModels(): Promise<TtsModelInfo[]> {
  return Promise.resolve([])
}

export function downloadModel(): Promise<{ ok: boolean; error?: string }> {
  return Promise.resolve({ ok: false, error: WEB_NEURAL_UNSUPPORTED })
}

export function cancelDownload(): Promise<void> {
  return Promise.resolve()
}

export function importModel(): Promise<{ ok: boolean; id?: string; error?: string }> {
  return Promise.resolve({ ok: false, error: WEB_NEURAL_UNSUPPORTED })
}

export function removeModel(): Promise<boolean> {
  return Promise.resolve(false)
}

export function load(): Promise<{ ok: boolean; numSpeakers?: number; error?: string }> {
  return Promise.resolve({ ok: false, error: WEB_NEURAL_UNSUPPORTED })
}

export function synthesize(): Promise<{ ok: boolean; wavBase64?: string; error?: string }> {
  return Promise.resolve({ ok: false, error: WEB_NEURAL_UNSUPPORTED })
}

export function onDownloadProgress(): () => void {
  return () => {}
}

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
    const buf = new Uint8Array(await res.arrayBuffer())
    let binary = ''
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
    return { ok: true, audioBase64: btoa(binary), mime: 'audio/mpeg' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
