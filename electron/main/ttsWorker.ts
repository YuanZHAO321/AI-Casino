/**
 * 神经 TTS 工作进程（ELECTRON_RUN_AS_NODE fork）。
 * 在独立进程中加载 sherpa-onnx 模型并合成，避免阻塞主进程。
 * 协议：process IPC 消息
 *   in : { id, cmd: 'load', modelDir, modelType }
 *   in : { id, cmd: 'synth', text, sid, speed, outPath }
 *   out: { id, ok, error?, numSpeakers?, sampleRate? }
 */
import { join } from 'path'
import { existsSync } from 'fs'

interface LoadMsg { id: number; cmd: 'load'; modelDir: string; modelType: 'kokoro' | 'vits' }
interface SynthMsg { id: number; cmd: 'synth'; text: string; sid: number; speed: number; outPath: string }
type InMsg = LoadMsg | SynthMsg

/* eslint-disable @typescript-eslint/no-explicit-any */
let sherpa: any = null
let tts: any = null

function buildConfig(modelDir: string, modelType: 'kokoro' | 'vits'): unknown {
  if (modelType === 'kokoro') {
    const lexicons = ['lexicon-us-en.txt', 'lexicon-zh.txt']
      .map((f) => join(modelDir, f))
      .filter((p) => existsSync(p))
      .join(',')
    return {
      model: {
        kokoro: {
          model: join(modelDir, 'model.onnx'),
          voices: join(modelDir, 'voices.bin'),
          tokens: join(modelDir, 'tokens.txt'),
          dataDir: join(modelDir, 'espeak-ng-data'),
          dictDir: existsSync(join(modelDir, 'dict')) ? join(modelDir, 'dict') : '',
          lexicon: lexicons
        },
        debug: false,
        numThreads: 2,
        provider: 'cpu'
      },
      maxNumSentences: 1
    }
  }
  return {
    model: {
      vits: {
        model: join(modelDir, 'model.onnx'),
        lexicon: existsSync(join(modelDir, 'lexicon.txt')) ? join(modelDir, 'lexicon.txt') : '',
        tokens: join(modelDir, 'tokens.txt'),
        dataDir: existsSync(join(modelDir, 'espeak-ng-data')) ? join(modelDir, 'espeak-ng-data') : '',
        dictDir: existsSync(join(modelDir, 'dict')) ? join(modelDir, 'dict') : ''
      },
      debug: false,
      numThreads: 2,
      provider: 'cpu'
    },
    maxNumSentences: 2
  }
}

process.on('message', (msg: InMsg) => {
  try {
    if (msg.cmd === 'load') {
      sherpa ??= require('sherpa-onnx-node')
      tts = new sherpa.OfflineTts(buildConfig(msg.modelDir, msg.modelType))
      process.send!({ id: msg.id, ok: true, numSpeakers: tts.numSpeakers ?? 1 })
    } else if (msg.cmd === 'synth') {
      if (!tts) throw new Error('模型未加载')
      const audio = tts.generate({ text: msg.text, sid: msg.sid, speed: msg.speed })
      sherpa.writeWave(msg.outPath, { samples: audio.samples, sampleRate: audio.sampleRate })
      process.send!({ id: msg.id, ok: true, sampleRate: audio.sampleRate })
    }
  } catch (err) {
    process.send!({ id: (msg as InMsg).id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})
