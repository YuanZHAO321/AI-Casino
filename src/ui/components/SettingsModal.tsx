import React, { useState } from 'react'
import { useStore } from '../store'
import { Modal } from './Modal'
import { AppSettings } from '../presets'

export function SettingsModal(): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const settings = useStore((s) => s.settings)
  const personas = useStore((s) => s.personas)
  const updateSettings = useStore((s) => s.updateSettings)
  const openTable = useStore((s) => s.openTable)
  const resetBankroll = useStore((s) => s.resetBankroll)
  const setModal = useStore((s) => s.setModal)
  const [draft, setDraft] = useState<AppSettings>({ ...settings, rules: { ...settings.rules } })

  const opponents = personas.filter((p) => p.role === 'opponent')
  const companions = personas.filter((p) => p.role === 'companion')
  const dealers = personas.filter((p) => p.role === 'dealer')

  const toggleSeat = (key: 'opponentIds' | 'companionIds', id: string, max: number): void => {
    const cur = draft[key]
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(0, max)
    setDraft({ ...draft, [key]: next })
  }

  const apply = (): void => {
    updateSettings(draft)
    openTable()
    setModal(null)
  }

  return (
    <Modal title={t.panels.settings} onClose={() => setModal(null)}>
      <h3>{t.settings.general}</h3>
      <div className="form-row">
        <label>{t.settings.language}</label>
        <select
          value={draft.language}
          onChange={(e) => {
            const language = e.target.value as 'zh' | 'en'
            setDraft({ ...draft, language })
            updateSettings({ language })
          }}
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </div>
      <div className="form-row">
        <label>{t.settings.playerName}</label>
        <input
          value={draft.playerName}
          onChange={(e) => setDraft({ ...draft, playerName: e.target.value })}
        />
      </div>
      <div className="form-row">
        <button className="btn-ghost" onClick={resetBankroll}>
          {t.settings.resetBankroll}
        </button>
      </div>

      <h3>{t.settings.features}</h3>
      {(
        [
          ['tableTalk', t.settings.tableTalk],
          ['declarations', t.settings.declarations],
          ['dealerSettle', t.settings.dealerSettle],
          ['habitMemory', t.settings.habitMemory]
        ] as ['tableTalk' | 'declarations' | 'dealerSettle' | 'habitMemory', string][]
      ).map(([key, label]) => (
        <label key={key} className="check-row">
          <input
            type="checkbox"
            checked={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}

      <h3>{t.settings.rules}</h3>
      <div className="form-row">
        <label>{t.settings.decks}</label>
        <select
          value={draft.rules.decks}
          onChange={(e) => setDraft({ ...draft, rules: { ...draft.rules, decks: Number(e.target.value) } })}
        >
          {[1, 2, 4, 6, 8].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label>{t.settings.penetration}</label>
        <select
          value={draft.rules.penetration}
          onChange={(e) =>
            setDraft({ ...draft, rules: { ...draft.rules, penetration: Number(e.target.value) } })
          }
        >
          {[0.5, 0.65, 0.75, 0.85].map((p) => (
            <option key={p} value={p}>
              {Math.round(p * 100)}%
            </option>
          ))}
        </select>
      </div>
      {(
        [
          ['hitSoft17', t.settings.hitSoft17],
          ['splitAcesOneCard', t.settings.splitAcesOneCard],
          ['doubleAfterSplit', t.settings.doubleAfterSplit]
        ] as ['hitSoft17' | 'splitAcesOneCard' | 'doubleAfterSplit', string][]
      ).map(([key, label]) => (
        <label key={key} className="check-row">
          <input
            type="checkbox"
            checked={draft.rules[key]}
            onChange={(e) => setDraft({ ...draft, rules: { ...draft.rules, [key]: e.target.checked } })}
          />
          {label}
        </label>
      ))}

      <h3>{t.settings.seats}</h3>
      <div className="form-row">
        <label>{t.settings.opponents}</label>
        <div className="seat-picker">
          {opponents.map((p) => (
            <label key={p.id} className="check-chip">
              <input
                type="checkbox"
                checked={draft.opponentIds.includes(p.id)}
                onChange={() => toggleSeat('opponentIds', p.id, 4)}
              />
              {p.name}
            </label>
          ))}
        </div>
      </div>
      <div className="form-row">
        <label>{t.settings.companions}</label>
        <div className="seat-picker">
          {companions.map((p) => (
            <label key={p.id} className="check-chip">
              <input
                type="checkbox"
                checked={draft.companionIds.includes(p.id)}
                onChange={() => toggleSeat('companionIds', p.id, 3)}
              />
              {p.name}
            </label>
          ))}
        </div>
      </div>
      <div className="form-row">
        <label>{t.settings.dealerPersona}</label>
        <select
          value={draft.dealerPersonaId ?? ''}
          onChange={(e) => setDraft({ ...draft, dealerPersonaId: e.target.value || null })}
        >
          <option value="">{t.settings.none}</option>
          {dealers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label>{t.settings.playerSeat}</label>
        <select
          value={Math.min(draft.playerSeatIndex, draft.opponentIds.length)}
          onChange={(e) => setDraft({ ...draft, playerSeatIndex: Number(e.target.value) })}
        >
          {Array.from({ length: draft.opponentIds.length + 1 }, (_, i) => (
            <option key={i} value={i}>
              {i + 1}
            </option>
          ))}
        </select>
      </div>

      <p className="form-note">{t.settings.rulesNote}</p>
      <div className="modal-actions">
        <button className="btn-primary" onClick={apply}>
          {t.panels.apply}
        </button>
      </div>
    </Modal>
  )
}
