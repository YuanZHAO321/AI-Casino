import { describe, it, expect } from 'vitest'
import { startRound, applyAction, playDealer, getLegalActions, dealerMustDraw, dealerDrawOne, settleRound, SeatBetInput } from '@/games/blackjack/engine'
import { projectView } from '@/games/blackjack/projection'
import { DEFAULT_RULES, BlackjackRules } from '@/games/blackjack/types'
import { RULE_PRESETS, applyPreset, detectPreset } from '@/games/blackjack/rulePresets'
import { fallbackAction } from '@/games/blackjack/basicStrategy'
import { Shoe } from '@/core/shoe'
import { riggedShoe } from './helpers'

const US: BlackjackRules = { ...DEFAULT_RULES, ...RULE_PRESETS.us }
const EU: BlackjackRules = { ...DEFAULT_RULES, ...RULE_PRESETS.eu }

function seat(bet = 100, id = 'p'): SeatBetInput {
  return { seatId: id, isHuman: id === 'p', name: id, bet, sideBets: {} }
}

/* 美式发牌顺序：每人一张 → 庄家明牌 → 每人第二张 → 庄家暗牌 */

describe('规则预设', () => {
  it('uk 预设即默认规则', () => {
    expect(detectPreset(DEFAULT_RULES)).toBe('uk')
  })
  it('应用与检测往返', () => {
    expect(detectPreset(applyPreset(DEFAULT_RULES, 'us'))).toBe('us')
    expect(detectPreset(applyPreset(DEFAULT_RULES, 'eu'))).toBe('eu')
    expect(detectPreset({ ...DEFAULT_RULES, maxSplitHands: 3 })).toBe('custom')
  })
})

describe('美式：暗牌与偷看', () => {
  it('庄家拿两张，第二张为暗牌；投影绝不泄露', () => {
    const shoe = riggedShoe(['KS', '9H', '6D', 'QC']) // 暗牌 ♣Q
    const state = startRound(shoe, US, 1, [seat()])
    expect(state.dealerCards.length).toBe(2)
    expect(state.holeRevealed).toBe(false)
    for (const viewer of ['p', 'companion', 'dealer']) {
      const view = projectView(state, viewer)
      const json = JSON.stringify(view)
      expect(json).not.toContain('♣Q')
      expect(view.dealer.cards).toEqual(['♥9', '??'])
      expect(view.dealer.total).toBe(9) // 只计明牌
      expect(view.dealer.holeCardHidden).toBe(true)
      // 已发牌汇总扣除暗牌：实际发出 4 张，可见 3 张
      expect(view.seen.dealt).toBe(3)
      expect(view.seen.byRank['Q']).toBe(0)
    }
  })

  it('庄家回合揭示暗牌', () => {
    const shoe = riggedShoe(['KS', '9H', 'QD', '8C'])
    let state = startRound(shoe, US, 1, [seat()])
    state = applyAction(state, 'stand')
    state = playDealer(state) // 9+8=17 停
    expect(state.holeRevealed).toBe(true)
    const view = projectView(state, 'p')
    expect(view.dealer.cards).toEqual(['♥9', '♣8'])
    expect(view.dealer.holeCardHidden).toBe(false)
    expect(view.seats[0].hands[0].outcome).toBe('win') // 20 > 17
  })

  it('偷看：明牌 10 + 暗牌 A = 庄家 BJ 立即结算', () => {
    const shoe = riggedShoe(['QS', 'KH', 'JD', 'AC'])
    const state = startRound(shoe, US, 1, [seat()])
    expect(state.phase).toBe('settled')
    expect(state.holeRevealed).toBe(true)
    expect(state.seats[0].outcomes).toEqual(['dealer-blackjack'])
    expect(state.seats[0].net).toBe(-100)
  })

  it('偷看：玩家 BJ 对庄家 BJ 推局', () => {
    const shoe = riggedShoe(['AS', 'KH', 'KD', 'AC'])
    const state = startRound(shoe, US, 1, [seat()])
    expect(state.phase).toBe('settled')
    expect(state.seats[0].outcomes).toEqual(['push'])
    expect(state.seats[0].net).toBe(0)
  })
})

