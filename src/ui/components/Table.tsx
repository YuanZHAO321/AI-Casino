import React from 'react'
import { useStore } from '../store'
import { HandView, SeatView } from '@/games/blackjack/types'
import { PlayingCard, CardBack } from './PlayingCard'
import { BetPanel } from './BetPanel'
import { ActionBar } from './ActionBar'
import { ChipStack } from './Chip'
import { Avatar } from './Avatar'

function cardBackUrl(): string {
  return useStore.getState().settings.appearance.cardBackUrl ?? 'textures/card-back.png'
}

function Hand({
  hand,
  active,
  dealOffset
}: {
  hand: HandView
  active: boolean
  /** 开局错峰发牌的起始延迟基数 */
  dealOffset: number
}): React.JSX.Element {
  const t = useStore((s) => s.t)()
  return (
    <div className={`hand ${active ? 'hand-active' : ''} ${hand.bust || hand.surrendered ? 'hand-bust' : ''}`}>
      <div className="hand-cards">
        {hand.cards.map((c, i) => (
          <span
            key={i}
            className="card-slot card-deal"
            style={{ animationDelay: `${i < 2 ? dealOffset + i * 260 : 0}ms` }}
          >
            <PlayingCard label={c} />
          </span>
        ))}
      </div>
      <div className="hand-info">
        <span className="hand-total">{hand.soft ? `${hand.total}*` : hand.total}</span>
        {hand.doubled && <span className="hand-flag">2×</span>}
        {hand.blackjack && <span className="hand-flag flag-bj">BJ</span>}
        {hand.surrendered && <span className="hand-outcome oc-surrender">{t.outcomes.surrender}</span>}
        {hand.outcome && !hand.surrendered && (
          <span className={`hand-outcome oc-${hand.outcome}`}>{t.outcomes[hand.outcome]}</span>
        )}
      </div>
    </div>
  )
}

