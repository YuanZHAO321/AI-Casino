import { Card } from '@/core/cards'
import { Shoe, SeenSummary } from '@/core/shoe'

export type BlackjackAction = 'hit' | 'stand' | 'double' | 'split'

export interface BlackjackRules {
  /** 牌副数 1–8，默认 6 */
  decks: number
  /** true = H17（庄家软17要牌），false = S17（默认） */
  hitSoft17: boolean
  /** 分 A 后每手只补一张（默认 false：文档仅禁再分，允许继续要牌） */
  splitAcesOneCard: boolean
  /** 分牌后允许加倍（默认 true） */
  doubleAfterSplit: boolean
  /** 切牌渗透率，默认 0.75 */
  penetration: number
  minBet: number
  maxBet: number
}

export const DEFAULT_RULES: BlackjackRules = {
  decks: 6,
  hitSoft17: false,
  splitAcesOneCard: false,
  doubleAfterSplit: true,
  penetration: 0.75,
  minBet: 10,
  maxBet: 1000
}

export interface SideBetStakes {
  twentyOnePlusThree?: number
  pairs?: number
  top3?: number
}

export type SideBetKind = keyof SideBetStakes

export interface SideBetResult {
  kind: SideBetKind
  stake: number
  /** 命中的牌型名（i18n key 或描述），null = 未中 */
  hit: string | null
  /** 赔率（9 = 9:1），未中为 0 */
  odds: number
  /** 净盈亏：中 = stake*odds，未中 = -stake */
  net: number
}

export interface Hand {
  cards: Card[]
  bet: number
  doubled: boolean
  fromSplit: boolean
  fromSplitAces: boolean
  /** 该手是否行动完毕 */
  done: boolean
  bust: boolean
}

export type HandOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'dealer-blackjack'

export interface SeatState {
  seatId: string
  isHuman: boolean
  personaId?: string
  name: string
  /** 主注（分牌/加倍以手为准，此为本局原始注） */
  baseBet: number
  sideBets: SideBetStakes
  sideBetResults: SideBetResult[]
  hands: Hand[]
  outcomes: HandOutcome[]
  /** 本局净盈亏（主注+边注），结算后填 */
  net: number
}

export type Phase = 'betting' | 'sidebets-settled' | 'acting' | 'dealer' | 'settled'

/** 完整内部状态 —— 含牌靴（隐藏信息），严禁直接进入任何 prompt */
export interface BlackjackState {
  rules: BlackjackRules
  shoe: Shoe
  phase: Phase
  roundNo: number
  /** 按 box 顺序（行动顺序） */
  seats: SeatState[]
  dealerCards: Card[]
  activeSeatIndex: number
  activeHandIndex: number
  /** 本局开始时是否刚重洗过牌靴 */
  shuffledThisRound: boolean
}

/* ---------- 投影类型：结构上不存在牌靴/未发牌字段 ---------- */

export interface HandView {
  cards: string[] // '♠A' 形式
  total: number
  soft: boolean
  bust: boolean
  blackjack: boolean
  doubled: boolean
  fromSplit: boolean
  done: boolean
  bet: number
  outcome?: HandOutcome
}

export interface SeatView {
  seatId: string
  name: string
  isYou: boolean
  isHuman: boolean
  baseBet: number
  sideBets: SideBetStakes
  sideBetResults: SideBetResult[]
  hands: HandView[]
  net?: number
}

export interface TableView {
  game: 'blackjack'
  round: number
  phase: Phase
  rules: Omit<BlackjackRules, 'penetration'> & { penetration?: number }
  dealer: {
    cards: string[]
    total: number | null
    soft: boolean
    blackjack: boolean
    bust: boolean
  }
  seats: SeatView[]
  /** 当前轮到的座位/手 */
  activeSeatId?: string
  activeHandIndex?: number
  /** 本靴已发牌公开汇总（明牌人人可见；是否注入 prompt 由人格记牌开关决定） */
  seen: SeenSummary
  shuffledThisRound: boolean
}
