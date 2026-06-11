import React, { useState } from 'react'
import { useStore } from '../store'

const CHIP_VALUES = [10, 25, 50, 100, 500]

export function BetPanel(): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const settings = useStore((s) => s.settings)
  const deal = useStore((s) => s.deal)
  const rebuy = useStore((s) => s.rebuy)
  const busy = useStore((s) => s.busyDealing)
  const lastRecord = useStore((s) => s.lastRecord)
  const savePlayerNote = useStore((s) => s.savePlayerNote)
  const [bet, setBet] = useState(settings.rules.minBet)
  const [pairs, setPairs] = useState(0)
  const [tpt, setTpt] = useState(0)
  const [top3, setTop3] = useState(0)
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)

  const { minBet, maxBet } = settings.rules
  const total = bet + pairs + tpt + top3
  const broke = settings.bankroll < minBet
  const canDeal = !busy && !broke && bet >= minBet && bet <= maxBet && total <= settings.bankroll

  const addChip = (v: number): void => setBet((b) => Math.min(maxBet, Math.min(settings.bankroll, b + v)))

  const onDeal = async (): Promise<void> => {
    setNote('')
    setNoteSaved(false)
    await deal(bet, {
      pairs: pairs || undefined,
      twentyOnePlusThree: tpt || undefined,
      top3: top3 || undefined
    })
  }

  return (
    <div className="bet-panel">
      {lastRecord && (
        <div className="settle-note">
          <span className={`settle-net ${lastRecord.playerNet >= 0 ? 'pos' : 'neg'}`}>
            {t.table.settled}: {lastRecord.playerNet >= 0 ? '+' : ''}£{lastRecord.playerNet}
          </span>
          <input
            value={note}
            placeholder={t.table.playerNotePlaceholder}
            onChange={(e) => {
              setNote(e.target.value)
              setNoteSaved(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && note.trim()) {
                savePlayerNote(lastRecord.id, note.trim())
                setNoteSaved(true)
              }
            }}
          />
          <button
            className="btn-ghost"
            disabled={!note.trim() || noteSaved}
            onClick={() => {
              savePlayerNote(lastRecord.id, note.trim())
              setNoteSaved(true)
            }}
          >
            {noteSaved ? '✓' : t.table.saveNote}
          </button>
        </div>
      )}
      <div className="bet-main">
        <div className="chip-rack">
          {CHIP_VALUES.map((v) => (
            <button key={v} className={`chip chip-${v}`} onClick={() => addChip(v)} disabled={busy}>
              {v}
            </button>
          ))}
          <button className="chip chip-clear" onClick={() => setBet(minBet)} disabled={busy}>
            ↺
          </button>
        </div>
        <div className="bet-amount">
          <label>{t.table.bet}</label>
          <input
            type="number"
            value={bet}
            min={minBet}
            max={maxBet}
            onChange={(e) => setBet(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          />
        </div>
        <div className="side-bets">
          <label>{t.table.sideBets}</label>
          {(
            [
              [t.table.pairs, pairs, setPairs],
              [t.table.twentyOnePlusThree, tpt, setTpt],
              [t.table.top3, top3, setTop3]
            ] as [string, number, (n: number) => void][]
          ).map(([label, value, setter]) => (
            <span key={label} className="side-bet-input">
              <em>{label}</em>
              <input
                type="number"
                value={value}
                min={0}
                onChange={(e) => setter(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </span>
          ))}
        </div>
        {broke ? (
          <button className="btn-deal btn-rebuy" onClick={rebuy}>
            {t.table.rebuy}
          </button>
        ) : (
          <button className="btn-deal" disabled={!canDeal} onClick={onDeal}>
            {busy ? '…' : t.table.deal}
          </button>
        )}
      </div>
      <div className="bet-limits">
        {t.table.minMax} £{minBet}–£{maxBet}
      </div>
    </div>
  )
}
