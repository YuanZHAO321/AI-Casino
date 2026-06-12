import { describe, it, expect } from 'vitest'
import {
  startRound, applyAction, getLegalActions, playDealer, SeatBetInput
} from '@/games/blackjack/engine'
import { DEFAULT_RULES, BlackjackRules } from '@/games/blackjack/types'
import { fallbackAction, resolveProposedAction } from '@/games/blackjack/basicStrategy'
import { riggedShoe } from './helpers'

const rules: BlackjackRules = { ...DEFAULT_RULES }

function seat(bet = 100, id = 'p'): SeatBetInput {
  return { seatId: id, isHuman: id === 'p', name: id, bet, sideBets: {} }
}

/* 发牌顺序：每座位第一张 → 庄家一张 → 每座位第二张 */

describe('基本流程与结算', () => {
  it('玩家 20 vs 庄家 19：赢 1:1', () => {
    const shoe = riggedShoe(['KS', '9H', 'QD', '10C'])
    let state = startRound(shoe, rules, 1, [seat()])
    expect(state.phase).toBe('acting')
    state = applyAction(state, 'stand')
    expect(state.phase).toBe('dealer')
    state = playDealer(state)
    expect(state.dealerCards.length).toBe(2) // 9 + 10 = 19 停牌
    expect(state.seats[0].outcomes).toEqual(['win'])
    expect(state.seats[0].net).toBe(100)
  })

  it('平局退注（push）', () => {
    const shoe = riggedShoe(['KS', 'KH', 'QD', 'JC'])
    let state = startRound(shoe, rules, 1, [seat()])
    state = playDealer(applyAction(state, 'stand'))
    expect(state.seats[0].outcomes).toEqual(['push'])
    expect(state.seats[0].net).toBe(0)
  })

  it('玩家 Blackjack 赔 3:2，开局自动停牌', () => {
    const shoe = riggedShoe(['AS', '9H', 'KD', '8C'])
    let state = startRound(shoe, rules, 1, [seat()])
    expect(state.phase).toBe('dealer') // BJ 无需行动
    state = playDealer(state)
    expect(state.seats[0].outcomes).toEqual(['blackjack'])
    expect(state.seats[0].net).toBe(150)
  })

  it('爆牌即输，庄家无人未爆则不补牌（拟真）', () => {
    const shoe = riggedShoe(['KS', '9H', '6D', '8C'])
    let state = startRound(shoe, rules, 1, [seat()])
    state = applyAction(state, 'hit') // 16 + 8 = 24 爆
    expect(state.phase).toBe('dealer')
    state = playDealer(state)
    expect(state.dealerCards.length).toBe(1) // 全爆不补牌
    expect(state.seats[0].outcomes).toEqual(['bust'])
    expect(state.seats[0].net).toBe(-100)
  })

  it('庄家爆牌：存活的手全赢', () => {
    const shoe = riggedShoe(['KS', '6H', '8D', '10C', '9S'])
    let state = startRound(shoe, rules, 1, [seat()])
    state = playDealer(applyAction(state, 'stand')) // 庄 6+10=16 → +9 = 25 爆
    expect(state.dealerCards.length).toBe(3)
    expect(state.seats[0].outcomes).toEqual(['win'])
  })
})

