import { Card, Rank } from '@/core/cards'
import { Hand } from './types'

/** 21 点点数：K/Q/J = 10，A = 11 或 1 */
export function rankValue(rank: Rank): number {
  if (rank === 'A') return 11
  if (rank === 'K' || rank === 'Q' || rank === 'J' || rank === '10') return 10
  return parseInt(rank, 10)
}

export interface HandValue {
  total: number
  /** 仍有 A 按 11 计 */
  soft: boolean
}

export function handValue(cards: Card[]): HandValue {
  let total = 0
  let aces = 0
  for (const c of cards) {
    total += rankValue(c.rank)
    if (c.rank === 'A') aces++
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }
  return { total, soft: aces > 0 }
}

export function isBust(cards: Card[]): boolean {
  return handValue(cards).total > 21
}

/**
 * Blackjack：最初两张为 A + 10 点牌。
 * 分牌后的 A+10 按规则只算 21，不算 Blackjack。
 */
export function isBlackjack(hand: Pick<Hand, 'cards' | 'fromSplit'>): boolean {
  return (
    !hand.fromSplit &&
    hand.cards.length === 2 &&
    handValue(hand.cards).total === 21
  )
}

/** 前两张是否对子（按点数面值同 rank 才可分，10/J/Q/K 视为不同 rank 不可互分） */
export function isPair(cards: Card[]): boolean {
  return cards.length === 2 && cards[0].rank === cards[1].rank
}