function Seat({
  seat,
  activeHand,
  arcStyle,
  dealOffset
}: {
  seat: SeatView
  activeHand?: number
  /** 扇形站位的位移/旋转 */
  arcStyle: React.CSSProperties
  dealOffset: number
}): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const thinking = useStore((s) => s.thinking)
  const oppBankrolls = useStore((s) => s.oppBankrolls)
  const personas = useStore((s) => s.personas)
  const settings = useStore((s) => s.settings)
  const isThinking = !seat.isHuman && thinking[seat.seatId]
  const persona = personas.find((p) => p.id === seat.seatId)
  const avatarUrl = seat.isHuman ? settings.playerAvatar : persona?.avatar
  const staked =
    seat.hands.reduce((n, h) => n + h.bet, 0) +
    Object.values(seat.sideBets).reduce((n, v) => n + (v ?? 0), 0) +
    seat.insuranceBet
  const bankroll = seat.isHuman ? settings.bankroll : oppBankrolls[seat.seatId]

  return (
    <div
      className={`seat ${seat.isYou ? 'seat-you' : ''} ${activeHand !== undefined ? 'seat-active' : ''}`}
      style={arcStyle}
    >
      <div className="seat-hands">
        {seat.hands.map((h, i) => (
          <Hand key={i} hand={h} active={activeHand === i} dealOffset={dealOffset} />
        ))}
      </div>
      <div className="seat-betline">
        {staked > 0 && (
          <span className="stake-stack">
            <ChipStack amount={staked} colors={settings.appearance.chipColors} />
          </span>
        )}
        {seat.insuranceBet > 0 && (
          <span className="sb">{t.table.insurance} £{seat.insuranceBet}</span>
        )}
      </div>
      <div className="seat-plate">
        <Avatar url={avatarUrl} name={seat.name} size={26} />
        <span className="seat-name">{seat.name}{seat.isYou ? ` · ${t.table.you}` : ''}</span>
        {isThinking && <span className="thinking-dot">{t.table.thinking}</span>}
        {seat.net !== undefined && (
          <span className={`seat-net ${seat.net >= 0 ? 'pos' : 'neg'}`}>
            {seat.net >= 0 ? '+' : ''}£{seat.net}
          </span>
        )}
      </div>
      {/* 身价筹码堆（当前全部筹码） */}
      {bankroll !== undefined && bankroll > 0 && (
        <div className="seat-bankroll-stack">
          <ChipStack amount={bankroll} colors={settings.appearance.chipColors} />
        </div>
      )}
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

/** 桌角发牌靴：一叠牌背朝上的牌 */
function ShoeStack(): React.JSX.Element {
  const view = useStore((s) => s.view)
  const session = useStore((s) => s.session)
  const newShoe = useStore((s) => s.newShoe)
  const t = useStore((s) => s.t)()
  const backUrl = cardBackUrl()
  const remaining = view?.seen.remaining ?? session?.shoe.remainingCount ?? 0
  const layers = Math.max(2, Math.min(7, Math.ceil(remaining / 50)))
  const inRound = view !== null && view.phase !== 'settled'
  return (
    <div className="shoe-stack" title={`${t.table.shoe}: ${remaining}`}>
      <div className="shoe-pile">
        {Array.from({ length: layers }, (_, i) => (
          <span key={i} className="shoe-card" style={{ transform: `translate(${i * 2}px, ${-i * 2}px)` }}>
            <CardBack w={52} url={backUrl} />
          </span>
        ))}
      </div>
      <div className="shoe-meta">
        <span>{t.table.cardsLeft} {remaining}</span>
        <button className="btn-mini btn-dim" disabled={inRound} onClick={newShoe}>
          {t.table.newShoe}
        </button>
      </div>
    </div>
  )
}

/** 赌场盈亏牌子（本局 / 本场累计），设置可关 */
function HousePlaque(): React.JSX.Element | null {
  const t = useStore((s) => s.t)()
  const settings = useStore((s) => s.settings)
  const history = useStore((s) => s.history)
  const lastRecord = useStore((s) => s.lastRecord)
  if (!settings.showHousePlaque) return null
  const matchId = settings.currentMatchId
  const matchRecords = history.filter((r) => r.matchId === matchId && r.round !== 0)
  const cumulative = matchRecords.reduce(
    (sum, r) => sum - r.seats.reduce((n, s) => n + s.net, 0),
    0
  )
  const roundHouse = lastRecord
    ? -lastRecord.seats.reduce((n, s) => n + s.net, 0)
    : null
  return (
    <div className="house-plaque">
      <span className="house-plaque-title">{t.table.housePlaque}</span>
      <span>
        {t.table.thisRound}{' '}
        <em className={roundHouse === null ? '' : roundHouse >= 0 ? 'pos' : 'neg'}>
          {roundHouse === null ? '—' : `${roundHouse >= 0 ? '+' : ''}£${roundHouse}`}
        </em>
      </span>
      <span>
        {t.table.cumulative}{' '}
        <em className={cumulative >= 0 ? 'pos' : 'neg'}>
          {cumulative >= 0 ? '+' : ''}£{cumulative}
        </em>
      </span>
    </div>
  )
}

export function Table(): React.JSX.Element {
  const view = useStore((s) => s.view)
  const session = useStore((s) => s.session)
  const awaiting = useStore((s) => s.awaiting)
  const stepPending = useStore((s) => s.stepPending)
  const continueStep = useStore((s) => s.continueStep)
  const t = useStore((s) => s.t)()
  const thinking = useStore((s) => s.thinking)
  const dealerPersona = session?.dealer?.persona
  const dealerThinking = dealerPersona && thinking[dealerPersona.id]
  const backUrl = cardBackUrl()

  const inRound = view !== null && view.phase !== 'settled'
  const seatCount = view?.seats.length ?? 0

  /** 扇形站位：中间低两侧高并微旋，模拟真实弧形 Blackjack 桌 */
  const arcStyleFor = (i: number): React.CSSProperties => {
    const c = i - (seatCount - 1) / 2
    return {
      transform: `translateY(${-Math.abs(c) * 30}px) rotate(${c * 4}deg)`
    }
  }

  return (
    <div className="table-wrap">
      <div className="felt">
        <div className="felt-arc-text">BLACKJACK PAYS 3 TO 2</div>
        <HousePlaque />
        <ShoeStack />
        <div className="dealer-zone">
          <div className="dealer-label">
            {t.table.dealer}
            {dealerPersona ? ` · ${dealerPersona.name}` : ''}
            {dealerThinking && <span className="thinking-dot"> {t.table.thinking}</span>}
          </div>
          <div className="dealer-cards">
            {view?.dealer.cards.length ? (
              view.dealer.cards.map((c, i) =>
                c === '??' ? (
                  <span
                    key={`hole-${i}`}
                    className="card-slot card-deal"
                    style={{ animationDelay: `${seatCount * 130 + 380}ms` }}
                  >
                    <CardBack w={70} url={backUrl} />
                  </span>
                ) : (
                  <span
                    key={`${i}-${c}`}
                    className={`card-slot ${!view.dealer.holeCardHidden && i === 1 ? 'card-flip' : 'card-deal'}`}
                    style={i === 0 ? { animationDelay: `${seatCount * 130 + 120}ms` } : undefined}
                  >
                    <PlayingCard label={c} w={70} />
                  </span>
                )
              )
            ) : (
              <div className="dealer-placeholder">♠ ♥ ♦ ♣</div>
            )}
          </div>
          {view && view.dealer.total !== null && (
            <div className="dealer-total">
              {view.dealer.soft ? `${view.dealer.total}*` : view.dealer.total}
              {view.dealer.holeCardHidden && <span className="hole-hint"> + ?</span>}
              {view.dealer.blackjack && <span className="hand-flag flag-bj">BJ</span>}
              {view.dealer.bust && <span className="hand-outcome oc-bust">{t.outcomes.bust}</span>}
            </div>
          )}
        </div>

        <div className="seats-row seats-arc">
          {view?.seats.map((seat, i) => (
            <Seat
              key={seat.seatId}
              seat={seat}
              activeHand={view.activeSeatId === seat.seatId ? view.activeHandIndex ?? 0 : undefined}
              arcStyle={arcStyleFor(i)}
              dealOffset={i * 130}
            />
          ))}
          {!view && <div className="table-waiting">{t.table.waiting}</div>}
        </div>

        <div className="table-bottom">
          {stepPending ? (
            <div className="step-bar">
              <span className="step-hint">{t.table.stepWait}</span>
              <button className="btn-deal" onClick={continueStep}>
                {t.table.stepGo.replace('{name}', stepPending.personaName)}
              </button>
            </div>
          ) : awaiting ? (
            <ActionBar legal={awaiting.legal} />
          ) : !inRound ? (
            <BetPanel />
          ) : null}
        </div>
      </div>
    </div>
  )
}
