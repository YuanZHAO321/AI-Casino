import React, { useState } from 'react'
import { useStore } from '../store'
import { Chip, ChipStack } from './Chip'

export function BetPanel(): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const settings = useStore((s) => s.settings)
  const deal = useStore((s) => s.deal)
  const rebuy = useStore((s) => s.rebuy)
  const busy = useStore((s) => s.busyDealing)
  const lastRecord = useStore((s) => s.lastRecord)
  const savePlayerNote = useStore((s) => s.savePlayerNote)

  const [staged, setStaged] = useState(0) // 等候区
  const [bet, setBet] = useState(0) // 注位
  const [pairs, setPairs] = useState(0)
  const [tpt, setTpt] = useState(0)
  const [top3, setTop3] = useState(0)
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)

  const { minBet, maxBet } = settings.rules
  const colors = settings.appearance.chipColors
  const denoms = Object.keys(colors).map(Number).sort((a, b) => a - b)
  const total = bet + pairs + tpt + top3
  const broke = settings.bankroll < minBet
  const canDeal = !busy && !broke && bet >= minBet && bet <= maxBet && total <= settings.bankroll

  const cap = (v: number): number => Math.min(maxBet, Math.min(settings.bankroll, v))

  const pushStaged = (): void => {
    setBet((b) => cap(b + staged))
    setStaged(0)
  }

  const clearAll = (): void => {
    setBet(0)
    setStaged(0)
    setPairs(0)
    setTpt(0)
    setTop3(0)
  }

  const repeat = (): void => {
    const lb = settings.lastBet
    if (!lb) return
    setBet(cap(lb.bet))
    setStaged(0)
    setPairs(lb.sideBets['pairs'] ?? 0)
    setTpt(lb.sideBets['twentyOnePlusThree'] ?? 0)
    setTop3(lb.sideBets['top3'] ?? 0)
  }

  const allIn = (): void => {
    setStaged(0)
    setPairs(0)
    setTpt(0)
    setTop3(0)
    setBet(cap(settings.bankroll))
  }

  const onDrop = (zone: 'staged' | 'bet') => (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const chip = Number(e.dataTransfer.getData('text/chip'))
    const fromStaged = e.dataTransfer.getData('text/staged') !== ''
    if (zone === 'bet') {
      if (chip > 0) setBet((b) => cap(b + chip))
      else if (fromStaged) pushStaged()
    } else if (chip > 0) {
      // 待押区只接收托盘筹码；待押堆拖回自身 = 无操作（防自反馈误推注）
      setStaged((s) => s + chip)
    }
  }

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
        {/* 筹码托盘 */}
        <div className="chip-rack" title={t.table.dragHint}>
          {denoms.map((d) => (
            <Chip
              key={d}
              value={d}
              color={colors[d]}
              dimmed={d > settings.bankroll}
              onClick={() => setStaged((s) => s + d)}
              onDoubleClick={() => setBet((b) => cap(b + d))}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/chip', String(d))}
            />
          ))}
        </div>

        {/* 等候区：拖筹码进来暂存；「押上」按钮或把堆拖到注位才入注 */}
        <div
          className="bet-zone staged-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop('staged')}
        >
          <label>{t.table.staged}</label>
          {staged > 0 ? (
            <>
              <div
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/staged', '1')}
              >
                <ChipStack amount={staged} colors={colors} />
              </div>
              <button className="btn-mini btn-push-stake" onClick={pushStaged}>
                {t.table.pushStake} →
              </button>
            </>
          ) : (
            <span className="zone-empty">—</span>
          )}
        </div>

        {/* 注位 */}
        <div
          className="bet-zone bet-spot"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop('bet')}
        >
          <label>{t.table.bet}</label>
          {bet > 0 ? <ChipStack amount={bet} colors={colors} /> : <span className="zone-empty">○</span>}
          <input
            type="number"
            value={bet || ''}
            min={0}
            max={maxBet}
            placeholder="0"
            onChange={(e) => setBet(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          />
        </div>

        {/* 边注 */}
        <div className="side-bets">
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
                value={value || ''}
                placeholder="0"
                min={0}
                onChange={(e) => setter(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </span>
          ))}
        </div>

        <div className="bet-actions">
          <div className="bet-quick">
            <button className="btn-mini" onClick={repeat} disabled={!settings.lastBet || busy}>
              {t.table.repeatBet}
            </button>
            <button className="btn-mini" onClick={clearAll} disabled={busy}>
              {t.table.clearBet}
            </button>
            <button className="btn-mini" onClick={allIn} disabled={busy || broke}>
              {t.table.allIn}
            </button>
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
      </div>
      <div className="bet-limits">
        {t.table.minMax} £{minBet}–£{maxBet}
      </div>
    </div>
  )
}
