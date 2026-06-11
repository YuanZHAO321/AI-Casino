import { Card } from '@/core/cards'
import { BlackjackAction, BlackjackState } from './types'
import { handValue, rankValue, isPair } from './hand'

/**
 * 多副牌基本策略（英式无暗牌 ENHC 修正版）：
 * 庄家明牌为 10/A 时不加倍、不分牌（除非别无选择），因为庄家 BJ 会通吃加注。
 * 仅用于：本地机器人、AI 非法操作/解析失败兜底、玩家习惯对照。
 */
export function basicStrategy(
  playerCards: Card[],
  dealerUp: Card,
  legal: BlackjackAction[]
): BlackjackAction {
  const up = rankValue(dealerUp.rank) // A = 11
  const enhcDanger = up >= 10 // 庄家 10 或 A

  const pick = (preferred: BlackjackAction, fallback: BlackjackAction): BlackjackAction =>
    legal.includes(preferred) ? preferred : fallback

  // 分牌判定
  if (legal.includes('split') && isPair(playerCards)) {
    const r = playerCards[0].rank
    if (!enhcDanger) {
      if (r === 'A' || r === '8') return 'split'
      if ((r === '2' || r === '3' || r === '7') && up >= 2 && up <= 7) return 'split'
      if (r === '6' && up >= 2 && up <= 6) return 'split'
      if (r === '9' && up !== 7 && up >= 2 && up <= 9) return 'split'
      if (r === '4' && (up === 5 || up === 6)) return 'split'
    }
    // 5,5 / 10,10 或 ENHC 危险位：按总点数继续走下面逻辑
  }

  const v = handValue(playerCards)

  // 软牌
  if (v.soft) {
    const t = v.total
    if (t >= 19) return pick('stand', 'stand')
    if (t === 18) {
      if (!enhcDanger && up >= 3 && up <= 6) return pick('double', 'stand')
      if (up <= 8) return 'stand'
      return 'hit'
    }
    // 软13–17
    if (!enhcDanger) {
      if (t === 17 && up >= 3 && up <= 6) return pick('double', 'hit')
      if ((t === 15 || t === 16) && up >= 4 && up <= 6) return pick('double', 'hit')
      if ((t === 13 || t === 14) && (up === 5 || up === 6)) return pick('double', 'hit')
    }
    return 'hit'
  }

  // 硬牌
  const t = v.total
  if (t >= 17) return 'stand'
  if (t >= 13) return up >= 2 && up <= 6 ? 'stand' : 'hit'
  if (t === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit'
  if (t === 11) return !enhcDanger ? pick('double', 'hit') : 'hit'
  if (t === 10) return !enhcDanger && up <= 9 ? pick('double', 'hit') : 'hit'
  if (t === 9) return up >= 3 && up <= 6 ? pick('double', 'hit') : 'hit'
  return 'hit'
}

/**
 * 非法操作兜底：校验 AI 提议的动作，非法/无法解析时替换为基本策略默认值。
 * corrected = true 表示发生了修正（UI 标记 + 下次调用告知 AI）。
 */
export function resolveProposedAction(
  state: BlackjackState,
  legal: BlackjackAction[],
  proposed: string | undefined
): { action: BlackjackAction; corrected: boolean } {
  const normalized = (proposed ?? '').trim().toLowerCase()
  if ((legal as string[]).includes(normalized)) {
    return { action: normalized as BlackjackAction, corrected: false }
  }
  return { action: fallbackAction(state, legal), corrected: true }
}

/** 引擎兜底入口：从合法集合中选基本策略动作 */
export function fallbackAction(state: BlackjackState, legal: BlackjackAction[]): BlackjackAction {
  if (legal.length === 0) return 'stand'
  const seat = state.seats[state.activeSeatIndex]
  const hand = seat?.hands[state.activeHandIndex]
  const up = state.dealerCards[0]
  if (!seat || !hand || !up) return legal[0]
  const action = basicStrategy(hand.cards, up, legal)
  return legal.includes(action) ? action : legal.includes('stand') ? 'stand' : legal[0]
}
