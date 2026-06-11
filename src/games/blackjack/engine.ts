import { Shoe } from '@/core/shoe'
import {
  BlackjackAction, BlackjackRules, BlackjackState, Hand, HandOutcome,
  Phase, SeatState, SideBetStakes
} from './types'
import { handValue, isBlackjack, isPair } from './hand'
import { evaluate21Plus3, evaluatePairs, evaluateTop3 } from './sideBets'

export interface SeatBetInput {
  seatId: string
  isHuman: boolean
  personaId?: string
  name: string
  bet: number
  sideBets: SideBetStakes
}

/** 创建一靴（跨局复用，切牌到达后局间重洗） */
export function createShoe(rules: BlackjackRules): Shoe {
  return new Shoe(rules.decks, rules.penetration)
}

function makeHand(bet: number, fromSplit = false, fromSplitAces = false): Hand {
  return { cards: [], bet, doubled: false, fromSplit, fromSplitAces, done: false, bust: false }
}

/**
 * 开局：收注 → 发牌（每人两张明牌，庄家一张明牌，英式无暗牌）→ 立即结算边注。
 * 发牌顺序拟真：先给每人一张，庄家一张，再给每人第二张。
 */
export function startRound(
  shoe: Shoe,
  rules: BlackjackRules,
  roundNo: number,
  bets: SeatBetInput[]
): BlackjackState {
  let shuffledThisRound = false
  if (shoe.cutCardReached) {
    shoe.reshuffle()
    shuffledThisRound = true
  }
  for (const b of bets) {
    if (b.bet < rules.minBet || b.bet > rules.maxBet) {
      throw new Error(`下注 £${b.bet} 超出台注限红 £${rules.minBet}–£${rules.maxBet}`)
    }
  }
  const seats: SeatState[] = bets.map((b) => ({
    seatId: b.seatId,
    isHuman: b.isHuman,
    personaId: b.personaId,
    name: b.name,
    baseBet: b.bet,
    sideBets: b.sideBets,
    sideBetResults: [],
    hands: [makeHand(b.bet)],
    outcomes: [],
    net: 0
  }))

  const state: BlackjackState = {
    rules,
    shoe,
    phase: 'betting',
    roundNo,
    seats,
    dealerCards: [],
    activeSeatIndex: 0,
    activeHandIndex: 0,
    shuffledThisRound
  }

  // 第一轮发牌
  for (const seat of seats) seat.hands[0].cards.push(shoe.draw())
  state.dealerCards.push(shoe.draw())
  for (const seat of seats) seat.hands[0].cards.push(shoe.draw())

  // 边注立即结算（发牌后、行动前，按文档）
  const dealerUp = state.dealerCards[0]
  for (const seat of seats) {
    const firstTwo = seat.hands[0].cards
    if (seat.sideBets.twentyOnePlusThree) {
      seat.sideBetResults.push(evaluate21Plus3(firstTwo, dealerUp, seat.sideBets.twentyOnePlusThree))
    }
    if (seat.sideBets.pairs) {
      seat.sideBetResults.push(evaluatePairs(firstTwo, rules.decks, seat.sideBets.pairs))
    }
    if (seat.sideBets.top3) {
      seat.sideBetResults.push(evaluateTop3(firstTwo, dealerUp, seat.sideBets.top3))
    }
  }
  state.phase = 'sidebets-settled'

  // 天生 BJ / 21 的手直接完成，行动指针推进到第一个需要决策的手
  for (const seat of seats) {
    const h = seat.hands[0]
    if (handValue(h.cards).total === 21) h.done = true
  }
  state.phase = 'acting'
  advancePointer(state)
  return state
}

function activeHand(state: BlackjackState): Hand | null {
  const seat = state.seats[state.activeSeatIndex]
  if (!seat) return null
  return seat.hands[state.activeHandIndex] ?? null
}

/** 推进到下一个未完成的手；全部完成则进入庄家阶段 */
function advancePointer(state: BlackjackState): void {
  while (state.activeSeatIndex < state.seats.length) {
    const seat = state.seats[state.activeSeatIndex]
    while (state.activeHandIndex < seat.hands.length) {
      const h = seat.hands[state.activeHandIndex]
      if (!h.done) return
      state.activeHandIndex++
    }
    state.activeSeatIndex++
    state.activeHandIndex = 0
  }
  state.phase = 'dealer'
}

