/** BGM 播放器（单例 Audio）与 TTS 语音队列 */
import { Persona, VoiceConfig, ApiProfile } from '@/core/types'
import { BgmTrack } from './presets'

/* ---------------- BGM ---------------- */

let bgm: HTMLAudioElement | null = null
let currentTrackId: string | null = null

export function playBgm(
  track: BgmTrack,
  volume: number,
  loop: boolean,
  onEnded?: () => void
): void {
  stopBgm()
  bgm = new Audio(track.url)
  bgm.volume = volume
  bgm.loop = loop
  if (onEnded) bgm.onended = onEnded
  currentTrackId = track.id
  void bgm.play().catch(() => {
    currentTrackId = null
  })
}

export function stopBgm(): void {
  bgm?.pause()
  bgm = null
  currentTrackId = null
}

export function setBgmVolume(v: number): void {
  if (bgm) bgm.volume = v
}

export function playingTrackId(): string | null {
  return bgm && !bgm.paused ? currentTrackId : null
}

/* ---------------- 移动端音频解锁 ---------------- */

// iOS/Safari 自动播放策略：未经用户手势，audio.play() 与 speechSynthesis 会被静默拦截。
// 在首个手势里 resume AudioContext + 播一段静音 + 预热语音，之后程序化播放才生效。
let audioCtx: AudioContext | null = null
let audioUnlocked = false

export function installAudioUnlock(): void {
  if (typeof window === 'undefined' || audioUnlocked) return
  const events = ['pointerdown', 'touchend', 'keydown'] as const
  const unlock = (): void => {
    if (audioUnlocked) return
    audioUnlocked = true
    try {
      const Ctx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctx) {
        audioCtx = audioCtx ?? new Ctx()
        void audioCtx.resume()
        const src = audioCtx.createBufferSource()
        src.buffer = audioCtx.createBuffer(1, 1, 22050)
        src.connect(audioCtx.destination)
        src.start(0)
      }
    } catch {
      /* 不支持则忽略 */
    }
    try {
      const synth = window.speechSynthesis
      if (synth) {
        synth.resume()
        const warm = new SpeechSynthesisUtterance('')
        warm.volume = 0
        synth.speak(warm)
      }
    } catch {
      /* ignore */
    }
    events.forEach((e) => window.removeEventListener(e, unlock))
  }
  events.forEach((e) => window.addEventListener(e, unlock, { passive: true }))
}

/* ---------------- TTS 队列 ---------------- */

interface SpeechItem {
  text: string
  voice: VoiceConfig
  volume: number
  neuralModel?: string
  preferredEngine?: 'neural' | 'system'
  getProfile: (id: string) => ApiProfile | undefined
}

const queue: SpeechItem[] = []
let speaking = false

export interface SpeechOpts {
  volume: number
  neuralModel?: string
  /** 全局首选引擎（未单独配音色的角色用它） */
  preferredEngine: 'neural' | 'system'
  getProfile: (id: string) => ApiProfile | undefined
}

/** 全局默认音色：首选神经且模型已装 → 神经 sid 0，否则系统默认 */
export function defaultVoice(opts: Pick<SpeechOpts, 'preferredEngine' | 'neuralModel'>): VoiceConfig {
  return opts.preferredEngine === 'neural' && opts.neuralModel
    ? { engine: 'neural', voice: '0' }
    : { engine: 'system' }
}

export function enqueueSpeech(persona: Persona, text: string, opts: SpeechOpts): void {
  // 未配置音色 → 用全局默认；显式设为 off → 保持静音
  const voice = persona.voice ?? defaultVoice(opts)
  if (voice.engine === 'off' || !text.trim()) return
  queue.push({ text: text.slice(0, 400), voice, ...opts })
  if (queue.length > 6) queue.shift() // 防积压
  void pump()
}

export function clearSpeechQueue(): void {
  queue.length = 0
  window.speechSynthesis?.cancel()
}

async function pump(): Promise<void> {
  if (speaking) return
  const item = queue.shift()
  if (!item) return
  speaking = true
  try {
    await speak(item)
  } catch {
    /* 单条失败不影响队列 */
  }
  speaking = false
  void pump()
}

async function speak(item: SpeechItem): Promise<void> {
  const { voice } = item
  if (voice.engine === 'system') {
    await speakSystem(item)
  } else if (voice.engine === 'neural' && item.neuralModel) {
    const sid = Number(voice.voice ?? 0) || 0
    const res = await window.casino.tts.synthesize(item.neuralModel, item.text, sid, 1.0)
    if (res.ok && res.wavBase64) await playBase64(res.wavBase64, 'audio/wav', item.volume)
  } else if (voice.engine === 'api' && voice.apiProfileId) {
    const profile = item.getProfile(voice.apiProfileId)
    if (!profile) return
    const res = await window.casino.tts.api({
      baseURL: profile.baseURL,
      apiKey: profile.apiKey,
      model: voice.apiModel || 'tts-1',
      voice: voice.voice || 'alloy',
      input: item.text
    })
    if (res.ok && res.audioBase64) await playBase64(res.audioBase64, res.mime ?? 'audio/mpeg', item.volume)
  }
}

/** getVoices() 首帧常为空，需等 voiceschanged；带超时兜底，避免永久挂起 */
function ensureVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis
  if (!synth) return Promise.resolve([])
  const v = synth.getVoices()
  if (v.length) return Promise.resolve(v)
  return new Promise((resolve) => {
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      resolve(synth.getVoices())
    }
    synth.addEventListener?.('voiceschanged', finish, { once: true })
    setTimeout(finish, 1000)
  })
}

async function speakSystem(item: SpeechItem): Promise<void> {
  const synth = window.speechSynthesis
  if (!synth) return
  const voices = await ensureVoices()
  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(item.text)
    u.volume = item.volume
    const v = voices.find((x) => x.name === item.voice.voice)
    if (v) u.voice = v // 找不到指定音色就用系统默认
    u.onend = () => resolve()
    u.onerror = () => resolve()
    synth.speak(u)
  })
}

function playBase64(b64: string, mime: string, volume: number): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(`data:${mime};base64,${b64}`)
    audio.volume = volume
    audio.onended = () => resolve()
    audio.onerror = () => resolve()
    void audio.play().catch(() => resolve())
  })
}

export function systemVoices(): { name: string; lang: string }[] {
  const synth = window.speechSynthesis
  if (!synth) return []
  return synth.getVoices().map((v) => ({ name: v.name, lang: v.lang }))
}
