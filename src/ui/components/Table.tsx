import React from 'react'
import { useStore } from '../store'
import { HandView, SeatView } from '@/games/blackjack/types'
import { PlayingCard } from './PlayingCard'
import { BetPanel } from './BetPanel'
import { ActionBar } from './ActionBar'

function Hand({ hand, active }: { hand: HandView; active: boolean }): React.JSX.Element {
  const t = useStore((s) => s.t)()
  return (
    <div className={`hand ${active ? 'hand-active' : ''} ${hand.bust ? 'hand-bust' : ''}`}>
      <div className="hand-cards">
        {hand.cards.map((c, i) => (
          <PlayingCard key={i} label={c} />
        ))}
      </div>
      <div className="hand-info">
        <span className="hand-total">{hand.soft ? `${hand.total}*` : hand.total}</span>
        {hand.doubled && <span className="hand-flag">2×</span>}
        {hand.blackjack && <span className="hand-flag flag-bj">BJ</span>}
        {hand.outcome && (
          <span className={`hand-outcome oc-${hand.outcome}`}>{t.outcomes[hand.outcome]}</span>
        )}
        <span className="hand-bet">£{hand.bet}</span>
      </div>
    </div>
  )
}

function Seat({ seat, activeHand }: { seat: SeatView; activeHand?: number }): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const thinking = useStore((s) => s.thinking)
  const oppBankrolls = useStore((s) => s.oppBankrolls)
  const isThinking = !seat.isHuman && thinking[seat.seatId]
  return (
    <div className={`seat ${seat.isYou ? 'seat-you' : ''} ${activeHand !== undefined ? 'seat-active' : ''}`}>
      <div className="seat-hands">
        {seat.hands.map((h, i) => (
          <Hand key={i} hand={h} active={activeHand === i} />
        ))}
      </div>
      <div className="seat-plate">
        <span className="seat-name">
          {seat.name}
          {seat.isYou ? ` · ${t.table.you}` : ''}
        </span>
        {isThinking && <span className="thinking-dot">{t.table.thinking}</span>}
        {!seat.isHuman && oppBankrolls[seat.seatId] !== undefined && (
          <span className="seat-bankroll">£{oppBankrolls[seat.seatId]}</span>
        )}
        {seat.net !== undefined && (
          <span className={`seat-net ${seat.net >= 0 ? 'pos' : 'neg'}`}>
            {seat.net >= 0 ? '+' : ''}£{seat.net}
          </span>
        )}
      </div>
      {seat.sideBetResults.length > 0 && (
        <div className="seat-sidebets">
          {seat.sideBetResults.map((r, i) => (
            <span key={i} className={`sb ${r.hit ? 'sb-hit' : ''}`}>
              {t.table[r.kind]}
              {r.hit ? ` ${t.sideBetHits[r.hit as keyof typeof t.sideBetHits] ?? r.hit} +£${r.net}` : ` -£${r.stake}`}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function Table(): React.JSX.Element {
  const view = useStore((s) => s.view)
  const session = useStore((s) => s.session)
  const awaiting = useStore((s) => s.awaiting)
  const t = useStore((s) => s.t)()
  const thinking = useStore((s) => s.thinking)
  const dealerThinking = session?.dealer && thinking[session.dealer.persona.id]

  const inRound = view !== null && view.phase !== 'settled'

  return (
    <div className="table-wrap">
      <div className="felt">
        <div className="felt-arc-text">BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON 17</div>
        <div className="dealer-zone">
          <div className="dealer-label">
            {t.table.dealer}
            {session?.dealer ? ` · ${session.dealer.persona.name}` : ''}
            {dealerThinking && <span className="thinking-dot"> {t.table.thinking}</span>}
          </div>
          <div className="dealer-cards">
            {view?.dealer.cards.length ? (
              view.dealer.cards.map((c, i) => <PlayingCard key={i} label={c} w={70} />)
            ) : (
              <div className="dealer-placeholder">♠ ♥ ♦ ♣</div>
            )}
          </div>
          {view && view.dealer.total !== null && (
            <div className="dealer-total">
              {view.dealer.soft ? `${view.dealer.total}*` : view.dealer.total}
              {view.dealer.blackjack && <span className="hand-flag flag-bj">BJ</span>}
              {view.dealer.bust && <span className="hand-outcome oc-bust">{t.outcomes.bust}</span>}
            </div>
          )}
        </div>

        <div className="seats-row">
          {view?.seats.map((seat) => (
            <Seat
              key={seat.seatId}
              seat={seat}
              activeHand={
                view.activeSeatId === seat.seatId ? view.activeHandIndex : undefined
              }
            />
          ))}
          {!view && <div className="table-waiting">{t.table.waiting}</div>}
        </div>

        <div className="table-bottom">
          {awaiting ? <ActionBar legal={awaiting.legal} /> : !inRound ? <BetPanel /> : null}
        </div>
      </div>
    </div>
  )
}
