import { describe, it, expect } from 'vitest'
import { startRound } from '@/games/blackjack/engine'
import { projectView } from '@/games/blackjack/projection'
import { DEFAULT_RULES } from '@/games/blackjack/types'
import { createShoe } from '@/games/blackjack/engine'
import { riggedShoe } from './helpers'

const bets = [
  { seatId: 'p', isHuman: true, name: '玩家', bet: 100, sideBets: {} },
  { seatId: 'o1', isHuman: false, name: '对手', bet: 50, sideBets: {} }
]

describe('投影无泄漏（防天眼）', () => {
  it('投影不含牌靴对象与未发牌', () => {
    // 前 5 张发出（低牌，红黑桃），第 6 张 ♦Q 尚未发出
    const shoe = riggedShoe(['2S', '3H', '4S', '5H', '6S', 'QD', 'QC'])
    const state = startRound(shoe, DEFAULT_RULES, 1, bets)
    for (const viewer of ['p', 'o1', 'companion', 'dealer']) {
      const view = projectView(state, viewer)
      const json = JSON.stringify(view)
      expect(json).not.toContain('♦Q') // 未发的牌绝不出现
      expect(json).not.toContain('shoe')
      expect(json).not.toContain('deckIndex') // 投影只含牌面文本，无内部对象
      expect((view as unknown as Record<string, unknown>)['shoe']).toBeUndefined()
    }
  })

  it('投影的可见牌数 = 实际已发牌数（已发汇总一致）', () => {
    const shoe = createShoe(DEFAULT_RULES) // 真随机靴
    const state = startRound(shoe, DEFAULT_RULES, 1, bets)
    const view = projectView(state, 'p')
    const visible =
      view.dealer.cards.length +
      view.seats.reduce((n, s) => n + s.hands.reduce((m, h) => m + h.cards.length, 0), 0)
    expect(visible).toBe(shoe.dealtCount)
    expect(view.seen.dealt).toBe(shoe.dealtCount)
    expect(view.seen.remaining).toBe(shoe.remainingCount)
  })

  it('isYou 只对视角本人为真', () => {
    const shoe = riggedShoe(['2S', '3H', '4S', '5H', '6S'])
    const state = startRound(shoe, DEFAULT_RULES, 1, bets)
    const view = projectView(state, 'o1')
    expect(view.seats.find((s) => s.seatId === 'o1')!.isYou).toBe(true)
    expect(view.seats.find((s) => s.seatId === 'p')!.isYou).toBe(false)
  })

  it('结算前不暴露结果字段', () => {
    const shoe = riggedShoe(['2S', '3H', '4S', '5H', '6S'])
    let state = startRound(shoe, DEFAULT_RULES, 1, bets)
    const before = projectView(state, 'p')
    expect(before.seats[0].net).toBeUndefined()
    expect(before.seats[0].hands[0].outcome).toBeUndefined()
  })
})
