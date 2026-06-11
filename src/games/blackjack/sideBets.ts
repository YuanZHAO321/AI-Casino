import { Card, Rank, SUIT_COLOR } from '@/core/cards'
import { SideBetResult } from './types'

/**
 * 边注结算（严格按规则文档赔率）：
 *  21+3：玩家前两张 + 庄家明牌组成 同花 / 三条 / 顺子 / 同花顺 → 9:1
 *  Pairs：玩家前两张为对子 → 混色 5:1；同色异花 12:1(≤4副)/10:1(>4副)；完全同花同点 30:1
 *  Top 3：玩家前两张 + 庄家明牌 → 三条 90:1；同花顺 180:1；同花三条 270:1（取最高）
 */

const STRAIGHT_ORDER: Record<Rank, number> = {
  A: 14, K: 13, Q: 12, J: 11, '10': 10, '9': 9, '8': 8,
  '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
}

function isThreeOfAKind(cards: Card[]): boolean {
  return cards[0].rank === cards[1].rank && cards[1].rank === cards[2].rank
}

function isFlush(cards: Card[]): boolean {
  return cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit
}

function isStraight(cards: Card[]): boolean {
  const vals = cards.map((c) => STRAIGHT_ORDER[c.rank]).sort((a, b) => a - b)
  if (new Set(vals).size !== 3) return false
  // A 可作高（Q-K-A）也可作低（A-2-3）
  if (vals[2] - vals[1] === 1 && vals[1] - vals[0] === 1) return true
  return vals[0] === 2 && vals[1] === 3 && vals[2] === 14
}

export function evaluate21Plus3(
  playerFirstTwo: Card[],
  dealerUp: Card,
  stake: number
): SideBetResult {
  const three = [...playerFirstTwo, dealerUp]
  let hit: string | null = null
  if (isStraight(three) && isFlush(three)) hit = 'straight-flush'
  else if (isThreeOfAKind(three)) hit = 'three-of-a-kind'
  else if (isStraight(three)) hit = 'straight'
  else if (isFlush(three)) hit = 'flush'
  const odds = hit ? 9 : 0
  return { kind: 'twentyOnePlusThree', stake, hit, odds, net: hit ? stake * odds : -stake }
}

export function evaluatePairs(playerFirstTwo: Card[], decks: number, stake: number): SideBetResult {
  const [a, b] = playerFirstTwo
  let hit: string | null = null
  let odds = 0
  if (a.rank === b.rank) {
    if (a.suit === b.suit) {
      hit = 'same-suit-pair'
      odds = 30
    } else if (SUIT_COLOR[a.suit] === SUIT_COLOR[b.suit]) {
      hit = 'same-colour-pair'
      odds = decks <= 4 ? 12 : 10
    } else {
      hit = 'mixed-pair'
      odds = 5
    }
  }
  return { kind: 'pairs', stake, hit, odds, net: hit ? stake * odds : -stake }
}

export function evaluateTop3(playerFirstTwo: Card[], dealerUp: Card, stake: number): SideBetResult {
  const three = [...playerFirstTwo, dealerUp]
  let hit: string | null = null
  let odds = 0
  if (isThreeOfAKind(three) && isFlush(three)) {
    hit = 'suited-three-of-a-kind'
    odds = 270
  } else if (isStraight(three) && isFlush(three)) {
    hit = 'straight-flush'
    odds = 180
  } else if (isThreeOfAKind(three)) {
    hit = 'three-of-a-kind'
    odds = 90
  }
  return { kind: 'top3', stake, hit, odds, net: hit ? stake * odds : -stake }
}
