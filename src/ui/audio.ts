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

function speakSystem(item: SpeechItem): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    if (!synth) {
      resolve()
      return
    }
    const u = new SpeechSynthesisUtterance(item.text)
    u.volume = item.volume
    const v = synth.getVoices().find((x) => x.name === item.voice.voice)
    if (v) u.voice = v
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