describe('美式：保险', () => {
  it('明牌 A 进入保险阶段；买保险且庄家 BJ：保险赔 2:1 抵消主注', () => {
    const shoe = riggedShoe(['KS', 'AH', 'QD', 'KC'])
    let state = startRound(shoe, US, 1, [seat()])
    expect(state.phase).toBe('insurance')
    expect(getLegalActions(state)).toEqual(['insure', 'no-insurance'])
    state = applyAction(state, 'insure')
    expect(state.seats[0].insuranceBet).toBe(50)
    // 偷看命中 BJ → 立即结算
    expect(state.phase).toBe('settled')
    expect(state.seats[0].outcomes).toEqual(['dealer-blackjack'])
    expect(state.seats[0].net).toBe(-100 + 100) // 主注 -100，保险 +100
  })

  it('买保险但庄家无 BJ：保险输掉，牌局继续', () => {
    const shoe = riggedShoe(['KS', 'AH', 'QD', '9C'])
    let state = startRound(shoe, US, 1, [seat()])
    state = applyAction(state, 'insure')
    expect(state.phase).toBe('acting')
    state = applyAction(state, 'stand')
    state = playDealer(state) // A+9 = 软20 停
    expect(state.seats[0].outcomes).toEqual(['push']) // 20 vs 20
    expect(state.seats[0].net).toBe(-50) // 仅损失保险
  })

  it('拒绝保险：不扣保险注', () => {
    const shoe = riggedShoe(['KS', 'AH', 'QD', '9C'])
    let state = startRound(shoe, US, 1, [seat()])
    state = applyAction(state, 'no-insurance')
    expect(state.seats[0].insuranceBet).toBe(0)
    expect(state.phase).toBe('acting')
  })

  it('多座位按顺序决策保险', () => {
    const shoe = riggedShoe(['KS', '5H', 'AH', 'QD', '8D', '9C'])
    let state = startRound(shoe, US, 1, [seat(100, 'p'), seat(50, 'o1')])
    expect(state.phase).toBe('insurance')
    expect(state.seats[state.activeSeatIndex].seatId).toBe('p')
    state = applyAction(state, 'no-insurance')
    expect(state.seats[state.activeSeatIndex].seatId).toBe('o1')
    state = applyAction(state, 'insure')
    expect(state.seats[1].insuranceBet).toBe(25)
    expect(state.phase).toBe('acting')
  })

  it('英式无保险阶段（明牌 A 直接行动）', () => {
    const shoe = riggedShoe(['KS', 'AH', 'QD', '9C'])
    const state = startRound(shoe, DEFAULT_RULES, 1, [seat()])
    expect(state.phase).toBe('acting')
  })
})

describe('美式：投降', () => {
  it('前两张可投降，损失半注，庄家不补牌', () => {
    const shoe = riggedShoe(['10S', '9H', '6D', '5C'])
    let state = startRound(shoe, US, 1, [seat()])
    expect(getLegalActions(state)).toContain('surrender')
    state = applyAction(state, 'surrender')
    expect(state.phase).toBe('dealer')
    state = playDealer(state)
    expect(state.dealerCards.length).toBe(2) // 无人存活不补
    expect(state.seats[0].outcomes).toEqual(['surrender'])
    expect(state.seats[0].net).toBe(-50)
  })

  it('要牌后不可投降；英式不可投降', () => {
    const shoe = riggedShoe(['10S', '9H', '6D', '5C', '2S'])
    let state = startRound(shoe, US, 1, [seat()])
    state = applyAction(state, 'hit')
    expect(getLegalActions(state)).not.toContain('surrender')
    const ukState = startRound(riggedShoe(['10S', '9H', '6D']), DEFAULT_RULES, 1, [seat()])
    expect(getLegalActions(ukState)).not.toContain('surrender')
  })

  it('兜底策略：硬16 vs 10 投降', () => {
    const shoe = riggedShoe(['10S', 'KH', '6D', '5C'])
    const state = startRound(shoe, US, 1, [seat()])
    const legal = getLegalActions(state)
    expect(fallbackAction(state, legal)).toBe('surrender')
  })

  it('兜底策略：保险阶段永远拒保', () => {
    const shoe = riggedShoe(['KS', 'AH', 'QD', '9C'])
    const state = startRound(shoe, US, 1, [seat()])
    expect(fallbackAction(state, getLegalActions(state))).toBe('no-insurance')
  })
})

