import { describe, it, expect } from 'vitest'
import { handValue, isBlackjack, isPair } from '@/games/blackjack/hand'
import { c } from './helpers'

describe('手牌计值', () => {
  it('K/Q/J 算 10', () => {
    expect(handValue([c('KS'), c('QH')]).total).toBe(20)
    expect(handValue([c('JS'), c('10D')]).total).toBe(20)
  })

  it('A 弹性计值', () => {
    expect(handValue([c('AS'), c('6H')])).toEqual({ total: 17, soft: true }) // 软17
    expect(handValue([c('AS'), c('6H'), c('9C')])).toEqual({ total: 16, soft: false })
    expect(handValue([c('AS'), c('AH')])).toEqual({ total: 12, soft: true })
    expect(handValue([c('AS'), c('5H'), c('AD')])).toEqual({ total: 17, soft: true }) // 文档例：A,5,A 软17
    expect(handValue([c('AS'), c('2H'), c('4D')])).toEqual({ total: 17, soft: true }) // 文档例：A,2,4 软17
  })

  it('爆牌', () => {
    expect(handValue([c('KS'), c('QH'), c('5D')]).total).toBe(25)
  })
})

describe('Blackjack 判定', () => {
  it('A + 10点牌 = Blackjack', () => {
    expect(isBlackjack({ cards: [c('AS'), c('KH')], fromSplit: false })).toBe(true)
    expect(isBlackjack({ cards: [c('10S'), c('AH')], fromSplit: false })).toBe(true)
  })

  it('分牌后的 A+10 只算 21 不算 Blackjack（文档规则）', () => {
    expect(isBlackjack({ cards: [c('AS'), c('KH')], fromSplit: true })).toBe(false)
  })

  it('三张凑 21 不是 Blackjack', () => {
    expect(isBlackjack({ cards: [c('7S'), c('7H'), c('7D')], fromSplit: false })).toBe(false)
  })
})

describe('对子判定', () => {
  it('同 rank 为对子', () => {
    expect(isPair([c('8S'), c('8H')])).toBe(true)
  })
  it('K 和 10 同为 10 点但非对子，不可分', () => {
    expect(isPair([c('KS'), c('10H')])).toBe(false)
    expect(isPair([c('KS'), c('QH')])).toBe(false)
  })
})
