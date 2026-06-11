import { Card, Rank, Suit, makeCard } from '@/core/cards'
import { Shoe } from '@/core/shoe'

/** 造牌速记：'AS' = 黑桃A，'10H' = 红心10 */
export function c(spec: string, deckIndex = 0): Card {
  const suit = spec.slice(-1) as Suit
  const rank = spec.slice(0, -1) as Rank
  return makeCard(rank, suit, deckIndex)
}

/**
 * 作弊靴：按给定顺序发牌（仅测试用，绕过随机）。
 * 结构兼容 Shoe 的引擎用面。
 */
export function riggedShoe(specs: string[]): Shoe {
  const queue = specs.map((s, i) => c(s, Math.floor(i / 52)))
  let dealt = 0
  const fake = {
    deckCount: 6,
    penetration: 0.75,
    cutCardReached: false,
    reshuffle() {},
    draw(): Card {
      if (dealt >= queue.length) throw new Error('作弊靴牌不够了')
      return queue[dealt++]
    },
    get dealtCount() {
      return dealt
    },
    get totalCount() {
      return 312
    },
    get remainingCount() {
      return 312 - dealt
    },
    seenSummary() {
      const byRank: Record<string, number> = {
        A: 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, J: 0, Q: 0, K: 0
      }
      for (let i = 0; i < dealt; i++) byRank[queue[i].rank]++
      return { deckCount: 6, dealt, remaining: 312 - dealt, byRank }
    }
  }
  return fake as unknown as Shoe
}
