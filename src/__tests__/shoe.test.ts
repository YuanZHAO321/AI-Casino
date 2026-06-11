import { describe, it, expect } from 'vitest'
import { Shoe } from '@/core/shoe'
import { buildDeck } from '@/core/cards'
import { randomInt, shuffle, chance } from '@/core/rng'

describe('牌副构成', () => {
  it('一副恰好 52 张唯一牌', () => {
    const deck = buildDeck(0)
    expect(deck).toHaveLength(52)
    expect(new Set(deck.map((c) => c.id)).size).toBe(52)
    expect(new Set(deck.map((c) => `${c.suit}${c.rank}`)).size).toBe(52)
  })
})

describe('牌靴完整性', () => {
  for (const decks of [1, 4, 6, 8]) {
    it(`${decks} 副靴：总数 ${decks * 52}，每副不重不漏`, () => {
      const shoe = new Shoe(decks, 0.95)
      expect(shoe.totalCount).toBe(decks * 52)
      // 打穿整靴（防御性重洗只在超发时触发，这里精确发完）
      const seen = new Map<number, Set<string>>()
      for (let i = 0; i < decks * 52; i++) {
        const card = shoe.draw()
        if (!seen.has(card.deckIndex)) seen.set(card.deckIndex, new Set())
        const deckSet = seen.get(card.deckIndex)!
        expect(deckSet.has(`${card.suit}${card.rank}`)).toBe(false) // 同副无重复
        deckSet.add(`${card.suit}${card.rank}`)
      }
      expect(seen.size).toBe(decks)
      for (const set of seen.values()) expect(set.size).toBe(52) // 每副打完无遗漏
    })
  }

  it('非法副数被拒绝', () => {
    expect(() => new Shoe(0)).toThrow()
    expect(() => new Shoe(9)).toThrow()
  })

  it('切牌渗透：到达后标记重洗', () => {
    const shoe = new Shoe(1, 0.5)
    expect(shoe.cutCardReached).toBe(false)
    for (let i = 0; i < 26; i++) shoe.draw()
    expect(shoe.cutCardReached).toBe(true)
    shoe.reshuffle()
    expect(shoe.cutCardReached).toBe(false)
    expect(shoe.dealtCount).toBe(0)
  })

  it('已发牌汇总按点数计数正确', () => {
    const shoe = new Shoe(2, 0.9)
    const counts: Record<string, number> = {}
    for (let i = 0; i < 30; i++) {
      const card = shoe.draw()
      counts[card.rank] = (counts[card.rank] ?? 0) + 1
    }
    const summary = shoe.seenSummary()
    expect(summary.dealt).toBe(30)
    expect(summary.remaining).toBe(2 * 52 - 30)
    for (const [rank, n] of Object.entries(counts)) {
      expect(summary.byRank[rank as keyof typeof summary.byRank]).toBe(n)
    }
  })
})

describe('随机源', () => {
  it('randomInt 边界', () => {
    expect(randomInt(1)).toBe(0)
    for (let i = 0; i < 1000; i++) {
      const v = randomInt(13)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(13)
    }
    expect(() => randomInt(0)).toThrow()
  })

  it('洗牌保持元素集合不变且分布无明显偏置', () => {
    const arr = Array.from({ length: 52 }, (_, i) => i)
    const copy = shuffle([...arr])
    expect([...copy].sort((a, b) => a - b)).toEqual(arr)
    // 粗检：1000 次洗牌后首位元素分布不应严重集中
    const firstCounts = new Array(52).fill(0)
    for (let i = 0; i < 1000; i++) firstCounts[shuffle([...arr])[0]]++
    expect(Math.max(...firstCounts)).toBeLessThan(80) // 期望约 19，80 已是极端
  })

  it('chance 边界', () => {
    expect(chance(0)).toBe(false)
    expect(chance(1)).toBe(true)
  })
})
