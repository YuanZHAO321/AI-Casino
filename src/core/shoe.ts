import { Card, Rank, buildDeck, RANKS } from './cards'
import { shuffle } from './rng'

/**
 * 牌靴：N 副完整牌洗成一靴，带切牌（渗透率）。
 * 严格保证：构造时每副恰好 52 张唯一牌；一靴打完不重不漏。
 */
export class Shoe {
  readonly deckCount: number
  readonly penetration: number
  private cards: Card[] = []
  private dealtCards: Card[] = []
  private cutIndex = 0
  /** 切牌已到达：本局打完后应重洗 */
  cutCardReached = false

  constructor(deckCount: number, penetration = 0.75) {
    if (!Number.isInteger(deckCount) || deckCount < 1 || deckCount > 8) {
      throw new Error(`牌副数必须为 1–8，收到 ${deckCount}`)
    }
    if (penetration < 0.3 || penetration > 0.95) {
      throw new Error(`渗透率必须在 0.3–0.95 之间，收到 ${penetration}`)
    }
    this.deckCount = deckCount
    this.penetration = penetration
    this.reshuffle()
  }

  /** 重洗：重建 N 副完整牌 */
  reshuffle(): void {
    this.cards = []
    for (let d = 0; d < this.deckCount; d++) {
      this.cards.push(...buildDeck(d))
    }
    const ids = new Set(this.cards.map((c) => c.id))
    if (ids.size !== this.deckCount * 52) {
      throw new Error('牌靴构造异常：存在重复牌')
    }
    shuffle(this.cards)
    this.dealtCards = []
    this.cutIndex = Math.floor(this.cards.length * this.penetration)
    this.cutCardReached = false
  }

  draw(): Card {
    if (this.dealtCards.length >= this.cards.length) {
      // 现实中不会发生（切牌保证局间重洗），防御性兜底
      this.reshuffle()
    }
    const card = this.cards[this.dealtCards.length]
    this.dealtCards.push(card)
    if (this.dealtCards.length >= this.cutIndex) this.cutCardReached = true
    return card
  }

  get dealtCount(): number {
    return this.dealtCards.length
  }

  get totalCount(): number {
    return this.cards.length
  }

  get remainingCount(): number {
    return this.cards.length - this.dealtCards.length
  }

  /**
   * 本靴已发牌的公开汇总（21点所有牌明发，记牌合法）。
   * 这是允许暴露给 AI 的唯一牌靴衍生信息。
   */
  seenSummary(): SeenSummary {
    const byRank = Object.fromEntries(RANKS.map((r) => [r, 0])) as Record<Rank, number>
    for (const c of this.dealtCards) byRank[c.rank]++
    return {
      deckCount: this.deckCount,
      dealt: this.dealtCards.length,
      remaining: this.remainingCount,
      byRank
    }
  }
}

export interface SeenSummary {
  deckCount: number
  dealt: number
  remaining: number
  byRank: Record<Rank, number>
}
