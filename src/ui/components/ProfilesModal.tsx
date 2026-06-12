import React, { useState } from 'react'
import { useStore } from '../store'
import { Modal } from './Modal'
import { ApiProfile, LOCAL_BOT_PROFILE_ID } from '@/core/types'

export function ProfilesModal(): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const profiles = useStore((s) => s.profiles)
  const saveProfiles = useStore((s) => s.saveProfiles)
  const setModal = useStore((s) => s.setModal)
  const editable = profiles.filter((p) => p.id !== LOCAL_BOT_PROFILE_ID)
  const [selectedId, setSelectedId] = useState(editable[0]?.id ?? '')
  const [fetched, setFetched] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [manualModel, setManualModel] = useState('')

  const selected = profiles.find((p) => p.id === selectedId)

  const patch = (p: Partial<ApiProfile>): void => {
    if (!selected) return
    saveProfiles(profiles.map((x) => (x.id === selected.id ? { ...x, ...p } : x)))
  }

  const addProfile = (): void => {
    const p: ApiProfile = {
      id: globalThis.crypto.randomUUID(),
      name: `API ${editable.length + 1}`,
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      models: [],
      temperature: 0.8,
      useJsonMode: true
    }
    saveProfiles([...profiles, p])
    setSelectedId(p.id)
    setFetched([])
  }

  const removeProfile = (): void => {
    if (!selected) return
    const rest = profiles.filter((x) => x.id !== selected.id)
    saveProfiles(rest)
    setSelectedId(rest.find((p) => p.id !== LOCAL_BOT_PROFILE_ID)?.id ?? '')
  }

  const fetchModels = async (): Promise<void> => {
    if (!selected) return
    setFetching(true)
    setFetchError('')
    const res = await window.casino.llm.models(selected.baseURL, selected.apiKey)
    setFetching(false)
    if (res.ok && res.models) setFetched(res.models)
    else setFetchError(res.error ?? t.profiles.fetchFailed)
  }

  const togglePoolModel = (m: string): void => {
    if (!selected) return
    const models = selected.models.includes(m)
      ? selected.models.filter((x) => x !== m)
      : [...selected.models, m]
    patch({ models })
  }

  const addManual = (): void => {
    const m = manualModel.trim()
    if (!m || !selected || selected.models.includes(m)) return
    patch({ models: [...selected.models, m] })
    setManualModel('')
  }

  return (
    <Modal title={t.profiles.title} onClose={() => setModal(null)} wide>
      <div className="split-pane">
        <div className="pane-list">
          <div className="pane-item pane-item-locked">{t.profiles.localBot}</div>
          {editable.map((p) => (
            <div
              key={p.id}
              className={`pane-item ${p.id === selectedId ? 'on' : ''}`}
              onClick={() => {
                setSelectedId(p.id)
                setFetched([])
                setFetchError('')
              }}
            >
              {p.name}
              <em>{p.models.length ? `${p.models.length} 模型` : '—'}</em>
            </div>
          ))}
          <button className="btn-ghost" onClick={addProfile}>+ {t.panels.add}</button>
        </div>
        {selected && (
          <div className="pane-form">
            <div className="form-row">
              <label>{t.profiles.name}</label>
              <input value={selected.name} onChange={(e) => patch({ name: e.target.value })} />
            </div>
            <div className="form-row">
              <label>{t.profiles.baseURL}</label>
              <input
                value={selected.baseURL}
                placeholder="https://api.openai.com/v1"
                onChange={(e) => patch({ baseURL: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>{t.profiles.apiKey}</label>
              <input type="password" value={selected.apiKey} onChange={(e) => patch({ apiKey: e.target.value })} />
            </div>

            <div className="form-row form-row-tall">
              <label>{t.profiles.modelPool}</label>
              <div className="model-pool">
                {selected.models.map((m) => (
                  <span key={m} className="check-chip model-chip">
                    {m}
                    <button className="btn-close" onClick={() => togglePoolModel(m)}>✕</button>
                  </span>
                ))}
                <div className="model-add-row">
                  <input
                    value={manualModel}
                    placeholder={t.profiles.modelPlaceholder}
                    onChange={(e) => setManualModel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addManual()}
                  />
                  <button className="btn-mini" onClick={addManual} disabled={!manualModel.trim()}>
                    {t.profiles.addModel}
                  </button>
                  <button className="btn-ghost" onClick={fetchModels} disabled={fetching || !selected.baseURL}>
                    {fetching ? t.profiles.fetching : t.profiles.fetchModels}
                  </button>
                </div>
                {fetched.length > 0 && (
                  <div className="fetched-models">
                    {fetched.map((m) => (
                      <label key={m} className="check-row">
                        <input
                          type="checkbox"
                          checked={selected.models.includes(m)}
                          onChange={() => togglePoolModel(m)}
                        />
                        {m}
                      </label>
                    ))}
                  </div>
                )}
                {fetchError && <p className="form-error">{fetchError}</p>}
              </div>
            </div>

            <div className="form-row">
              <label>{t.profiles.temperature}</label>
              <input
                type="number" step="0.1" min="0" max="2"
                value={selected.temperature}
                onChange={(e) => patch({ temperature: Number(e.target.value) })}
              />
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={selected.useJsonMode}
                onChange={(e) => patch({ useJsonMode: e.target.checked })}
              />
              {t.profiles.jsonMode}
            </label>
            <p className="form-note">{t.profiles.testNote}</p>
            <div className="modal-actions">
              <button className="btn-danger" onClick={removeProfile}>{t.panels.delete}</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
