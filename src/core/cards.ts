/** 扑克牌基础类型 —— 平台级，所有游戏共用 */

export type Suit = 'S' | 'H' | 'D' | 'C'
export type Rank =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K'

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C']
export const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
export const SUIT_COLOR: Record<Suit, 'red' | 'black'> = { S: 'black', H: 'red', D: 'red', C: 'black' }

export interface Card {
  rank: Rank
  suit: Suit
  /** 所属牌副编号（0-based），用于严格模拟每副牌构成 */
  deckIndex: number
  /** 全靴唯一 id：`${deckIndex}-${suit}${rank}` */
  id: string
}

export function makeCard(rank: Rank, suit: Suit, deckIndex: number): Card {
  return { rank, suit, deckIndex, id: `${deckIndex}-${suit}${rank}` }
}

export function cardLabel(card: Card): string {
  return `${SUIT_SYMBOL[card.suit]}${card.rank}`
}

/** 构造一副完整的 52 张牌，并断言无重复 */
export function buildDeck(deckIndex: number): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(makeCard(rank, suit, deckIndex))
    }
  }
  const ids = new Set(deck.map((c) => c.id))
  if (deck.length !== 52 || ids.size !== 52) {
    throw new Error(`牌副构造异常：deck ${deckIndex} 应有 52 张唯一牌，实际 ${ids.size}`)
  }
  return deck
}
