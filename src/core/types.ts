/** 平台核心类型：座位、人格、API Profile、记忆、历史 —— 与具体游戏无关 */

export type SeatRole = 'player' | 'opponent' | 'companion' | 'dealer'

export interface ApiProfile {
  id: string
  name: string
  baseURL: string
  apiKey: string
  /** 模型池：拉取列表后多选 + 手动添加 */
  models: string[]
  temperature: number
  /** 请求时附带 response_format: json_object（不支持的服务商会自动回退） */
  useJsonMode: boolean
}

/** 接口+模型 组合引用（可跨接口） */
export interface ModelRef {
  profileId: string
  /** 空 = 用该接口模型池第一个 */
  model: string
}

/**
 * 记忆清理时机（对话上下文的生命周期）：
 * none=无记忆(每次调用全新) / per-round=本局 / per-match=本场 /
 * per-launch=本次打开 / permanent=永久 / manual=手动管理（只有手动新会话才清）
 */
export type MemoryReset = 'none' | 'per-round' | 'per-match' | 'per-launch' | 'permanent' | 'manual'

/** 历史感知：注入多少历史战绩背景。none=无 / brief=统计摘要 / full=摘要+最近各局结算明细 */
export type HistoryAwareness = 'none' | 'brief' | 'full'

/** 内置本地基本策略机器人（无需 API）使用的特殊 profileId */
export const LOCAL_BOT_PROFILE_ID = '__local_bot__'

export interface VoiceConfig {
  engine: 'off' | 'neural' | 'system' | 'api'
  /** neural 音色 id / system 语音名 / api 音色名 */
  voice?: string
  /** api 引擎：使用哪个接口（baseURL+key） */
  apiProfileId?: string
  /** api 引擎：模型名（如 tts-1） */
  apiModel?: string
}

export interface Persona {
  id: string
  /** 角色显示名 */
  name: string
  role: 'opponent' | 'companion' | 'dealer'
  /** 头像（casino-asset:// URL），空=首字母圆徽 */
  avatar?: string
  /** 简单模式：一句话角色设定；高级模式：完整自定义角色 prompt */
  promptMode: 'simple' | 'advanced'
  characterText: string
  /** 快速模型：出牌/下注/宣言/吐槽/荷官播报（默认全走这里） */
  fast: ModelRef
  /** 推理模型（可选，空=用快速）：陪玩打字聊天、建议、角色分析对话 */
  smart?: ModelRef
  /** 备用模型（可选）：主模型重试后仍失败时自动切换再试 */
  backup?: ModelRef
  /** 是否注入本靴已发牌汇总（记牌能力） */
  cardCounting: boolean
  /** 行动/结算时是否说话（关闭省 token） */
  speechEnabled: boolean
  memoryReset: MemoryReset
  historyAwareness: HistoryAwareness
  voice?: VoiceConfig
  /** 陪玩位功能开关 */
  companion?: {
    autoCommentChance: number
    banterEnabled: boolean
    adviceEnabled: boolean
  }
  /** 荷官评论模式 */
  dealerCommentMode?: 'off' | 'every' | 'chance'
  dealerCommentChance?: number
  /** 荷官用模型决策抽牌（保持人设思维；非法值由规则强制修正） */
  dealerUseModel?: boolean
  /** 荷官抽牌时播报 */
  dealerDrawSpeech?: boolean
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

/** 一场（包含多局），可命名 */
export interface Match {
  id: string
  name: string
  createdAt: number
  endedAt?: number
  /** 本场起始资金（盈亏基准） */
  startBankroll: number
}

/** 一局结束后的持久化记录（与具体游戏解耦，detail 由游戏模块填充） */
export interface RoundRecord {
  id: string
  game: string // 'blackjack'
  /** 所属场 */
  matchId?: string
  /** 全局局号（兼容旧数据）；场内局号见 matchRound */
  round: number
  matchRound?: number
  timestamp: number
  playerBet: number
  playerSideBets?: Record<string, number>
  /** 玩家盈亏（含边注/保险） */
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
  outcome: string // 'win' | 'lose' | 'push' | 'blackjack' | 'bust' | 'surrender' | ...
  /** 每手牌面（'♠A' 形式），记录用 */
  hands?: string[][]
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
