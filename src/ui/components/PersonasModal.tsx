import React, { useState } from 'react'
import { useStore } from '../store'
import { Modal } from './Modal'
import { Avatar } from './Avatar'
import {
  Persona, ModelRef, MemoryReset, HistoryAwareness, VoiceConfig, LOCAL_BOT_PROFILE_ID
} from '@/core/types'
import { systemVoices } from '../audio'

/** 接口+模型 双选器 */
function ModelRefPicker({
  label,
  value,
  allowEmpty,
  onChange
}: {
  label: string
  value?: ModelRef
  allowEmpty?: boolean
  onChange: (ref: ModelRef | undefined) => void
}): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const profiles = useStore((s) => s.profiles)
  const profile = profiles.find((p) => p.id === value?.profileId)
  return (
    <div className="form-row">
      <label>{label}</label>
      <select
        value={value?.profileId ?? ''}
        onChange={(e) => {
          const pid = e.target.value
          if (!pid) onChange(allowEmpty ? undefined : { profileId: LOCAL_BOT_PROFILE_ID, model: '' })
          else onChange({ profileId: pid, model: '' })
        }}
      >
        {allowEmpty && <option value="">{t.personas.notSet}</option>}
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {value && profile && profile.id !== LOCAL_BOT_PROFILE_ID && (
        <select
          value={value.model}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
        >
          <option value="">{profile.models[0] ? `(${profile.models[0]})` : t.personas.notSet}</option>
          {profile.models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}
    </div>
  )
}

export function PersonasModal(): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const personas = useStore((s) => s.personas)
  const profiles = useStore((s) => s.profiles)
  const settings = useStore((s) => s.settings)
  const savePersonas = useStore((s) => s.savePersonas)
  const setModal = useStore((s) => s.setModal)
  const [selectedId, setSelectedId] = useState(personas[0]?.id ?? '')
  const selected = personas.find((p) => p.id === selectedId)
  const sysVoices = systemVoices()

  const patch = (p: Partial<Persona>): void => {
    if (!selected) return
    savePersonas(personas.map((x) => (x.id === selected.id ? { ...x, ...p } : x)))
  }

  const patchVoice = (v: Partial<VoiceConfig>): void => {
    const voice: VoiceConfig = { engine: 'off', ...(selected?.voice ?? {}), ...v }
    patch({ voice })
  }

  const addPersona = (): void => {
    const p: Persona = {
      id: globalThis.crypto.randomUUID(),
      name: `角色 ${personas.length + 1}`,
      role: 'opponent',
      promptMode: 'simple',
      characterText: '',
      fast: { profileId: LOCAL_BOT_PROFILE_ID, model: '' },
      cardCounting: false,
      speechEnabled: true,
      memoryReset: 'per-match',
      historyAwareness: 'brief'
    }
    savePersonas([...personas, p])
    setSelectedId(p.id)
  }

  const removePersona = (): void => {
    if (!selected) return
    const rest = personas.filter((x) => x.id !== selected.id)
    savePersonas(rest)
    setSelectedId(rest[0]?.id ?? '')
  }

  const uploadAvatar = async (): Promise<void> => {
    const res = await window.casino.files.import('image', 'custom')
    if (res.ok && res.url) patch({ avatar: res.url })
  }

  const roleLabel = (r: Persona['role']): string => t.personas[r]

  return (
    <Modal title={t.personas.title} onClose={() => setModal(null)} wide>
      <div className="split-pane">
        <div className="pane-list">
          {personas.map((p) => (
            <div
              key={p.id}
              className={`pane-item ${p.id === selectedId ? 'on' : ''}`}
              onClick={() => setSelectedId(p.id)}
            >
              <span className="pane-item-row">
                <Avatar url={p.avatar} name={p.name} size={20} /> {p.name}
              </span>
              <em>{roleLabel(p.role)}</em>
            </div>
          ))}
          <button className="btn-ghost" onClick={addPersona}>+ {t.panels.add}</button>
        </div>
        {selected && (
          <div className="pane-form">
            <div className="form-row">
              <label>{t.personas.name}</label>
              <input value={selected.name} onChange={(e) => patch({ name: e.target.value })} />
            </div>
            <div className="form-row">
              <label>{t.personas.avatar}</label>
              <Avatar url={selected.avatar} name={selected.name} size={32} />
              <button className="btn-ghost" onClick={uploadAvatar}>{t.panels.upload}</button>
              {selected.avatar && (
                <button className="btn-ghost" onClick={() => patch({ avatar: undefined })}>{t.panels.reset}</button>
              )}
            </div>
            <div className="form-row">
              <label>{t.personas.role}</label>
              <select
                value={selected.role}
                onChange={(e) => {
                  const role = e.target.value as Persona['role']
                  patch({
                    role,
                    companion:
                      role === 'companion'
                        ? selected.companion ?? { autoCommentChance: 0.3, banterEnabled: true, adviceEnabled: true }
                        : undefined,
                    dealerCommentMode: role === 'dealer' ? selected.dealerCommentMode ?? 'chance' : undefined
                  })
                }}
              >
                <option value="opponent">{t.personas.opponent}</option>
                <option value="companion">{t.personas.companion}</option>
                <option value="dealer">{t.personas.dealer}</option>
              </select>
            </div>
            <div className="form-row">
              <label>{t.personas.promptMode}</label>
              <select
                value={selected.promptMode}
                onChange={(e) => patch({ promptMode: e.target.value as 'simple' | 'advanced' })}
              >
                <option value="simple">{t.personas.simple}</option>
                <option value="advanced">{t.personas.advanced}</option>
              </select>
            </div>
            <div className="form-row form-row-tall">
              <label>{t.personas.characterText}</label>
              <textarea
                rows={5}
                value={selected.characterText}
                placeholder={
                  selected.promptMode === 'simple' ? t.personas.characterPlaceholder : t.personas.advancedPlaceholder
                }
                onChange={(e) => patch({ characterText: e.target.value })}
              />
            </div>

            <h3>{t.personas.models}</h3>
            <ModelRefPicker
              label={t.personas.fastModel}
              value={selected.fast}
              onChange={(ref) => ref && patch({ fast: ref })}
            />
            <ModelRefPicker
              label={t.personas.smartModel}
              value={selected.smart}
              allowEmpty
              onChange={(ref) => patch({ smart: ref })}
            />
            <ModelRefPicker
              label={t.personas.backupModel}
              value={selected.backup}
              allowEmpty
              onChange={(ref) => patch({ backup: ref })}
            />

            <div className="form-row">
              <label>{t.personas.memoryReset}</label>
              <select
                value={selected.memoryReset}
                onChange={(e) => patch({ memoryReset: e.target.value as MemoryReset })}
              >
                {(['none', 'per-round', 'per-match', 'per-launch', 'permanent', 'manual'] as const).map((m) => (
                  <option key={m} value={m}>{t.personas[`mr-${m}`]}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>{t.personas.historyAwareness}</label>
              <select
                value={selected.historyAwareness}
                onChange={(e) => patch({ historyAwareness: e.target.value as HistoryAwareness })}
              >
                {(['none', 'brief', 'full'] as const).map((m) => (
                  <option key={m} value={m}>{t.personas[`ha-${m}`]}</option>
                ))}
              </select>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={selected.cardCounting}
                onChange={(e) => patch({ cardCounting: e.target.checked })}
              />
              {t.personas.cardCounting}
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={selected.speechEnabled}
                onChange={(e) => patch({ speechEnabled: e.target.checked })}
              />
              {t.personas.speech}
            </label>

            <h3>{t.personas.voice}</h3>
            <div className="form-row">
              <label>{t.personas.voice}</label>
              <select
                value={selected.voice?.engine ?? 'off'}
                onChange={(e) => patchVoice({ engine: e.target.value as VoiceConfig['engine'] })}
              >
                <option value="off">{t.personas['voice-off']}</option>
                <option value="neural">{t.personas['voice-neural']}</option>
                <option value="system">{t.personas['voice-system']}</option>
                <option value="api">{t.personas['voice-api']}</option>
              </select>
            </div>
            {selected.voice?.engine === 'neural' && (
              <div className="form-row">
                <label>{t.personas.voiceSid}</label>
                <input
                  type="number" min={0}
                  value={selected.voice.voice ?? '0'}
                  onChange={(e) => patchVoice({ voice: e.target.value })}
                />
                <span className="form-note">{settings.audio.neuralModel ?? t.tts.notInstalled}</span>
              </div>
            )}
            {selected.voice?.engine === 'system' && (
              <div className="form-row">
                <label>{t.personas.voiceId}</label>
                <select
                  value={selected.voice.voice ?? ''}
                  onChange={(e) => patchVoice({ voice: e.target.value })}
                >
                  <option value="">（默认）</option>
                  {sysVoices.map((v) => (
                    <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                  ))}
                </select>
              </div>
            )}
            {selected.voice?.engine === 'api' && (
              <>
                <div className="form-row">
                  <label>{t.personas.voiceApiProfile}</label>
                  <select
                    value={selected.voice.apiProfileId ?? ''}
                    onChange={(e) => patchVoice({ apiProfileId: e.target.value })}
                  >
                    <option value="">—</option>
                    {profiles.filter((p) => p.id !== LOCAL_BOT_PROFILE_ID).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>{t.personas.voiceApiModel}</label>
                  <input
                    value={selected.voice.apiModel ?? 'tts-1'}
                    onChange={(e) => patchVoice({ apiModel: e.target.value })}
                  />
                  <label>{t.personas.voiceId}</label>
                  <input
                    value={selected.voice.voice ?? 'alloy'}
                    onChange={(e) => patchVoice({ voice: e.target.value })}
                  />
                </div>
              </>
            )}

            {selected.role === 'companion' && selected.companion && (
              <>
                <h3>{t.personas.companionOpts}</h3>
                <div className="form-row">
                  <label>{t.personas.autoChance}</label>
                  <select
                    value={selected.companion.autoCommentChance}
                    onChange={(e) =>
                      patch({ companion: { ...selected.companion!, autoCommentChance: Number(e.target.value) } })
                    }
                  >
                    {[0, 0.15, 0.3, 0.5, 0.75, 1].map((p) => (
                      <option key={p} value={p}>{Math.round(p * 100)}%</option>
                    ))}
                  </select>
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={selected.companion.banterEnabled}
                    onChange={(e) =>
                      patch({ companion: { ...selected.companion!, banterEnabled: e.target.checked } })
                    }
                  />
                  {t.personas.banter}
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={selected.companion.adviceEnabled}
                    onChange={(e) =>
                      patch({ companion: { ...selected.companion!, adviceEnabled: e.target.checked } })
                    }
                  />
                  {t.personas.advice}
                </label>
              </>
            )}

            {selected.role === 'dealer' && (
              <>
                <h3>{t.personas.dealerComment}</h3>
                <div className="form-row">
                  <label>{t.personas.dealerComment}</label>
                  <select
                    value={selected.dealerCommentMode ?? 'off'}
                    onChange={(e) => patch({ dealerCommentMode: e.target.value as Persona['dealerCommentMode'] })}
                  >
                    <option value="off">{t.personas['dc-off']}</option>
                    <option value="every">{t.personas['dc-every']}</option>
                    <option value="chance">{t.personas['dc-chance']}</option>
                  </select>
                </div>
                {selected.dealerCommentMode === 'chance' && (
                  <div className="form-row">
                    <label>{t.personas.dcChance}</label>
                    <select
                      value={selected.dealerCommentChance ?? 0.3}
                      onChange={(e) => patch({ dealerCommentChance: Number(e.target.value) })}
                    >
                      {[0.15, 0.3, 0.5, 0.75].map((p) => (
                        <option key={p} value={p}>{Math.round(p * 100)}%</option>
                      ))}
                    </select>
                  </div>
                )}
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={selected.dealerUseModel ?? false}
                    onChange={(e) => patch({ dealerUseModel: e.target.checked })}
                  />
                  {t.personas.dealerUseModel}
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={selected.dealerDrawSpeech ?? false}
                    onChange={(e) => patch({ dealerDrawSpeech: e.target.checked })}
                  />
                  {t.personas.dealerDrawSpeech}
                </label>
              </>
            )}

            <div className="modal-actions">
              <button className="btn-danger" onClick={removePersona}>{t.panels.delete}</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
