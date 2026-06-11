import { describe, it, expect } from 'vitest'
import { evaluate21Plus3, evaluatePairs, evaluateTop3 } from '@/games/blackjack/sideBets'
import { c } from './helpers'

describe('21+3（命中一律 9:1）', () => {
  it('同花', () => {
    const r = evaluate21Plus3([c('2S'), c('9S')], c('KS'), 10)
    expect(r.hit).toBe('flush')
    expect(r.net).toBe(90)
  })
  it('三条', () => {
    const r = evaluate21Plus3([c('7S'), c('7H')], c('7D'), 10)
    expect(r.hit).toBe('three-of-a-kind')
    expect(r.net).toBe(90)
  })
  it('顺子（含 A 高 Q-K-A 与 A 低 A-2-3）', () => {
    expect(evaluate21Plus3([c('QS'), c('KH')], c('AD'), 10).hit).toBe('straight')
    expect(evaluate21Plus3([c('AS'), c('2H')], c('3D'), 10).hit).toBe('straight')
    expect(evaluate21Plus3([c('9S'), c('10H')], c('JD'), 10).hit).toBe('straight')
  })
  it('K-A-2 不是顺子（不可绕圈）', () => {
    expect(evaluate21Plus3([c('KS'), c('AH')], c('2D'), 10).hit).toBeNull()
  })
  it('同花顺也按 9:1', () => {
    const r = evaluate21Plus3([c('9S'), c('10S')], c('JS'), 10)
    expect(r.hit).toBe('straight-flush')
    expect(r.net).toBe(90)
  })
  it('未中输掉边注', () => {
    const r = evaluate21Plus3([c('2S'), c('9H')], c('KD'), 10)
    expect(r.hit).toBeNull()
    expect(r.net).toBe(-10)
  })
})

describe('Pairs', () => {
  it('混色对 5:1', () => {
    const r = evaluatePairs([c('QS'), c('QH')], 6, 10)
    expect(r.hit).toBe('mixed-pair')
    expect(r.net).toBe(50)
  })
  it('同色异花对：4副 12:1，6副 10:1', () => {
    expect(evaluatePairs([c('QS'), c('QC')], 4, 10).net).toBe(120)
    expect(evaluatePairs([c('QS'), c('QC')], 6, 10).net).toBe(100)
    expect(evaluatePairs([c('QH'), c('QD')], 6, 10).hit).toBe('same-colour-pair')
  })
  it('完全同花对 30:1（多副牌才可能出现两张相同牌）', () => {
    const r = evaluatePairs([c('QS', 0), c('QS', 1)], 6, 10)
    expect(r.hit).toBe('same-suit-pair')
    expect(r.net).toBe(300)
  })
  it('非对子输', () => {
    expect(evaluatePairs([c('QS'), c('KS')], 6, 10).net).toBe(-10)
  })
})

describe('Top 3（取最高赔率）', () => {
  it('三条 90:1', () => {
    expect(evaluateTop3([c('7S'), c('7H')], c('7D'), 10).net).toBe(900)
  })
  it('同花顺 180:1', () => {
    expect(evaluateTop3([c('9S'), c('10S')], c('JS'), 10).net).toBe(1800)
  })
  it('同花三条 270:1', () => {
    const r = evaluateTop3([c('7S', 0), c('7S', 1)], c('7S', 2), 10)
    expect(r.hit).toBe('suited-three-of-a-kind')
    expect(r.net).toBe(2700)
  })
  it('普通顺子/同花不算 Top 3', () => {
    expect(evaluateTop3([c('9S'), c('10H')], c('JD'), 10).net).toBe(-10)
    expect(evaluateTop3([c('2S'), c('9S')], c('KS'), 10).net).toBe(-10)
  })
})
