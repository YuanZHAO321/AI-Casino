import { Shoe } from '@/core/shoe'
import { rankValue } from './hand'
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
  return {
    cards: [], bet, doubled: false, fromSplit, fromSplitAces,
    surrendered: false, done: false, bust: false
  }
}

/**
 * 开局：收注 → 发牌 → 立即结算边注 → （保险阶段）→（偷看）→ 行动阶段。
 * 发牌顺序拟真：每人一张 → 庄家明牌 → 每人第二张 →（美式）庄家暗牌。
 * 返回状态的 phase 可能为 'insurance' | 'acting' | 'settled'（偷看命中 BJ）。
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
    insuranceBet: 0,
    insuranceDecided: false,
    net: 0
  }))

  const state: BlackjackState = {
    rules,
    shoe,
    phase: 'betting',
    roundNo,
    seats,
    dealerCards: [],
    holeRevealed: false,
    activeSeatIndex: 0,
    activeHandIndex: 0,
    shuffledThisRound
  }

  // 发牌
  for (const seat of seats) seat.hands[0].cards.push(shoe.draw())
  state.dealerCards.push(shoe.draw())
  for (const seat of seats) seat.hands[0].cards.push(shoe.draw())
  if (rules.holeCard) state.dealerCards.push(shoe.draw()) // 暗牌

  // 边注立即结算（只用庄家明牌）
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

  // 天生 21 的手自动停
  for (const seat of seats) {
    if (handValue(seat.hands[0].cards).total === 21) seat.hands[0].done = true
  }

  // 保险阶段（明牌 A）
  if (rules.insurance && dealerUp.rank === 'A') {
    state.phase = 'insurance'
    state.activeSeatIndex = 0
    return state
  }
  return proceedAfterInsurance(state)
}

/** 保险决策完成后：偷看 → 行动或立即结算 */
function proceedAfterInsurance(state: BlackjackState): BlackjackState {
  const { rules } = state
  const up = state.dealerCards[0]
  if (rules.holeCard && rules.peek && (up.rank === 'A' || rankValue(up.rank) === 10)) {
    if (handValue(state.dealerCards).total === 21 && state.dealerCards.length === 2) {
      state.holeRevealed = true
      return settle(state) // 庄家 BJ，立即结算（保险在 settle 中赔付）
    }
  }
  state.phase = 'acting'
  state.activeSeatIndex = 0
  state.activeHandIndex = 0
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

function doubleAllowed(hand: Hand, state: BlackjackState): boolean {
  if (hand.cards.length !== 2 || hand.doubled || hand.fromSplitAces) return false
  if (hand.fromSplit && !state.rules.doubleAfterSplit) return false
  const r = state.rules.doubleRestriction
  if (r === 'any') return true
  const v = handValue(hand.cards)
  if (v.soft) return false
  const lo = r === '9-11' ? 9 : 10
  return v.total >= lo && v.total <= 11
}

export function getLegalActions(state: BlackjackState): BlackjackAction[] {
  if (state.phase === 'insurance') {
    const seat = state.seats[state.activeSeatIndex]
    return seat && !seat.insuranceDecided ? ['insure', 'no-insurance'] : []
  }
  if (state.phase !== 'acting') return []
  const seat = state.seats[state.activeSeatIndex]
  const hand = activeHand(state)
  if (!seat || !hand || hand.done) return []
  const actions: BlackjackAction[] = ['hit', 'stand']
  if (doubleAllowed(hand, state)) actions.push('double')
  if (
    hand.cards.length === 2 &&
    isPair(hand.cards) &&
    seat.hands.length < state.rules.maxSplitHands &&
    !hand.fromSplitAces
  ) {
    actions.push('split')
  }
  if (
    state.rules.lateSurrender &&
    hand.cards.length === 2 &&
    !hand.fromSplit &&
    !hand.doubled
  ) {
    actions.push('surrender')
  }
  return actions
}

export function applyAction(state: BlackjackState, action: BlackjackAction): BlackjackState {
  const legal = getLegalActions(state)
  if (!legal.includes(action)) {
    throw new Error(`非法操作 ${action}，当前合法：${legal.join('/')}`)
  }

  // 保险阶段
  if (state.phase === 'insurance') {
    const seat = state.seats[state.activeSeatIndex]
    seat.insuranceDecided = true
    if (action === 'insure') seat.insuranceBet = seat.baseBet / 2
    const next = state.seats.findIndex((s) => !s.insuranceDecided)
    if (next === -1) return proceedAfterInsurance(state)
    state.activeSeatIndex = next
    return state
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
    case 'surrender': {
      hand.surrendered = true
      hand.done = true
      break
    }
    case 'split': {
      const [c1, c2] = hand.cards
      const aces = c1.rank === 'A'
      const h1 = makeHand(seat.baseBet, true, aces)
      const h2 = makeHand(seat.baseBet, true, aces)
      h1.cards.push(c1, state.shoe.draw())
      h2.cards.push(c2, state.shoe.draw())
      // 在当前手位置劈开（支持再分牌）
      seat.hands.splice(state.activeHandIndex, 1, h1, h2)
      for (const h of [h1, h2]) {
        if (state.rules.splitAcesOneCard && aces) h.done = true
        else if (handValue(h.cards).total === 21) h.done = true
      }
      if (seat.hands[state.activeHandIndex].done) advancePointer(state)
      return state
    }
    default:
      throw new Error(`阶段 ${state.phase} 不接受 ${action}`)
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
 * 庄家阶段：揭示暗牌（若有），场上有存活的手则补牌到 ≥17（S17/H17）。
 * 全员爆牌/投降时只翻暗牌不补牌（拟真）。
 */
export function playDealer(state: BlackjackState): BlackjackState {
  if (state.phase !== 'dealer') throw new Error(`阶段错误：${state.phase}`)
  if (state.rules.holeCard) state.holeRevealed = true
  const anyLive = state.seats.some((s) => s.hands.some((h) => !h.bust && !h.surrendered))
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

/** 庄家是否还需要抽牌（荷官模型决策模式用：引擎给出规则答案） */
export function dealerMustDraw(state: BlackjackState): boolean {
  const v = handValue(state.dealerCards)
  if (v.total > 21 || v.total > 17) return false
  if (v.total === 17 && !(v.soft && state.rules.hitSoft17)) return false
  return true
}

/** 荷官模型决策模式的手动抽牌入口 */
export function dealerDrawOne(state: BlackjackState): BlackjackState {
  if (state.phase !== 'dealer') throw new Error(`阶段错误：${state.phase}`)
  state.dealerCards.push(state.shoe.draw())
  return state
}

/** 荷官回合收尾（模型决策模式抽完后调用） */
export function settleRound(state: BlackjackState): BlackjackState {
  return settle(state)
}

/** 结算：ENHC/暗牌通用 + 保险 + 投降 */
function settle(state: BlackjackState): BlackjackState {
  const dv = handValue(state.dealerCards)
  const dealerBJ = state.dealerCards.length === 2 && dv.total === 21
  const dealerBust = dv.total > 21
  if (state.rules.holeCard) state.holeRevealed = true

  for (const seat of state.seats) {
    let net = 0
    seat.outcomes = []
    for (const hand of seat.hands) {
      const hv = handValue(hand.cards)
      const bj = isBlackjack(hand)
      let outcome: HandOutcome
      if (hand.surrendered) {
        outcome = 'surrender'
        net -= hand.bet / 2
      } else if (hand.bust) {
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
    if (seat.insuranceBet > 0) {
      net += dealerBJ ? seat.insuranceBet * 2 : -seat.insuranceBet
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
  return state.phase === 'acting' || state.phase === 'insurance'
    ? state.seats[state.activeSeatIndex] ?? null
    : null
}