export function getLegalActions(state: BlackjackState): BlackjackAction[] {
  if (state.phase !== 'acting') return []
  const seat = state.seats[state.activeSeatIndex]
  const hand = activeHand(state)
  if (!seat || !hand || hand.done) return []
  const actions: BlackjackAction[] = ['hit', 'stand']
  const firstTwo = hand.cards.length === 2
  if (firstTwo && !hand.doubled) {
    const doubleAllowed = hand.fromSplit ? state.rules.doubleAfterSplit : true
    if (doubleAllowed && !hand.fromSplitAces) actions.push('double')
  }
  // 仅前两张为对子可分，且不可再分（fromSplit 的手不能 split）
  if (firstTwo && !hand.fromSplit && isPair(hand.cards) && seat.hands.length === 1) {
    actions.push('split')
  }
  return actions
}

export function applyAction(state: BlackjackState, action: BlackjackAction): BlackjackState {
  const legal = getLegalActions(state)
  if (!legal.includes(action)) {
    throw new Error(`非法操作 ${action}，当前合法：${legal.join('/')}`)
  }
  const seat = state.seats[state.activeSeatIndex]
  const hand = activeHand(state)!

  switch (action) {
    case 'hit': {
      hand.cards.push(state.shoe.draw())
      finishIfNeeded(state, hand)
      break
    }
    case 'stand': {
      hand.done = true
      break
    }
    case 'double': {
      hand.doubled = true
      hand.bet *= 2
      hand.cards.push(state.shoe.draw())
      hand.bust = handValue(hand.cards).total > 21
      hand.done = true // 加倍只买一张
      break
    }
    case 'split': {
      const [c1, c2] = hand.cards
      const aces = c1.rank === 'A'
      const h1 = makeHand(seat.baseBet, true, aces)
      const h2 = makeHand(seat.baseBet, true, aces)
      h1.cards.push(c1, state.shoe.draw())
      h2.cards.push(c2, state.shoe.draw())
      seat.hands = [h1, h2]
      for (const h of seat.hands) {
        if (state.rules.splitAcesOneCard && aces) h.done = true
        else if (handValue(h.cards).total === 21) h.done = true // 分牌后 21 自动停
      }
      // 指针留在第一手
      state.activeHandIndex = 0
      if (seat.hands[0].done) advancePointer(state)
      return state
    }
  }
  advancePointer(state)
  return state
}

function finishIfNeeded(state: BlackjackState, hand: Hand): void {
  const v = handValue(hand.cards)
  if (v.total > 21) {
    hand.bust = true
    hand.done = true
  } else if (v.total === 21) {
    hand.done = true
  } else if (hand.fromSplitAces && state.rules.splitAcesOneCard) {
    hand.done = true
  }
}

/**
 * 庄家阶段：若场上还有未爆的手，庄家补牌到 ≥17（S17/H17 按规则），否则直接翻第二张省略。
 * 现实中所有人都爆牌庄家不补牌；这里保持拟真：全爆则不补。
 */
export function playDealer(state: BlackjackState): BlackjackState {
  if (state.phase !== 'dealer') throw new Error(`阶段错误：${state.phase}`)
  const anyLive = state.seats.some((s) => s.hands.some((h) => !h.bust))
  if (anyLive) {
    for (;;) {
      const v = handValue(state.dealerCards)
      if (v.total > 21) break
      if (v.total > 17) break
      if (v.total === 17 && !(v.soft && state.rules.hitSoft17)) break
      state.dealerCards.push(state.shoe.draw())
    }
  }
  return settle(state)
}

/** 结算（ENHC：庄家 BJ 时所有注全输，玩家 BJ 推局） */
function settle(state: BlackjackState): BlackjackState {
  const dv = handValue(state.dealerCards)
  const dealerBJ = state.dealerCards.length === 2 && dv.total === 21
  const dealerBust = dv.total > 21

  for (const seat of state.seats) {
    let net = 0
    seat.outcomes = []
    for (const hand of seat.hands) {
      const hv = handValue(hand.cards)
      const bj = isBlackjack(hand)
      let outcome: HandOutcome
      if (hand.bust) {
        outcome = 'bust'
        net -= hand.bet
      } else if (dealerBJ) {
        outcome = bj ? 'push' : 'dealer-blackjack'
        if (!bj) net -= hand.bet
      } else if (bj) {
        outcome = 'blackjack'
        net += hand.bet * 1.5
      } else if (dealerBust) {
        outcome = 'win'
        net += hand.bet
      } else if (hv.total > dv.total) {
        outcome = 'win'
        net += hand.bet
      } else if (hv.total === dv.total) {
        outcome = 'push'
      } else {
        outcome = 'lose'
        net -= hand.bet
      }
      seat.outcomes.push(outcome)
    }
    for (const r of seat.sideBetResults) net += r.net
    seat.net = net
  }
  state.phase = 'settled'
  return state
}

export function phaseOf(state: BlackjackState): Phase {
  return state.phase
}

export function activeSeat(state: BlackjackState): SeatState | null {
  return state.phase === 'acting' ? state.seats[state.activeSeatIndex] ?? null : null
}
