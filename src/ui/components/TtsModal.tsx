import React, { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Modal } from './Modal'
import { enqueueSpeech, defaultVoice } from '../audio'
import { TtsModelInfo } from '../../../electron/preload/api'

function useTtsModels(): [TtsModelInfo[], () => Promise<void>] {
  const [models, setModels] = useState<TtsModelInfo[]>([])
  const refresh = async (): Promise<void> => {
    setModels(await window.casino.tts.models())
  }
  useEffect(() => {
    void refresh()
  }, [])
  return [models, refresh]
}

export function TtsModal(): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const pushToast = useStore((s) => s.pushToast)
  const getProfile = useStore((s) => s.getProfile)
  const setModal = useStore((s) => s.setModal)
  const audio = settings.audio
  const [models, refresh] = useTtsModels()
  const [progress, setProgress] = useState<{ modelId: string; pct: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const patchAudio = (p: Partial<typeof audio>): void => updateSettings({ audio: { ...audio, ...p } })

  useEffect(() => {
    return window.casino.tts.onDownloadProgress((p) => {
      setProgress({ modelId: p.modelId, pct: p.total ? Math.round((p.received / p.total) * 100) : 0 })
    })
  }, [])

  const download = async (modelId: string): Promise<void> => {
    setBusy(true)
    setProgress({ modelId, pct: 0 })
    const res = await window.casino.tts.downloadModel(modelId)
    setBusy(false)
    setProgress(null)
    if (res.ok) {
      patchAudio({ neuralModel: modelId })
      await refresh()
    } else if (res.error !== 'canceled') {
      pushToast(`${t.errors.llm}: ${res.error}`, 'error')
    }
  }

  const importLocal = async (): Promise<void> => {
    setBusy(true)
    const res = await window.casino.tts.importModel()
    setBusy(false)
    if (res.ok && res.id) {
      patchAudio({ neuralModel: res.id })
      await refresh()
    } else if (res.error !== 'canceled') {
      pushToast(`${res.error}`, 'error')
    }
  }

  const remove = async (modelId: string): Promise<void> => {
    await window.casino.tts.removeModel(modelId)
    if (audio.neuralModel === modelId) patchAudio({ neuralModel: undefined })
    await refresh()
  }

  const test = (): void => {
    const opts = {
      volume: audio.ttsVolume,
      neuralModel: audio.neuralModel,
      preferredEngine: audio.preferredEngine ?? 'neural',
      getProfile
    } as const
    enqueueSpeech(
      {
        id: 'test', name: 'test', role: 'dealer', promptMode: 'simple', characterText: '',
        fast: { profileId: '', model: '' }, cardCounting: false, speechEnabled: true,
        memoryReset: 'none', historyAwareness: 'none',
        voice: defaultVoice(opts)
      },
      t.tts.testSentence,
      opts
    )
  }

  return (
    <Modal title={t.tts.title} onClose={() => setModal(null)}>
      <label className="check-row">
        <input
          type="checkbox"
          checked={audio.ttsEnabled}
          onChange={(e) => patchAudio({ ttsEnabled: e.target.checked })}
        />
        {t.tts.enabled}
      </label>
      <div className="form-row">
        <label>{t.tts.volume}</label>
        <input
          type="range" min={0} max={1} step={0.05}
          value={audio.ttsVolume}
          onChange={(e) => patchAudio({ ttsVolume: Number(e.target.value) })}
        />
        <span className="range-val">{Math.round(audio.ttsVolume * 100)}%</span>
        <button className="btn-ghost" onClick={test}>{t.tts.test}</button>
      </div>
      <div className="form-row">
        <label>{t.tts.preferredEngine}</label>
        <select
          value={audio.preferredEngine ?? 'neural'}
          onChange={(e) => patchAudio({ preferredEngine: e.target.value as 'neural' | 'system' })}
        >
          <option value="neural">{t.personas['voice-neural']}{!audio.neuralModel ? t.tts.neuralMissing : ''}</option>
          <option value="system">{t.personas['voice-system']}</option>
        </select>
      </div>
      <p className="form-note">{t.tts.engineNote}</p>

      <h3>{t.tts.neuralModels}</h3>
      {models.map((m) => (
        <div key={m.id} className="record-row tts-model-row">
          <span className="bgm-name">
            {m.id}
            {audio.neuralModel === m.id && <em className="tts-active"> · {t.tts.active}</em>}
          </span>
          <span className="form-note">
            {m.installed ? t.tts.installed : t.tts.notInstalled}
            {m.sizeMB ? ` · ${t.tts.sizeAbout.replace('{mb}', String(m.sizeMB))}` : ''}
          </span>
          {m.installed ? (
            <>
              {audio.neuralModel !== m.id && (
                <button className="btn-mini" onClick={() => patchAudio({ neuralModel: m.id })}>
                  {t.tts.use}
                </button>
              )}
              <button className="btn-mini btn-dim" onClick={() => remove(m.id)}>{t.tts.remove}</button>
            </>
          ) : progress?.modelId === m.id ? (
            <>
              <span className="download-bar">
                <span className="download-fill" style={{ width: `${progress.pct}%` }} />
              </span>
              <span>{t.tts.downloading.replace('{pct}', String(progress.pct))}</span>
              <button className="btn-mini btn-dim" onClick={() => window.casino.tts.cancelDownload()}>
                {t.tts.cancel}
              </button>
            </>
          ) : (
            <button className="btn-mini" disabled={busy} onClick={() => download(m.id)}>
              {t.tts.download}
            </button>
          )}
        </div>
      ))}
      <div className="form-row">
        <button className="btn-ghost" disabled={busy} onClick={importLocal}>
          {t.tts.importLocal}
        </button>
        <span className="form-note">{t.tts.importHint}</span>
      </div>
    </Modal>
  )
}

/** 首次启动语音向导 */
export function TtsWizard(): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const setModal = useStore((s) => s.setModal)

  const done = (patch: Partial<typeof settings.audio>, openTtsPanel = false): void => {
    updateSettings({
      ttsSetupDone: true,
      audio: { ...settings.audio, ...patch }
    })
    if (openTtsPanel) setModal('tts')
  }

  return (
    <div className="modal-backdrop">
      <div className="modal wizard-dialog">
        <div className="modal-head">
          <h2>{t.tts.wizardTitle}</h2>
        </div>
        <div className="modal-body">
          <p className="wizard-desc">{t.tts.wizardDesc}</p>
          <button className="match-option" onClick={() => done({ ttsEnabled: true }, true)}>
            <strong>{t.tts.wizardNeural}</strong>
          </button>
          <button className="match-option" onClick={() => done({ ttsEnabled: true })}>
            <strong>{t.tts.wizardSystem}</strong>
          </button>
          <button className="match-option" onClick={() => done({ ttsEnabled: false })}>
            <strong>{t.tts.wizardOff}</strong>
          </button>
        </div>
      </div>
    </div>
  )
}