describe('ENHC：庄家后补成 Blackjack', () => {
  it('普通手全输（含加倍的注）', () => {
    const shoe = riggedShoe(['6S', 'AH', '5D', '9C', 'KC'])
    let state = startRound(shoe, rules, 1, [seat()])
    state = applyAction(state, 'double') // 11 加倍，拿 9 → 20，注 200
    state = playDealer(state) // 庄 A + K = BJ
    expect(state.seats[0].outcomes).toEqual(['dealer-blackjack'])
    expect(state.seats[0].net).toBe(-200)
  })

  it('玩家 BJ 对庄家 BJ：推局', () => {
    const shoe = riggedShoe(['AS', 'AH', 'KD', 'KC'])
    let state = startRound(shoe, rules, 1, [seat()])
    state = playDealer(state)
    expect(state.seats[0].outcomes).toEqual(['push'])
    expect(state.seats[0].net).toBe(0)
  })

  it('庄家三张凑 21 不是 BJ，玩家 21 推局、20 输', () => {
    const shoe = riggedShoe(['KS', '6H', '10D', '7C', '8C'])
    let state = startRound(shoe, rules, 1, [seat()])
    state = playDealer(applyAction(state, 'stand')) // 庄 6+7+8=21（三张）
    expect(state.seats[0].outcomes).toEqual(['lose']) // 20 < 21 但不是 dealer-blackjack
  })

  it('玩家天生 BJ 击败庄家三张 21，照付 3:2（真实赌场规则）', () => {
    const shoe = riggedShoe(['AS', '6H', 'KD', '7C', '8C'])
    let state = startRound(shoe, rules, 1, [seat(10)])
    expect(state.phase).toBe('dealer') // BJ 自动停
    state = playDealer(state) // 庄 6+7+8 = 21（三张，非 BJ）
    expect(state.dealerCards.length).toBe(3)
    expect(state.seats[0].outcomes).toEqual(['blackjack'])
    expect(state.seats[0].net).toBe(15) // 3:2
  })

  it('玩家 BJ 对庄家两张 21（真 BJ）：必定推局，绝不赔 3:2', () => {
    // 庄家明牌 10，补 A → 两张 21 = Blackjack
    const shoe = riggedShoe(['AS', '10H', 'KD', 'AC'])
    let state = startRound(shoe, rules, 1, [seat(10)])
    state = playDealer(state)
    expect(state.dealerCards.length).toBe(2)
    expect(state.seats[0].outcomes).toEqual(['push'])
    expect(state.seats[0].net).toBe(0)
  })

  it('加倍获胜赔付 = 翻倍后注额（押10加倍赢得20）', () => {
    const shoe = riggedShoe(['6S', '5H', '5D', '10C', '9S', '8H'])
    let state = startRound(shoe, rules, 1, [seat(10)])
    state = applyAction(state, 'double') // 11 + 10 = 21，注 20
    state = playDealer(state) // 庄 5+9=14 → +8 = 22 爆
    expect(state.seats[0].net).toBe(20)
  })
})

describe('庄家 S17/H17', () => {
  it('S17（默认）：软 17 停牌', () => {
    const shoe = riggedShoe(['KS', 'AH', 'QD', '6C'])
    let state = startRound(shoe, rules, 1, [seat()])
    state = playDealer(applyAction(state, 'stand'))
    expect(state.dealerCards.length).toBe(2) // A+6 软17 停
    expect(state.seats[0].outcomes).toEqual(['win']) // 20 > 17
  })

  it('H17：软 17 继续要牌', () => {
    const shoe = riggedShoe(['KS', 'AH', 'QD', '6C', '3S'])
    let state = startRound(shoe, { ...rules, hitSoft17: true }, 1, [seat()])
    state = playDealer(applyAction(state, 'stand'))
    expect(state.dealerCards.length).toBe(3) // A+6 → 拿 3 = 20
    expect(state.seats[0].outcomes).toEqual(['push'])
  })

  it('硬 17 永远停牌', () => {
    const shoe = riggedShoe(['KS', '10H', 'QD', '7C'])
    let state = startRound(shoe, { ...rules, hitSoft17: true }, 1, [seat()])
    state = playDealer(applyAction(state, 'stand'))
    expect(state.dealerCards.length).toBe(2)
  })
})

describe('加倍', () => {
  it('加倍只买一张牌且注翻倍', () => {
    const shoe = riggedShoe(['6S', '9H', '5D', '10C', '10S', '8H'])
    let state = startRound(shoe, rules, 1, [seat()])
    expect(getLegalActions(state)).toContain('double')
    state = applyAction(state, 'double') // 11 + 10 = 21，注 200
    expect(state.seats[0].hands[0].cards.length).toBe(3)
    expect(state.seats[0].hands[0].bet).toBe(200)
    expect(state.phase).toBe('dealer')
    state = playDealer(state) // 庄 9+10=19
    expect(state.seats[0].net).toBe(200)
  })

  it('要过牌后不能加倍', () => {
    const shoe = riggedShoe(['2S', '9H', '3D', '2C'])
    let state = startRound(shoe, rules, 1, [seat()])
    state = applyAction(state, 'hit')
    expect(getLegalActions(state)).not.toContain('double')
  })
})

