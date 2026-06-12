import { cardLabel } from '@/core/cards'
import { SeenSummary } from '@/core/shoe'
import { BlackjackState, HandView, SeatView, TableView } from './types'
import { handValue, isBlackjack } from './hand'

/**
 * 视角投影 —— 防天眼的唯一出口。
 *
 * 隐藏信息有两处，投影层负责抹除：
 *  1. 牌靴（未发的牌）：TableView 类型上不存在；
 *  2. 庄家暗牌（holeCard 规则）：揭示前 cards 用 '??' 占位、total 只计明牌，
 *     且从已发牌汇总(seen)中扣除（暗牌虽已抽出但没人见过，记牌者不能数它）。
 */
export function projectView(state: BlackjackState, viewerId: string): TableView {
  const holeHidden =
    state.rules.holeCard && state.dealerCards.length >= 2 && !state.holeRevealed
  const visibleDealerCards = holeHidden ? [state.dealerCards[0]] : state.dealerCards
  const dv = handValue(visibleDealerCards)

  const seats: SeatView[] = state.seats.map((seat) => ({
    seatId: seat.seatId,
    name: seat.name,
    isYou: seat.seatId === viewerId,
    isHuman: seat.isHuman,
    baseBet: seat.baseBet,
    sideBets: seat.sideBets,
    sideBetResults: seat.sideBetResults,
    insuranceBet: seat.insuranceBet,
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
        surrendered: hand.surrendered,
        done: hand.done,
        bet: hand.bet,
        outcome: state.phase === 'settled' ? seat.outcomes[i] : undefined
      }
    })
  }))

  // 已发牌汇总：扣除未揭示的暗牌
  const rawSeen = state.shoe.seenSummary()
  let seen: SeenSummary = rawSeen
  if (holeHidden) {
    const hole = state.dealerCards[1]
    seen = {
      ...rawSeen,
      dealt: rawSeen.dealt - 1,
      byRank: { ...rawSeen.byRank, [hole.rank]: rawSeen.byRank[hole.rank] - 1 }
    }
  }

  return {
    game: 'blackjack',
    round: state.roundNo,
    phase: state.phase,
    rules: {
      decks: state.rules.decks,
      hitSoft17: state.rules.hitSoft17,
      splitAcesOneCard: state.rules.splitAcesOneCard,
      doubleAfterSplit: state.rules.doubleAfterSplit,
      holeCard: state.rules.holeCard,
      peek: state.rules.peek,
      insurance: state.rules.insurance,
      lateSurrender: state.rules.lateSurrender,
      doubleRestriction: state.rules.doubleRestriction,
      maxSplitHands: state.rules.maxSplitHands,
      minBet: state.rules.minBet,
      maxBet: state.rules.maxBet
    },
    dealer: {
      cards: [
        ...visibleDealerCards.map(cardLabel),
        ...(holeHidden ? ['??'] : [])
      ],
      total: state.dealerCards.length ? dv.total : null,
      soft: dv.soft,
      blackjack: !holeHidden && state.dealerCards.length === 2 && dv.total === 21,
      bust: dv.total > 21,
      holeCardHidden: holeHidden
    },
    seats,
    activeSeatId:
      state.phase === 'acting' || state.phase === 'insurance'
        ? state.seats[state.activeSeatIndex]?.seatId
        : undefined,
    activeHandIndex: state.phase === 'acting' ? state.activeHandIndex : undefined,
    seen,
    shuffledThisRound: state.shuffledThisRound
  }
}
