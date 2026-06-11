import React, { useState } from 'react'
import { useStore } from '../store'
import { Modal } from './Modal'
import { computeGlobalStats, computeCharacterStats } from '@/core/stats'
import { LOCAL_BOT_PROFILE_ID, RoundRecord } from '@/core/types'

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
        <span className="rec-round">#{record.round}</span>
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
          {record.seats.map((s) => (
            <div key={s.seatId} className="rec-seat">
              {s.personaName}
              {s.modelLabel ? ` (${s.modelLabel})` : ''}: {s.outcome},
              {s.net >= 0 ? ' +' : ' '}£{s.net}
            </div>
          ))}
          {Object.entries(record.declarations).length > 0 && (
            <div className="rec-declarations">
              <strong>{t.history.declarations}</strong>
              {Object.entries(record.declarations).map(([id, text]) => (
                <div key={id}>
                  「{nameOf(id)}」{text}
                </div>
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
  const reports = useStore((s) => s.reports)
  const profiles = useStore((s) => s.profiles)
  const makeReport = useStore((s) => s.makeReport)
  const clearHistory = useStore((s) => s.clearHistory)
  const setModal = useStore((s) => s.setModal)
  const [tab, setTab] = useState<'records' | 'stats' | 'report'>('records')
  const [reportProfileId, setReportProfileId] = useState(
    profiles.find((p) => p.id !== LOCAL_BOT_PROFILE_ID)?.id ?? ''
  )
  const [generating, setGenerating] = useState(false)

  const g = computeGlobalStats(history)
  const chars = computeCharacterStats(history)

  const generate = async (): Promise<void> => {
    setGenerating(true)
    await makeReport(reportProfileId)
    setGenerating(false)
  }

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
          {[...history].reverse().map((r) => (
            <RecordRow key={r.id} record={r} />
          ))}
          {history.length > 0 && (
            <button className="btn-danger" onClick={clearHistory}>
              {t.history.clearAll}
            </button>
          )}
        </div>
      )}

      {tab === 'stats' && (
        <div className="stats-pane">
          <h3>{t.history.globalStats}</h3>
          <table className="stats-table">
            <tbody>
              <tr>
                <td>{t.history.rounds}</td><td>{g.rounds}</td>
                <td>{t.history.net}</td>
                <td className={g.playerNet >= 0 ? 'pos' : 'neg'}>{g.playerNet >= 0 ? '+' : ''}£{g.playerNet}</td>
              </tr>
              <tr>
                <td>{t.history.winRate}</td><td>{(g.winRate * 100).toFixed(1)}%</td>
                <td>{t.history.blackjacks}</td><td>{g.blackjacks}</td>
              </tr>
              <tr>
                <td>{t.history.busts}</td><td>{g.busts}</td>
                <td>{t.history.rebuys}</td><td>{g.rebuys}</td>
              </tr>
              <tr>
                <td>{t.history.biggestWin}</td><td className="pos">+£{g.biggestWin}</td>
                <td>{t.history.biggestLoss}</td><td className="neg">£{g.biggestLoss}</td>
              </tr>
            </tbody>
          </table>
          <h3>{t.history.charStats}</h3>
          <table className="stats-table">
            <thead>
              <tr>
                <th></th>
                <th>{t.history.rounds}</th>
                <th>{t.history.net}</th>
                <th>{t.history.winRate}</th>
                <th>{t.history.blackjacks}</th>
                <th>{t.history.busts}</th>
              </tr>
            </thead>
            <tbody>
              {chars.map((c) => (
                <tr key={c.key}>
                  <td>{c.key}</td>
                  <td>{c.rounds}</td>
                  <td className={c.net >= 0 ? 'pos' : 'neg'}>{c.net >= 0 ? '+' : ''}£{c.net}</td>
                  <td>{(c.winRate * 100).toFixed(1)}%</td>
                  <td>{c.blackjacks}</td>
                  <td>{c.busts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'report' && (
        <div className="report-pane">
          <div className="form-row">
            <label>{t.history.reportProfile}</label>
            <select value={reportProfileId} onChange={(e) => setReportProfileId(e.target.value)}>
              {profiles
                .filter((p) => p.id !== LOCAL_BOT_PROFILE_ID)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.model})
                  </option>
                ))}
            </select>
            <button
              className="btn-primary"
              disabled={generating || !reportProfileId || history.length === 0}
              onClick={generate}
            >
              {generating ? t.history.generating : t.history.generate}
            </button>
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