describe('分牌', () => {
  it('对子可分、各补一注、不可再分', () => {
    const shoe = riggedShoe(['8S', '6H', '8H', '8D', '3C', '10S', '10C'])
    let state = startRound(shoe, rules, 1, [seat()])
    expect(getLegalActions(state)).toContain('split')
    state = applyAction(state, 'split')
    expect(state.seats[0].hands.length).toBe(2)
    expect(state.seats[0].hands[0].bet).toBe(100)
    expect(state.seats[0].hands[1].bet).toBe(100)
    // 第一手 8+8 又是对子，但 fromSplit 不可再分
    expect(getLegalActions(state)).not.toContain('split')
    state = applyAction(state, 'stand') // 手1: 16
    state = applyAction(state, 'stand') // 手2: 8+3=11
    state = playDealer(state) // 庄 6+10=16 → +10 = 26 爆
    expect(state.seats[0].outcomes).toEqual(['win', 'win'])
    expect(state.seats[0].net).toBe(200)
  })

  it('K 与 10 不可分（非同 rank）', () => {
    const shoe = riggedShoe(['KS', '6H', '10D'])
    const state = startRound(shoe, rules, 1, [seat()])
    expect(getLegalActions(state)).not.toContain('split')
  })

  it('分 A 后 A+10 = 21 不算 Blackjack（赔 1:1）', () => {
    const shoe = riggedShoe(['AS', '9H', 'AH', 'KC', '5C', '3S', '10D'])
    let state = startRound(shoe, rules, 1, [seat()])
    state = applyAction(state, 'split')
    // 手1: A+K = 21 自动停；手2: A+5 = 软16
    expect(state.seats[0].hands[0].done).toBe(true)
    state = applyAction(state, 'hit') // 软16 + 3 = 19
    state = applyAction(state, 'stand')
    state = playDealer(state) // 庄 9+10 = 19
    expect(state.seats[0].outcomes).toEqual(['win', 'push']) // 21 赢 1:1，19 平
    expect(state.seats[0].net).toBe(100) // 不是 150
  })

  it('规则开关：分 A 只补一张', () => {
    const shoe = riggedShoe(['AS', '9H', 'AH', '5C', '3S', '10D'])
    let state = startRound(shoe, { ...rules, splitAcesOneCard: true }, 1, [seat()])
    state = applyAction(state, 'split')
    expect(state.seats[0].hands.every((h) => h.done)).toBe(true)
    expect(state.seats[0].hands[0].cards.length).toBe(2)
  })

  it('规则开关：禁止分牌后加倍', () => {
    const shoe = riggedShoe(['8S', '6H', '8H', '3D', '3C'])
    let state = startRound(shoe, { ...rules, doubleAfterSplit: false }, 1, [seat()])
    state = applyAction(state, 'split')
    expect(getLegalActions(state)).not.toContain('double')
  })
})

describe('多座位行动顺序', () => {
  it('按 box 顺序行动，互不串位', () => {
    const shoe = riggedShoe(['KS', '5H', '9H', '8D', '10C', '7S', '10D'])
    let state = startRound(shoe, rules, 1, [seat(100, 'p'), seat(50, 'o1')])
    // p: K+8=18, o1: 5+10=15, 庄 9
    expect(state.seats[state.activeSeatIndex].seatId).toBe('p')
    state = applyAction(state, 'stand')
    expect(state.seats[state.activeSeatIndex].seatId).toBe('o1')
    state = applyAction(state, 'hit') // 15 + 7 = 22 爆
    expect(state.phase).toBe('dealer')
    state = playDealer(state) // 庄 9+10 = 19
    expect(state.seats[0].outcomes).toEqual(['lose'])
    expect(state.seats[1].outcomes).toEqual(['bust'])
  })
})

describe('下注校验与非法操作', () => {
  it('台注限红', () => {
    expect(() => startRound(riggedShoe(['KS', '9H', 'QD']), rules, 1, [seat(5)])).toThrow()
    expect(() => startRound(riggedShoe(['KS', '9H', 'QD']), rules, 1, [seat(1001)])).toThrow()
  })

  it('非法操作直接抛错（引擎层防线）', () => {
    const shoe = riggedShoe(['KS', '9H', '6D'])
    const state = startRound(shoe, rules, 1, [seat()])
    expect(() => applyAction(state, 'split')).toThrow()
  })

  it('resolveProposedAction：合法采纳，非法兜底为基本策略且标记修正', () => {
    const shoe = riggedShoe(['KS', '9H', '6D'])
    const state = startRound(shoe, rules, 1, [seat()]) // 16 vs 9
    const legal = getLegalActions(state)
    expect(resolveProposedAction(state, legal, 'hit')).toEqual({ action: 'hit', corrected: false })
    expect(resolveProposedAction(state, legal, ' STAND ')).toEqual({ action: 'stand', corrected: false })
    const r = resolveProposedAction(state, legal, 'split') // 非法
    expect(r.corrected).toBe(true)
    expect(legal).toContain(r.action)
    expect(r.action).toBe('hit') // 基本策略：16 vs 9 要牌
    const r2 = resolveProposedAction(state, legal, undefined)
    expect(r2.corrected).toBe(true)
  })

  it('fallbackAction 永远返回合法操作', () => {
    const shoe = riggedShoe(['8S', '9H', '8H'])
    const state = startRound(shoe, rules, 1, [seat()])
    const legal = getLegalActions(state)
    expect(legal).toContain(fallbackAction(state, legal))
  })
})