describe('美式：再分牌（最多 4 手）', () => {
  it('分出的手又是对子可再分', () => {
    const shoe = riggedShoe(['8S', '6H', '8H', '7C', '8D', '3C', '2S', '4S', '10D', '10C'])
    let state = startRound(shoe, US, 1, [seat()])
    state = applyAction(state, 'split') // h1: 8S+8D, h2: 8H+3C
    expect(getLegalActions(state)).toContain('split') // 8S+8D 可再分
    state = applyAction(state, 'split') // h1a: 8S+2S, h1b: 8D+4S, h2: 8H+3C
    expect(state.seats[0].hands.length).toBe(3)
    expect(getLegalActions(state)).not.toContain('split') // 8S+2S 非对子
    state = applyAction(state, 'stand') // 10
    state = applyAction(state, 'stand') // 12
    state = applyAction(state, 'stand') // 11
    state = playDealer(state) // 6+7=13 → 10 = 23 爆
    expect(state.seats[0].outcomes).toEqual(['win', 'win', 'win'])
    expect(state.seats[0].net).toBe(300)
  })

  it('分 A 不可再分且只补一张（美式）', () => {
    const shoe = riggedShoe(['AS', '6H', 'AH', '7C', 'AD', '5C'])
    let state = startRound(shoe, US, 1, [seat()])
    state = applyAction(state, 'split')
    // splitAcesOneCard：两手都自动完成，即使拿到 A 也不能再分
    expect(state.seats[0].hands.every((h) => h.done)).toBe(true)
    expect(state.seats[0].hands[0].cards.length).toBe(2)
  })
})

describe('欧式：双倍限制与 DAS', () => {
  it('硬 9-11 可加倍，软牌与 19 不可', () => {
    const s1 = startRound(riggedShoe(['5S', '9H', '4D']), EU, 1, [seat()])
    expect(getLegalActions(s1)).toContain('double') // 硬9
    const s2 = startRound(riggedShoe(['AS', '9H', '8D']), EU, 1, [seat()])
    expect(getLegalActions(s2)).not.toContain('double') // 软19
    const s3 = startRound(riggedShoe(['KS', '9H', '9D']), EU, 1, [seat()])
    expect(getLegalActions(s3)).not.toContain('double') // 硬19
  })

  it('欧式分牌后不可加倍（DAS off），分 A 一张', () => {
    const shoe = riggedShoe(['8S', '6H', '8H', '3D', '3C'])
    let state = startRound(shoe, EU, 1, [seat()])
    state = applyAction(state, 'split') // h1: 8+3 = 11
    expect(getLegalActions(state)).not.toContain('double')
  })
})

describe('荷官手动抽牌接口（模型决策模式）', () => {
  it('dealerMustDraw 遵循规则，抽完结算', () => {
    const shoe = riggedShoe(['KS', '9H', 'QD', '5C', '8S'])
    let state = startRound(shoe, DEFAULT_RULES, 1, [seat()])
    state = applyAction(state, 'stand')
    expect(state.phase).toBe('dealer')
    expect(dealerMustDraw(state)).toBe(true) // 9
    dealerDrawOne(state) // 9+5=14
    expect(dealerMustDraw(state)).toBe(true)
    dealerDrawOne(state) // 14+8=22 爆
    expect(dealerMustDraw(state)).toBe(false)
    state = settleRound(state)
    expect(state.seats[0].outcomes).toEqual(['win'])
  })
})

describe('牌靴序列化', () => {
  it('快照往返：恢复后继续发出相同的牌', () => {
    const a = new Shoe(2, 0.75)
    const first = Array.from({ length: 10 }, () => a.draw().id)
    const snap = a.serialize()
    const b = new Shoe(2, 0.75)
    expect(b.restore(snap)).toBe(true)
    expect(b.dealtCount).toBe(10)
    const nextA = Array.from({ length: 20 }, () => a.draw().id)
    const nextB = Array.from({ length: 20 }, () => b.draw().id)
    expect(nextB).toEqual(nextA)
    expect(first.length).toBe(10)
  })

  it('非法快照被拒绝（副数不符/重复/数量错误）', () => {
    const a = new Shoe(2, 0.75)
    const snap = a.serialize()
    expect(new Shoe(4, 0.75).restore(snap)).toBe(false)
    const dup = { ...snap, order: [...snap.order] }
    dup.order[1] = dup.order[0]
    expect(new Shoe(2, 0.75).restore(dup)).toBe(false)
    expect(new Shoe(2, 0.75).restore({ ...snap, order: snap.order.slice(1) })).toBe(false)
  })

  it('恢复后切牌状态正确', () => {
    const a = new Shoe(1, 0.5)
    for (let i = 0; i < 30; i++) a.draw()
    const b = new Shoe(1, 0.5)
    b.restore(a.serialize())
    expect(b.cutCardReached).toBe(true)
  })
})
