import { ApiProfile, Persona, LOCAL_BOT_PROFILE_ID } from '@/core/types'
import { BlackjackRules, DEFAULT_RULES } from '@/games/blackjack/types'

export const LOCAL_BOT_PROFILE: ApiProfile = {
  id: LOCAL_BOT_PROFILE_ID,
  name: '本地基本策略机器人',
  baseURL: '',
  apiKey: '',
  models: ['basic-strategy'],
  temperature: 0,
  useJsonMode: false
}

export const DEFAULT_PROFILE: ApiProfile = {
  id: 'profile-default',
  name: '默认接口',
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  models: [],
  temperature: 0.8,
  useJsonMode: true
}

const LOCAL_REF = { profileId: LOCAL_BOT_PROFILE_ID, model: '' }

export const PRESET_PERSONAS: Persona[] = [
  {
    id: 'persona-rival-1',
    name: '远坂时音',
    role: 'opponent',
    promptMode: 'simple',
    characterText:
      '高傲的赌场常客大小姐，金发双马尾，毒舌但讲风度。坚信自己的「胜利方程式」，输了会嘴硬说只是热身，赢了会得意地轻笑。偶尔会挑衅玩家，但其实暗暗欣赏会打牌的人。',
    fast: { ...LOCAL_REF },
    cardCounting: false,
    speechEnabled: true,
    memoryReset: 'per-match',
    historyAwareness: 'brief'
  },
  {
    id: 'persona-rival-2',
    name: '老周',
    role: 'opponent',
    promptMode: 'simple',
    characterText:
      '混迹赌场三十年的老江湖，穿着旧西装，说话慢悠悠带着烟嗓。满嘴牌桌哲学（「牌品即人品」），下注极其保守，会默默记牌，看到年轻人乱打牌会忍不住点评两句。',
    fast: { ...LOCAL_REF },
    cardCounting: true,
    speechEnabled: true,
    memoryReset: 'per-match',
    historyAwareness: 'brief'
  },
  {
    id: 'persona-companion-1',
    name: '小鸢',
    role: 'companion',
    promptMode: 'simple',
    characterText:
      '元气满满的水獭系陪玩少女，坐在你旁边帮你看牌。赢了比你还激动，输了帮你骂庄家。建议其实相当靠谱（偷偷学过基本策略），但表达方式很闹腾，口头禅是「冲鸭！」和「稳住稳住」。',
    fast: { ...LOCAL_REF },
    cardCounting: true,
    speechEnabled: true,
    memoryReset: 'per-match',
    historyAwareness: 'brief',
    companion: { autoCommentChance: 0.35, banterEnabled: true, adviceEnabled: true }
  },
  {
    id: 'persona-dealer-1',
    name: 'Victor',
    role: 'dealer',
    promptMode: 'simple',
    characterText:
      '资深英伦荷官，白手套一丝不苟，话不多但偶尔会冒出一句冷幽默。对牌局了如指掌，宣布结果时简洁优雅，从不评判客人的打法——但眉毛会。',
    fast: { ...LOCAL_REF },
    cardCounting: false,
    speechEnabled: true,
    memoryReset: 'per-round',
    historyAwareness: 'none',
    dealerCommentMode: 'chance',
    dealerCommentChance: 0.3,
    dealerUseModel: false,
    dealerDrawSpeech: false
  }
]

/** 真实赌场面额配色（英镑桌惯例） */
export const DEFAULT_CHIP_COLORS: Record<number, string> = {
  10: '#2e5f9e', // 蓝
  25: '#2e7d4f', // 绿
  50: '#c2622e', // 橙红
  100: '#23232b', // 黑
  500: '#6b3f8f', // 紫
  1000: '#b8922e' // 黄金
}

export interface AppearanceSettings {
  /** 自定义纹理（casino-asset:// URL），空=内置默认 */
  feltUrl?: string
  ambienceUrl?: string
  cardBackUrl?: string
  /** 环境背景模糊（px，0-24） */
  ambienceBlur: number
  /** 环境背景暗度（brightness 0.2-1） */
  ambienceDim: number
  chipColors: Record<number, string>
}

export interface BgmTrack {
  id: string
  name: string
  url: string
}

export interface AudioSettings {
  bgmVolume: number
  bgmLoop: boolean
  bgmTracks: BgmTrack[]
  currentTrackId?: string
  ttsEnabled: boolean
  ttsVolume: number
  /** 已安装的神经 TTS 模型 id（空=未装） */
  neuralModel?: string
  /** 全局首选引擎：未单独配音色的角色用它；装了神经模型也可切回系统（机器弱时） */
  preferredEngine: 'neural' | 'system'
}

export interface AppSettings {
  language: 'zh' | 'en'
  playerName: string
  playerAvatar?: string
  rules: BlackjackRules
  /** box 顺序：'player' 或 对手 personaId */
  seatOrder: string[]
  companionIds: string[]
  dealerPersonaId: string | null
  tableTalk: boolean
  declarations: boolean
  dealerSettle: boolean
  habitMemory: boolean
  playMode: 'auto' | 'manual'
  shoeMode: 'persist' | 'fresh'
  /** 桌上显示赌场盈亏牌子 */
  showHousePlaque: boolean
  startup: 'ask' | 'continue' | 'new'
  /** 竖屏（手机/平板）聊天面板呈现：drawer=底部抽屉按钮唤出；stacked=牌桌上聊天下常驻 */
  portraitLayout: 'drawer' | 'stacked'
  bankroll: number
  appearance: AppearanceSettings
  audio: AudioSettings
  ttsSetupDone: boolean
  currentMatchId?: string
  /** 上一局下注（Repeat Bet 用） */
  lastBet?: { bet: number; sideBets: Record<string, number> }
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'zh',
  playerName: '玩家',
  rules: { ...DEFAULT_RULES },
  seatOrder: ['persona-rival-1', 'player', 'persona-rival-2'],
  companionIds: ['persona-companion-1'],
  dealerPersonaId: 'persona-dealer-1',
  tableTalk: true,
  declarations: true,
  dealerSettle: true,
  habitMemory: true,
  playMode: 'auto',
  shoeMode: 'persist',
  showHousePlaque: true,
  startup: 'ask',
  portraitLayout: 'drawer',
  bankroll: 1000,
  appearance: {
    ambienceBlur: 8,
    ambienceDim: 0.5,
    chipColors: { ...DEFAULT_CHIP_COLORS }
  },
  audio: {
    bgmVolume: 0.5,
    bgmLoop: true,
    bgmTracks: [],
    ttsEnabled: false,
    ttsVolume: 0.9,
    preferredEngine: 'neural'
  },
  ttsSetupDone: false
}

/** 旧 settings → v2（playerSeatIndex/opponentIds → seatOrder 等） */
export function migrateSettings(raw: unknown): AppSettings {
  const s = raw as Partial<AppSettings> & {
    playerSeatIndex?: number
    opponentIds?: string[]
  }
  let seatOrder = s.seatOrder
  if (!seatOrder && Array.isArray(s.opponentIds)) {
    seatOrder = [...s.opponentIds]
    seatOrder.splice(Math.min(s.playerSeatIndex ?? 0, seatOrder.length), 0, 'player')
  }
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    rules: { ...DEFAULT_RULES, ...(s.rules ?? {}) },
    seatOrder: seatOrder ?? DEFAULT_SETTINGS.seatOrder,
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      ...(s.appearance ?? {}),
      chipColors: { ...DEFAULT_CHIP_COLORS, ...(s.appearance?.chipColors ?? {}) }
    },
    audio: { ...DEFAULT_SETTINGS.audio, ...(s.audio ?? {}) }
  }
}
