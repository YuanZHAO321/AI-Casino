import React, { useState } from 'react'
import { useStore } from '../store'
import { Modal } from './Modal'
import { Persona, MemoryMode, LOCAL_BOT_PROFILE_ID } from '@/core/types'

export function PersonasModal(): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const personas = useStore((s) => s.personas)
  const profiles = useStore((s) => s.profiles)
  const savePersonas = useStore((s) => s.savePersonas)
  const setModal = useStore((s) => s.setModal)
  const [selectedId, setSelectedId] = useState(personas[0]?.id ?? '')
  const selected = personas.find((p) => p.id === selectedId)

  const patch = (p: Partial<Persona>): void => {
    if (!selected) return
    savePersonas(personas.map((x) => (x.id === selected.id ? { ...x, ...p } : x)))
  }

  const addPersona = (): void => {
    const p: Persona = {
      id: globalThis.crypto.randomUUID(),
      name: `角色 ${personas.length + 1}`,
      role: 'opponent',
      promptMode: 'simple',
      characterText: '',
      profileId: LOCAL_BOT_PROFILE_ID,
      cardCounting: false,
      speechEnabled: true,
      memoryMode: 'session'
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
              {p.name}
              <em>{roleLabel(p.role)}</em>
            </div>
          ))}
          <button className="btn-ghost" onClick={addPersona}>
            + {t.panels.add}
          </button>
        </div>
        {selected && (
          <div className="pane-form">
            <div className="form-row">
              <label>{t.personas.name}</label>
              <input value={selected.name} onChange={(e) => patch({ name: e.target.value })} />
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
                  selected.promptMode === 'simple'
                    ? t.personas.characterPlaceholder
                    : t.personas.advancedPlaceholder
                }
                onChange={(e) => patch({ characterText: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>{t.personas.profile}</label>
              <select value={selected.profileId} onChange={(e) => patch({ profileId: e.target.value })}>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.id !== LOCAL_BOT_PROFILE_ID && p.model ? ` (${p.model})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>{t.personas.memoryMode}</label>
              <select
                value={selected.memoryMode}
                onChange={(e) => patch({ memoryMode: e.target.value as MemoryMode })}
              >
                <option value="persistent">{t.personas['memory-persistent']}</option>
                <option value="session">{t.personas['memory-session']}</option>
                <option value="per-round">{t.personas['memory-per-round']}</option>
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

            {selected.role === 'companion' && selected.companion && (
              <>
                <h3>{t.personas.companionOpts}</h3>
                <div className="form-row">
                  <label>{t.personas.autoChance}</label>
                  <select
                    value={selected.companion.autoCommentChance}
                    onChange={(e) =>
                      patch({
                        companion: { ...selected.companion!, autoCommentChance: Number(e.target.value) }
                      })
                    }
                  >
                    {[0, 0.15, 0.3, 0.5, 0.75, 1].map((p) => (
                      <option key={p} value={p}>
                        {Math.round(p * 100)}%
                      </option>
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
                    onChange={(e) =>
                      patch({ dealerCommentMode: e.target.value as Persona['dealerCommentMode'] })
                    }
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
                        <option key={p} value={p}>
                          {Math.round(p * 100)}%
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            <div className="modal-actions">
              <button className="btn-danger" onClick={removePersona}>
                {t.panels.delete}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
