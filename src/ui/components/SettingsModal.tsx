import React, { useState } from 'react'
import { useStore } from '../store'
import { Modal } from './Modal'
import { Avatar } from './Avatar'
import { AppSettings, DEFAULT_CHIP_COLORS } from '../presets'
import type { BackupContent } from '../../../electron/preload/api'
import type { RoundRecord } from '@/core/types'
import { RULE_PRESETS, RulePresetId, applyPreset, detectPreset } from '@/games/blackjack/rulePresets'
import { DoubleRestriction } from '@/games/blackjack/types'

export function SettingsModal(): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const settings = useStore((s) => s.settings)
  const personas = useStore((s) => s.personas)
  const updateSettings = useStore((s) => s.updateSettings)
  const enterTable = useStore((s) => s.enterTable)
  const screen = useStore((s) => s.screen)
  const resetBankroll = useStore((s) => s.resetBankroll)
  const pushToast = useStore((s) => s.pushToast)
  const setModal = useStore((s) => s.setModal)
  const [exportSections, setExportSections] = useState<('api' | 'personas' | 'history')[]>([])
  // 选择性导入：已读取的备份 + 勾选的模块/历史记录 id
  const [imp, setImp] = useState<{ backup: BackupContent; modules: Set<string>; history: Set<string> } | null>(null)
  const [draft, setDraft] = useState<AppSettings>({
    ...settings,
    rules: { ...settings.rules },
    seatOrder: [...settings.seatOrder],
    appearance: { ...settings.appearance, chipColors: { ...settings.appearance.chipColors } }
  })

  const opponents = personas.filter((p) => p.role === 'opponent')
  const companions = personas.filter((p) => p.role === 'companion')
  const dealers = personas.filter((p) => p.role === 'dealer')
  const preset = detectPreset(draft.rules)

  const patchAppearance = (p: Partial<AppSettings['appearance']>): void =>
    setDraft({ ...draft, appearance: { ...draft.appearance, ...p } })

  /* ---- 选择性导入 ---- */
  const MODULE_KEYS = ['profiles', 'personas', 'history', 'matches', 'achievements', 'reports', 'settings', 'memories', 'shoe']
  const modLabel: Record<string, string> = {
    profiles: t.settings.mod_profiles, personas: t.settings.mod_personas, history: t.settings.mod_history,
    matches: t.settings.mod_matches, achievements: t.settings.mod_achievements, reports: t.settings.mod_reports,
    settings: t.settings.mod_settings, memories: t.settings.mod_memories, shoe: t.settings.mod_shoe
  }
  const impHistory = (imp ? (imp.backup.data?.history as RoundRecord[] | undefined) : undefined) ?? []

  const histLabel = (r: RoundRecord): string => {
    const d = new Date(r.timestamp)
    const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    if (r.bankrollEvent) return `${when} · ${t.settings.impFundEvent}`
    const net = `${r.playerNet >= 0 ? '+' : ''}£${r.playerNet}`
    return `${when} · ${t.table.roundLabel.replace('{n}', String(r.round))} · ${net}`
  }

  const openSelectiveImport = async (): Promise<void> => {
    const read = window.casino.data.readBackup
    if (!read) {
      // 桌面端无选择性导入能力 → 退回整包导入
      const r = await window.casino.data.import()
      if (r.ok) { pushToast(t.settings.importDone, 'info'); setTimeout(() => window.location.reload(), 800) }
      else if (r.error !== 'canceled') pushToast(`${r.error}`, 'error')
      return
    }
    const res = await read()
    if (!res.ok || !res.backup) { if (res.error !== 'canceled') pushToast(`${res.error}`, 'error'); return }
    const data = res.backup.data ?? {}
    const ids = (Array.isArray(data.history) ? (data.history as RoundRecord[]) : []).map((r) => r.id)
    setImp({ backup: res.backup, modules: new Set(MODULE_KEYS.filter((k) => k in data)), history: new Set(ids) })
  }

  const confirmSelectiveImport = async (): Promise<void> => {
    if (!imp || !window.casino.data.applyBackup) return
    const res = await window.casino.data.applyBackup(imp.backup, {
      modules: [...imp.modules],
      historyIds: imp.modules.has('history') ? [...imp.history] : undefined
    })
    if (res.ok) { pushToast(t.settings.importDone, 'info'); setImp(null); setTimeout(() => window.location.reload(), 800) }
    else pushToast(`${res.error}`, 'error')
  }

  const toggleModule = (k: string): void =>
    setImp((s) => { if (!s) return s; const m = new Set(s.modules); m.has(k) ? m.delete(k) : m.add(k); return { ...s, modules: m } })
  const toggleHistory = (id: string): void =>
    setImp((s) => { if (!s) return s; const h = new Set(s.history); h.has(id) ? h.delete(id) : h.add(id); return { ...s, history: h } })

  const uploadTexture = async (key: 'feltUrl' | 'ambienceUrl' | 'cardBackUrl'): Promise<void> => {
    const res = await window.casino.files.import('image', 'custom')
    if (res.ok && res.url) patchAppearance({ [key]: res.url })
  }

  const resetTexture = (key: 'feltUrl' | 'ambienceUrl' | 'cardBackUrl'): void => {
    const url = draft.appearance[key]
    if (url) void window.casino.files.remove(url)
    patchAppearance({ [key]: undefined })
  }

  const uploadAvatar = async (): Promise<void> => {
    const res = await window.casino.files.import('image', 'custom')
    if (res.ok && res.url) setDraft({ ...draft, playerAvatar: res.url })
  }

  /* 座位顺序：opponents 勾选 + 顺序调整 */
  const seatToggle = (id: string): void => {
    const has = draft.seatOrder.includes(id)
    const seatOrder = has
      ? draft.seatOrder.filter((x) => x !== id)
      : [...draft.seatOrder, id]
    const oppCount = seatOrder.filter((x) => x !== 'player').length
    if (oppCount > 6) return // 最多 1 玩家 + 6 AI 对手
    setDraft({ ...draft, seatOrder })
  }

  const move = (idx: number, dir: -1 | 1): void => {
    const seatOrder = [...draft.seatOrder]
    const j = idx + dir
    if (j < 0 || j >= seatOrder.length) return
    ;[seatOrder[idx], seatOrder[j]] = [seatOrder[j], seatOrder[idx]]
    setDraft({ ...draft, seatOrder })
  }

  const companionToggle = (id: string): void => {
    const has = draft.companionIds.includes(id)
    const companionIds = has
      ? draft.companionIds.filter((x) => x !== id)
      : [...draft.companionIds, id].slice(0, 3)
    setDraft({ ...draft, companionIds })
  }

  const apply = (): void => {
    updateSettings(draft)
    if (screen === 'table') enterTable('continue')
    setModal(null)
  }

  const seatName = (id: string): string =>
    id === 'player' ? `${draft.playerName}（${t.table.you}）` : personas.find((p) => p.id === id)?.name ?? id

  return (
    <Modal title={t.panels.settings} onClose={() => setModal(null)} wide>
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
        <input value={draft.playerName} onChange={(e) => setDraft({ ...draft, playerName: e.target.value })} />
      </div>
      <div className="form-row">
        <label>{t.settings.playerAvatar}</label>
        <Avatar url={draft.playerAvatar} name={draft.playerName} size={32} />
        <button className="btn-ghost" onClick={uploadAvatar}>{t.panels.upload}</button>
        {draft.playerAvatar && (
          <button className="btn-ghost" onClick={() => setDraft({ ...draft, playerAvatar: undefined })}>
            {t.panels.reset}
          </button>
        )}
      </div>
      <div className="form-row">
        <label>{t.settings.playMode}</label>
        <select
          value={draft.playMode}
          onChange={(e) => setDraft({ ...draft, playMode: e.target.value as 'auto' | 'manual' })}
        >
          <option value="auto">{t.settings['playMode-auto']}</option>
          <option value="manual">{t.settings['playMode-manual']}</option>
        </select>
      </div>
      <div className="form-row">
        <label>{t.settings.startup}</label>
        <select
          value={draft.startup}
          onChange={(e) => setDraft({ ...draft, startup: e.target.value as AppSettings['startup'] })}
        >
          <option value="ask">{t.settings['startup-ask']}</option>
          <option value="continue">{t.settings['startup-continue']}</option>
          <option value="new">{t.settings['startup-new']}</option>
        </select>
      </div>
      <div className="form-row">
        <label>{t.settings.portraitLayout}</label>
        <select
          value={draft.portraitLayout}
          onChange={(e) => setDraft({ ...draft, portraitLayout: e.target.value as AppSettings['portraitLayout'] })}
        >
          <option value="drawer">{t.settings['portraitLayout-drawer']}</option>
          <option value="stacked">{t.settings['portraitLayout-stacked']}</option>
        </select>
      </div>
      <div className="form-row">
        <button className="btn-ghost" onClick={resetBankroll}>{t.settings.resetBankroll}</button>
      </div>

      <h3>{t.settings.dataTransfer}</h3>
      <div className="form-row">
        <button
          className="btn-ghost"
          onClick={async () => {
            const res = await window.casino.data.export(['all'])
            if (res.ok && res.path) pushToast(t.settings.exportDone.replace('{path}', res.path), 'info')
            else if (res.error !== 'canceled') pushToast(`${res.error}`, 'error')
          }}
        >
          {t.settings.exportData}
        </button>
        <button
          className="btn-ghost"
          onClick={async () => {
            const res = await window.casino.data.import()
            if (res.ok) {
              pushToast(t.settings.importDone, 'info')
              setTimeout(() => window.location.reload(), 800)
            } else if (res.error !== 'canceled') {
              pushToast(`${res.error}`, 'error')
            }
          }}
        >
          {t.settings.importData}
        </button>
        <button className="btn-ghost" onClick={openSelectiveImport}>
          {t.settings.selectiveImport}
        </button>
      </div>
      <div className="form-row">
        <label>{t.settings.partialExport}</label>
        <div className="seat-picker">
          {(
            [
              ['api', t.settings.sectionApi],
              ['personas', t.settings.sectionPersonas],
              ['history', t.settings.sectionHistory]
            ] as ['api' | 'personas' | 'history', string][]
          ).map(([key, label]) => (
            <label key={key} className="check-chip">
              <input
                type="checkbox"
                checked={exportSections.includes(key)}
                onChange={() =>
                  setExportSections((prev) =>
                    prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
                  )
                }
              />
              {label}
            </label>
          ))}
          <button
            className="btn-mini"
            disabled={exportSections.length === 0}
            onClick={async () => {
              const res = await window.casino.data.export(exportSections)
              if (res.ok && res.path) pushToast(t.settings.exportDone.replace('{path}', res.path), 'info')
              else if (res.error !== 'canceled') pushToast(`${res.error}`, 'error')
            }}
          >
            {t.settings.exportSelected}
          </button>
        </div>
      </div>
      <p className="form-note">{t.settings.dataNote}</p>

      <h3>{t.settings.appearance}</h3>
      {(
        [
          ['feltUrl', t.settings.felt],
          ['ambienceUrl', t.settings.ambienceBg],
          ['cardBackUrl', t.settings.cardBack]
        ] as ['feltUrl' | 'ambienceUrl' | 'cardBackUrl', string][]
      ).map(([key, label]) => (
        <div key={key} className="form-row">
          <label>{label}</label>
          <span className="texture-status">{draft.appearance[key] ? '自定义' : '默认'}</span>
          <button className="btn-ghost" onClick={() => uploadTexture(key)}>{t.panels.upload}</button>
          {draft.appearance[key] && (
            <button className="btn-ghost" onClick={() => resetTexture(key)}>{t.panels.reset}</button>
          )}
        </div>
      ))}
      <div className="form-row">
        <label>{t.settings.ambienceBlur}</label>
        <input
          type="range" min={0} max={24} step={1}
          value={draft.appearance.ambienceBlur}
          onChange={(e) => patchAppearance({ ambienceBlur: Number(e.target.value) })}
        />
        <span className="range-val">{draft.appearance.ambienceBlur}px</span>
      </div>
      <div className="form-row">
        <label>{t.settings.ambienceDim}</label>
        <input
          type="range" min={0.2} max={1} step={0.05}
          value={draft.appearance.ambienceDim}
          onChange={(e) => patchAppearance({ ambienceDim: Number(e.target.value) })}
        />
        <span className="range-val">{Math.round(draft.appearance.ambienceDim * 100)}%</span>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={draft.showHousePlaque}
          onChange={(e) => setDraft({ ...draft, showHousePlaque: e.target.checked })}
        />
        {t.settings.showHousePlaque}
      </label>
      <div className="form-row">
        <label>{t.settings.chipColors}</label>
        <div className="chip-color-grid">
          {Object.keys(DEFAULT_CHIP_COLORS).map(Number).sort((a, b) => a - b).map((d) => (
            <span key={d} className="chip-color-item">
              <em>£{d}</em>
              <input
                type="color"
                value={draft.appearance.chipColors[d] ?? DEFAULT_CHIP_COLORS[d]}
                onChange={(e) =>
                  patchAppearance({ chipColors: { ...draft.appearance.chipColors, [d]: e.target.value } })
                }
              />
            </span>
          ))}
          <button className="btn-ghost" onClick={() => patchAppearance({ chipColors: { ...DEFAULT_CHIP_COLORS } })}>
            {t.panels.reset}
          </button>
        </div>
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
        <label>{t.settings.preset}</label>
        <select
          value={preset}
          onChange={(e) => {
            const id = e.target.value as RulePresetId
            if (id !== 'custom' && id in RULE_PRESETS) {
              setDraft({ ...draft, rules: applyPreset(draft.rules, id as Exclude<RulePresetId, 'custom'>) })
            }
          }}
        >
          <option value="uk">{t.settings['preset-uk']}</option>
          <option value="eu">{t.settings['preset-eu']}</option>
          <option value="us">{t.settings['preset-us']}</option>
          <option value="custom" disabled={preset !== 'custom'}>{t.settings['preset-custom']}</option>
        </select>
      </div>
      <div className="form-row">
        <label>{t.settings.decks}</label>
        <select
          value={draft.rules.decks}
          onChange={(e) => setDraft({ ...draft, rules: { ...draft.rules, decks: Number(e.target.value) } })}
        >
          {[1, 2, 4, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <label>{t.settings.penetration}</label>
        <select
          value={draft.rules.penetration}
          onChange={(e) => setDraft({ ...draft, rules: { ...draft.rules, penetration: Number(e.target.value) } })}
        >
          {[0.5, 0.65, 0.75, 0.85].map((p) => <option key={p} value={p}>{Math.round(p * 100)}%</option>)}
        </select>
      </div>
      {(
        [
          ['hitSoft17', t.settings.hitSoft17],
          ['splitAcesOneCard', t.settings.splitAcesOneCard],
          ['doubleAfterSplit', t.settings.doubleAfterSplit],
          ['holeCard', t.settings.holeCard],
          ['peek', t.settings.peek],
          ['insurance', t.settings.insurance],
          ['lateSurrender', t.settings.lateSurrender]
        ] as ['hitSoft17' | 'splitAcesOneCard' | 'doubleAfterSplit' | 'holeCard' | 'peek' | 'insurance' | 'lateSurrender', string][]
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
      <div className="form-row">
        <label>{t.settings.doubleRestriction}</label>
        <select
          value={draft.rules.doubleRestriction}
          onChange={(e) =>
            setDraft({ ...draft, rules: { ...draft.rules, doubleRestriction: e.target.value as DoubleRestriction } })
          }
        >
          <option value="any">{t.settings['double-any']}</option>
          <option value="9-11">{t.settings['double-9-11']}</option>
          <option value="10-11">{t.settings['double-10-11']}</option>
        </select>
        <label>{t.settings.maxSplitHands}</label>
        <select
          value={draft.rules.maxSplitHands}
          onChange={(e) => setDraft({ ...draft, rules: { ...draft.rules, maxSplitHands: Number(e.target.value) } })}
        >
          {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="form-row">
        <label>{t.settings.shoeMode}</label>
        <select
          value={draft.shoeMode}
          onChange={(e) => setDraft({ ...draft, shoeMode: e.target.value as 'persist' | 'fresh' })}
        >
          <option value="persist">{t.settings['shoe-persist']}</option>
          <option value="fresh">{t.settings['shoe-fresh']}</option>
        </select>
      </div>

      <h3>{t.settings.seats}</h3>
      <div className="form-row">
        <label>{t.settings.opponents}</label>
        <div className="seat-picker">
          {opponents.map((p) => (
            <label key={p.id} className="check-chip">
              <input
                type="checkbox"
                checked={draft.seatOrder.includes(p.id)}
                onChange={() => seatToggle(p.id)}
              />
              {p.name}
            </label>
          ))}
        </div>
      </div>
      <div className="form-row form-row-tall">
        <label>{t.settings.seatOrderHint}</label>
        <div className="seat-order-list">
          {draft.seatOrder.map((id, i) => (
            <div key={id} className="seat-order-item">
              <span>{i + 1}. {seatName(id)}</span>
              <button className="btn-mini btn-dim" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="btn-mini btn-dim" disabled={i === draft.seatOrder.length - 1} onClick={() => move(i, 1)}>↓</button>
            </div>
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
                onChange={() => companionToggle(p.id)}
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
          {dealers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <p className="form-note">{t.settings.rulesNote}</p>
      <div className="modal-actions">
        <button className="btn-primary" onClick={apply}>{t.panels.apply}</button>
      </div>

      {imp && (
        <div className="modal-backdrop" onClick={() => setImp(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{t.settings.impTitle}</h2>
              <button className="btn-close" onClick={() => setImp(null)}>✕</button>
            </div>
            <div className="modal-body">
              <h3>{t.settings.impModules}</h3>
              <div className="seat-picker">
                {MODULE_KEYS.filter((k) => k in (imp.backup.data ?? {})).map((k) => (
                  <label key={k} className="check-chip">
                    <input type="checkbox" checked={imp.modules.has(k)} onChange={() => toggleModule(k)} />
                    {modLabel[k]}
                  </label>
                ))}
              </div>

              {imp.modules.has('history') && impHistory.length > 0 && (
                <>
                  <div className="import-history-head">
                    <h3>{t.settings.impHistoryCount.replace('{n}', String(impHistory.length))}</h3>
                    <span className="bet-quick">
                      <button className="btn-mini" onClick={() => setImp((s) => (s ? { ...s, history: new Set(impHistory.map((r) => r.id)) } : s))}>
                        {t.settings.impSelectAll}
                      </button>
                      <button className="btn-mini btn-dim" onClick={() => setImp((s) => (s ? { ...s, history: new Set() } : s))}>
                        {t.settings.impClear}
                      </button>
                    </span>
                  </div>
                  <div className="import-history-list">
                    {[...impHistory].sort((a, b) => a.timestamp - b.timestamp).map((r) => (
                      <label key={r.id} className="check-row">
                        <input type="checkbox" checked={imp.history.has(r.id)} onChange={() => toggleHistory(r.id)} />
                        <span>{histLabel(r)}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setImp(null)}>{t.settings.impCancel}</button>
              <button className="btn-primary" disabled={imp.modules.size === 0} onClick={confirmSelectiveImport}>
                {t.settings.impApply}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
