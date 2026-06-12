import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Modal } from './Modal'
import {
  computeGlobalStats, computeHouseStats, computePersonaStats, computeModelStats
} from '@/core/stats'
import { LOCAL_BOT_PROFILE_ID, ModelRef, RoundRecord } from '@/core/types'

/** 报告/分析用的 接口+模型 选择器 */
function ReportModelPicker({
  value,
  onChange
}: {
  value: ModelRef | null
  onChange: (ref: ModelRef) => void
}): React.JSX.Element {
  const profiles = useStore((s) => s.profiles).filter((p) => p.id !== LOCAL_BOT_PROFILE_ID)
  const profile = profiles.find((p) => p.id === value?.profileId) ?? profiles[0]
  return (
    <>
      <select
        value={profile?.id ?? ''}
        onChange={(e) => onChange({ profileId: e.target.value, model: '' })}
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {profile && (
        <select
          value={value?.model ?? ''}
          onChange={(e) => onChange({ profileId: profile.id, model: e.target.value })}
        >
          <option value="">{profile.models[0] ? `(${profile.models[0]})` : '—'}</option>
          {profile.models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}
    </>
  )
}

function RecordRow({ record }: { record: RoundRecord }): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const deleteRecord = useStore((s) => s.deleteRecord)
  const personas = useStore((s) => s.personas)
  const [open, setOpen] = useState(false)

  if (record.round === 0) {
    return (
      <div className="record-row record-event">
        <span>💷 {record.bankrollEvent === 'rebuy' ? t.table.rebuy : t.settings.resetBankroll}</span>
        <span>£{record.bankrollBefore} → £{record.bankrollAfter}</span>
        <button className="btn-mini btn-dim" onClick={() => deleteRecord(record.id)}>✕</button>
      </div>
    )
  }

  const nameOf = (id: string): string =>
    id === 'dealer' ? t.table.dealer : personas.find((p) => p.id === id)?.name ?? id
  const playerSeat = record.seats.find((s) => !s.personaId)

  return (
    <div className="record-row-wrap">
      <div className="record-row" onClick={() => setOpen(!open)}>
        <span className="rec-round">#{record.matchRound ?? record.round}</span>
        <span>{new Date(record.timestamp).toLocaleString()}</span>
        <span>{t.history.bet} £{record.playerBet}</span>
        <span className={record.playerNet >= 0 ? 'pos' : 'neg'}>
          {record.playerNet >= 0 ? '+' : ''}£{record.playerNet}
        </span>
        <span>£{record.bankrollBefore} → £{record.bankrollAfter}</span>
        <span className="rec-outcome">{playerSeat?.outcome}</span>
        <button
          className="btn-mini btn-dim"
          onClick={(e) => {
            e.stopPropagation()
            deleteRecord(record.id)
          }}
        >
          ✕
        </button>
      </div>
      {open && (
        <div className="record-detail">
          {(() => {
            const dealerCards = (record.detail as { dealerCards?: string[] } | undefined)?.dealerCards
            return dealerCards?.length ? (
              <div className="rec-seat rec-dealer">
                {t.table.dealer}: <em className="rec-cards">{dealerCards.join(' ')}</em>
              </div>
            ) : null
          })()}
          {record.seats.map((s) => (
            <div key={s.seatId} className="rec-seat">
              {s.personaName}
              {s.modelLabel ? ` (${s.modelLabel})` : ''}:
              {s.hands?.length ? (
                <em className="rec-cards"> {s.hands.map((h) => h.join(' ')).join(' | ')} </em>
              ) : ' '}
              {s.outcome},{s.net >= 0 ? ' +' : ' '}£{s.net}
            </div>
          ))}
          {Object.entries(record.declarations).length > 0 && (
            <div className="rec-declarations">
              <strong>{t.history.declarations}</strong>
              {Object.entries(record.declarations).map(([id, text]) => (
                <div key={id}>「{nameOf(id)}」{text}</div>
              ))}
            </div>
          )}
          {record.playerNote && (
            <div className="rec-note">
              <strong>{t.history.playerNote}</strong> {record.playerNote}
            </div>
          )}
          {playerSeat?.decisions && playerSeat.decisions.length > 0 && (
            <div className="rec-habits">
              <strong>{t.history.habit}</strong>
              {playerSeat.decisions.map((d, i) => (
                <div key={i} className={d.action === d.basicStrategy ? '' : 'habit-diff'}>
                  {d.situation}: {d.action} {d.action !== d.basicStrategy ? `(BS: ${d.basicStrategy})` : '✓'}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function HistoryModal(): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const history = useStore((s) => s.history)
  const matches = useStore((s) => s.matches)
  const reports = useStore((s) => s.reports)
  const personas = useStore((s) => s.personas)
  const settings = useStore((s) => s.settings)
  const makeReport = useStore((s) => s.makeReport)
  const openAnalysis = useStore((s) => s.openAnalysis)
  const clearHistory = useStore((s) => s.clearHistory)
  const renameMatch = useStore((s) => s.renameMatch)
  const setModal = useStore((s) => s.setModal)
  const [tab, setTab] = useState<'records' | 'stats' | 'report'>('records')
  const [modelRef, setModelRef] = useState<ModelRef | null>(null)
  const [generating, setGenerating] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  const g = computeGlobalStats(history)
  const h = computeHouseStats(history)
  const personaStats = computePersonaStats(history)
  const modelStats = computeModelStats(history)

  // 按场分组（新场在前）
  const groups: { match: { id: string; name: string } | null; records: RoundRecord[] }[] = []
  for (const m of [...matches].reverse()) {
    const records = history.filter((r) => r.matchId === m.id)
    if (records.length) groups.push({ match: m, records })
  }
  const orphan = history.filter((r) => !r.matchId || !matches.some((m) => m.id === r.matchId))
  if (orphan.length) groups.push({ match: null, records: orphan })

  const generate = async (): Promise<void> => {
    if (!modelRef) return
    setGenerating(true)
    await makeReport(modelRef)
    setGenerating(false)
  }

  // 出现过的角色（含玩家）供分析
  const analysisTargets: { id: string; name: string }[] = [
    { id: 'player', name: settings.playerName },
    ...personas
      .filter((p) => history.some((r) => r.seats.some((s) => s.personaId === p.id)))
      .map((p) => ({ id: p.id, name: p.name }))
  ]

  return (
    <Modal title={t.history.title} onClose={() => setModal(null)} wide>
      <div className="chat-tabs">
        {(
          [
            ['records', t.history.tabRecords],
            ['stats', t.history.tabStats],
            ['report', t.history.tabReport]
          ] as ['records' | 'stats' | 'report', string][]
        ).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'records' && (
        <div className="records-list">
          {history.length === 0 && <p className="form-note">{t.history.empty}</p>}
          {groups.map(({ match, records }) => (
            <div key={match?.id ?? 'orphan'} className="match-group">
              <div className="match-head">
                {renaming === match?.id ? (
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && match) {
                        renameMatch(match.id, renameText.trim() || match.name)
                        setRenaming(null)
                      }
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                    onBlur={() => setRenaming(null)}
                  />
                ) : (
                  <strong>{match?.name ?? t.history.matchUnknown}</strong>
                )}
                <em>{records.filter((r) => r.round !== 0).length} {t.lobby.roundsPlayed}</em>
                {match && renaming !== match.id && (
                  <button
                    className="btn-mini btn-dim"
                    onClick={() => {
                      setRenaming(match.id)
                      setRenameText(match.name)
                    }}
                  >
                    {t.history.rename}
                  </button>
                )}
              </div>
              {[...records].reverse().map((r) => (
                <RecordRow key={r.id} record={r} />
              ))}
            </div>
          ))}
          {history.length > 0 && (
            <button className="btn-danger" onClick={clearHistory}>{t.history.clearAll}</button>
          )}
        </div>
      )}

      {tab === 'stats' && (
        <div className="stats-pane">
          <h3>{t.history.playerStats}</h3>
          <table className="stats-table">
            <tbody>
              <tr>
                <td>{t.history.rounds}</td><td>{g.rounds}</td>
                <td>{t.history.net}</td>
                <td className={g.playerNet >= 0 ? 'pos' : 'neg'}>{g.playerNet >= 0 ? '+' : ''}£{g.playerNet}</td>
                <td>{t.history.avgNet}</td>
                <td>{g.avgNetPerRound >= 0 ? '+' : ''}£{g.avgNetPerRound.toFixed(1)}</td>
              </tr>
              <tr>
                <td>{t.history.winRate}</td><td>{(g.winRate * 100).toFixed(1)}%</td>
                <td>{t.history.blackjacks}</td><td>{g.blackjacks}</td>
                <td>{t.history.busts}</td><td>{g.busts}</td>
              </tr>
              <tr>
                <td>{t.history.surrenders}</td><td>{g.surrenders}</td>
                <td>{t.history.biggestWin}</td><td className="pos">+£{g.biggestWin}</td>
                <td>{t.history.biggestLoss}</td><td className="neg">£{g.biggestLoss}</td>
              </tr>
              <tr>
                <td>{t.history.rebuys}</td><td>{g.rebuys}</td>
                <td>{t.history.strategyMatch}</td>
                <td colSpan={3}>
                  {g.strategyMatchRate === null ? '—' : `${(g.strategyMatchRate * 100).toFixed(1)}%`}
                </td>
              </tr>
            </tbody>
          </table>

          <h3>{t.history.houseStats}</h3>
          <table className="stats-table">
            <tbody>
              <tr>
                <td>{t.history.houseNet}</td>
                <td className={h.houseNet >= 0 ? 'pos' : 'neg'}>{h.houseNet >= 0 ? '+' : ''}£{h.houseNet}</td>
                <td>{t.history.edgeRate}</td><td>{(h.edgeRate * 100).toFixed(2)}%</td>
                <td>{t.history.totalWagered}</td><td>£{h.totalWagered}</td>
              </tr>
            </tbody>
          </table>
          {h.trend.length > 0 && (
            <div className="house-trend" title={t.history.houseTrend}>
              {h.trend.map((v, i) => (
                <span
                  key={i}
                  className={`trend-bar ${v >= 0 ? 'pos-bg' : 'neg-bg'}`}
                  style={{ height: Math.min(36, 4 + Math.abs(v) / 12) }}
                  title={`${v >= 0 ? '+' : ''}£${v}`}
                />
              ))}
            </div>
          )}

          <h3>{t.history.personaStats}</h3>
          <AggTable rows={personaStats} />
          <h3>{t.history.modelStats}</h3>
          <AggTable rows={modelStats} />
        </div>
      )}

      {tab === 'report' && (
        <div className="report-pane">
          <div className="form-row">
            <label>{t.history.reportModel}</label>
            <ReportModelPicker value={modelRef} onChange={setModelRef} />
            <button
              className="btn-primary"
              disabled={generating || !modelRef || history.length === 0}
              onClick={generate}
            >
              {generating ? t.history.generating : t.history.generate}
            </button>
          </div>
          <div className="form-row form-row-tall">
            <label>{t.history.analyze}</label>
            <div className="seat-picker">
              {analysisTargets.map((a) => (
                <button
                  key={a.id}
                  className="btn-mini"
                  disabled={!modelRef}
                  onClick={() => modelRef && openAnalysis(a.id, a.name, modelRef)}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>
          {reports.length === 0 && <p className="form-note">{t.history.noReports}</p>}
          {[...reports].reverse().map((r) => (
            <div key={r.id} className="report-card">
              <div className="report-time">{new Date(r.timestamp).toLocaleString()}</div>
              <pre>{r.text}</pre>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function AggTable({ rows }: { rows: ReturnType<typeof computePersonaStats> }): React.JSX.Element {
  const t = useStore((s) => s.t)()
  return (
    <table className="stats-table">
      <thead>
        <tr>
          <th></th>
          <th>{t.history.rounds}</th>
          <th>{t.history.net}</th>
          <th>{t.history.winRate}</th>
          <th>{t.history.blackjacks}</th>
          <th>{t.history.busts}</th>
          <th>{t.history.surrenders}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.key}>
            <td>{c.key}</td>
            <td>{c.rounds}</td>
            <td className={c.net >= 0 ? 'pos' : 'neg'}>{c.net >= 0 ? '+' : ''}£{c.net}</td>
            <td>{(c.winRate * 100).toFixed(1)}%</td>
            <td>{c.blackjacks}</td>
            <td>{c.busts}</td>
            <td>{c.surrenders}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 牌局分析师对话框（角色风格分析 + 追问） */
export function AnalystDialog(): React.JSX.Element | null {
  const t = useStore((s) => s.t)()
  const analyst = useStore((s) => s.analyst)
  const askAnalyst = useStore((s) => s.askAnalyst)
  const closeAnalysis = useStore((s) => s.closeAnalysis)
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [analyst?.messages.length, analyst?.busy])

  if (!analyst?.open) return null

  const send = async (): Promise<void> => {
    const msg = text.trim()
    if (!msg || analyst.busy) return
    setText('')
    await askAnalyst(msg)
  }

  // 第一条 user 是注入的对局记录，不展示
  const visible = analyst.messages.slice(1)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeAnalysis()}>
      <div className="modal analyst-dialog">
        <div className="modal-head">
          <h2>{t.history.analystTitle.replace('{name}', analyst.targetName)}</h2>
          <button className="btn-close" onClick={closeAnalysis}>✕</button>
        </div>
        <div className="analyst-feed">
          {visible.map((m, i) => (
            <div key={i} className={`analyst-msg analyst-${m.role}`}>
              <pre>{m.content}</pre>
            </div>
          ))}
          {analyst.busy && <div className="thinking-dot">{t.table.thinking}</div>}
          <div ref={endRef} />
        </div>
        <div className="chat-input">
          <input
            value={text}
            placeholder={t.history.analystAsk}
            disabled={analyst.busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="btn-mini" onClick={send} disabled={!text.trim() || analyst.busy}>
            {t.chat.send}
          </button>
        </div>
      </div>
    </div>
  )
}
