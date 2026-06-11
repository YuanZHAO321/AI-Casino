import { cardLabel } from '@/core/cards'
import { BlackjackState, HandView, SeatView, TableView } from './types'
import { handValue, isBlackjack } from './hand'

/**
 * 视角投影 —— 防天眼的唯一出口。
 *
 * 21 点所有已发牌均为明牌，因此各视角内容一致；但任何 prompt 构建只允许
 * 消费 TableView，TableView 在类型上不含牌靴与未发牌。viewerId 用于标记
 * isYou（对手视角）；'companion' 与 'dealer' 同玩家可见信息。
 */
export function projectView(state: BlackjackState, viewerId: string): TableView {
  const dv = handValue(state.dealerCards)
  const seats: SeatView[] = state.seats.map((seat) => ({
    seatId: seat.seatId,
    name: seat.name,
    isYou: seat.seatId === viewerId,
    isHuman: seat.isHuman,
    baseBet: seat.baseBet,
    sideBets: seat.sideBets,
    sideBetResults: seat.sideBetResults,
    net: state.phase === 'settled' ? seat.net : undefined,
    hands: seat.hands.map((hand, i): HandView => {
      const v = handValue(hand.cards)
      return {
        cards: hand.cards.map(cardLabel),
        total: v.total,
        soft: v.soft,
        bust: hand.bust,
        blackjack: isBlackjack(hand),
        doubled: hand.doubled,
        fromSplit: hand.fromSplit,
        done: hand.done,
        bet: hand.bet,
        outcome: state.phase === 'settled' ? seat.outcomes[i] : undefined
      }
    })
  }))

  return {
    game: 'blackjack',
    round: state.roundNo,
    phase: state.phase,
    rules: {
      decks: state.rules.decks,
      hitSoft17: state.rules.hitSoft17,
      splitAcesOneCard: state.rules.splitAcesOneCard,
      doubleAfterSplit: state.rules.doubleAfterSplit,
      minBet: state.rules.minBet,
      maxBet: state.rules.maxBet
    },
    dealer: {
      cards: state.dealerCards.map(cardLabel),
      total: state.dealerCards.length ? dv.total : null,
      soft: dv.soft,
      blackjack: state.dealerCards.length === 2 && dv.total === 21,
      bust: dv.total > 21
    },
    seats,
    activeSeatId:
      state.phase === 'acting' ? state.seats[state.activeSeatIndex]?.seatId : undefined,
    activeHandIndex: state.phase === 'acting' ? state.activeHandIndex : undefined,
    seen: state.shoe.seenSummary(),
    shuffledThisRound: state.shuffledThisRound
  }
}
