/** 平台核心类型：座位、人格、API Profile、记忆、历史 —— 与具体游戏无关 */

export type SeatRole = 'player' | 'opponent' | 'companion' | 'dealer'

export interface ApiProfile {
  id: string
  name: string
  baseURL: string
  apiKey: string
  model: string
  temperature: number
  /** 请求时附带 response_format: json_object（不支持的服务商会自动回退） */
  useJsonMode: boolean
}

export type MemoryMode = 'persistent' | 'session' | 'per-round'

/** 内置本地基本策略机器人（无需 API）使用的特殊 profileId */
export const LOCAL_BOT_PROFILE_ID = '__local_bot__'

export interface Persona {
  id: string
  /** 角色显示名 */
  name: string
  role: 'opponent' | 'companion' | 'dealer'
  /** 简单模式：一句话角色设定；高级模式：完整自定义角色 prompt */
  promptMode: 'simple' | 'advanced'
  /** simple 模式填角色描述，advanced 模式填完整角色层 prompt */
  characterText: string
  profileId: string
  /** 是否注入本靴已发牌汇总（记牌能力） */
  cardCounting: boolean
  /** 行动/结算时是否说话（关闭省 token） */
  speechEnabled: boolean
  memoryMode: MemoryMode
  /** 陪玩位功能开关 */
  companion?: {
    autoCommentChance: number // 0-1 每轮概率吐槽
    banterEnabled: boolean // 吐槽/聊天
    adviceEnabled: boolean // 建议
  }
  /** 荷官评论模式 */
  dealerCommentMode?: 'off' | 'every' | 'chance'
  dealerCommentChance?: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 公开桌聊记录（AI 桌聊功能的数据源，全部为已说出口的话） */
export interface TableUtterance {
  seq: number
  speakerId: string // personaId 或 'player' 或 'dealer'
  speakerName: string
  text: string
  round: number
}

/** 一局结束后的持久化记录（与具体游戏解耦，detail 由游戏模块填充） */
export interface RoundRecord {
  id: string
  game: string // 'blackjack'
  round: number
  timestamp: number
  playerBet: number
  playerSideBets?: Record<string, number>
  /** 玩家盈亏（含边注） */
  playerNet: number
  bankrollBefore: number
  bankrollAfter: number
  /** 各座位结果摘要（含 AI 对手），供统计 */
  seats: SeatResult[]
  /** 结算宣言：personaId/player/dealer -> 文本 */
  declarations: Record<string, string>
  /** 玩家自己的结算输入 */
  playerNote?: string
  /** 游戏特定细节（牌面、操作序列等） */
  detail?: unknown
  /** 资金重置标记（重新买入等） */
  bankrollEvent?: 'rebuy' | 'manual-reset'
}

export interface SeatResult {
  seatId: string
  personaId?: string
  personaName: string
  modelLabel?: string
  bet: number
  net: number
  outcome: string // 'win' | 'lose' | 'push' | 'blackjack' | 'bust' | ...
  /** 玩家习惯记忆：决策点记录（仅玩家座位、开启时） */
  decisions?: PlayerDecision[]
}

export interface PlayerDecision {
  /** 紧凑态势，如 "16 vs 10" */
  situation: string
  action: string
  /** 基本策略推荐 */
  basicStrategy: string
}

export interface Achievement {
  id: string
  unlockedAt: number
}
