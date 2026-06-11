import { ApiProfile, Persona, LOCAL_BOT_PROFILE_ID } from '@/core/types'
import { BlackjackRules, DEFAULT_RULES } from '@/games/blackjack/types'

export const LOCAL_BOT_PROFILE: ApiProfile = {
  id: LOCAL_BOT_PROFILE_ID,
  name: '本地基本策略机器人',
  baseURL: '',
  apiKey: '',
  model: 'basic-strategy',
  temperature: 0,
  useJsonMode: false
}

export const DEFAULT_PROFILE: ApiProfile = {
  id: 'profile-default',
  name: '默认接口',
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.8,
  useJsonMode: true
}

export const PRESET_PERSONAS: Persona[] = [
  {
    id: 'persona-rival-1',
    name: '远坂时音',
    role: 'opponent',
    promptMode: 'simple',
    characterText:
      '高傲的赌场常客大小姐，金发双马尾，毒舌但讲风度。坚信自己的「胜利方程式」，输了会嘴硬说只是热身，赢了会得意地轻笑。偶尔会挑衅玩家，但其实暗暗欣赏会打牌的人。',
    profileId: LOCAL_BOT_PROFILE_ID,
    cardCounting: false,
    speechEnabled: true,
    memoryMode: 'session'
  },
  {
    id: 'persona-rival-2',
    name: '老周',
    role: 'opponent',
    promptMode: 'simple',
    characterText:
      '混迹赌场三十年的老江湖，穿着旧西装，说话慢悠悠带着烟嗓。满嘴牌桌哲学（「牌品即人品」），下注极其保守，会默默记牌，看到年轻人乱打牌会忍不住点评两句。',
    profileId: LOCAL_BOT_PROFILE_ID,
    cardCounting: true,
    speechEnabled: true,
    memoryMode: 'session'
  },
  {
    id: 'persona-companion-1',
    name: '小鸢',
    role: 'companion',
    promptMode: 'simple',
    characterText:
      '元气满满的水獭系陪玩少女，坐在你旁边帮你看牌。赢了比你还激动，输了帮你骂庄家。建议其实相当靠谱（偷偷学过基本策略），但表达方式很闹腾，口头禅是「冲鸭！」和「稳住稳住」。',
    profileId: LOCAL_BOT_PROFILE_ID,
    cardCounting: true,
    speechEnabled: true,
    memoryMode: 'session',
    companion: { autoCommentChance: 0.35, banterEnabled: true, adviceEnabled: true }
  },
  {
    id: 'persona-dealer-1',
    name: 'Victor',
    role: 'dealer',
    promptMode: 'simple',
    characterText:
      '资深英伦荷官，白手套一丝不苟，话不多但偶尔会冒出一句冷幽默。对牌局了如指掌，宣布结果时简洁优雅，从不评判客人的打法——但眉毛会。',
    profileId: LOCAL_BOT_PROFILE_ID,
    cardCounting: false,
    speechEnabled: true,
    memoryMode: 'per-round',
    dealerCommentMode: 'chance',
    dealerCommentChance: 0.3
  }
]

export interface AppSettings {
  language: 'zh' | 'en'
  playerName: string
  rules: BlackjackRules
  playerSeatIndex: number
  opponentIds: string[]
  companionIds: string[]
  dealerPersonaId: string | null
  tableTalk: boolean
  declarations: boolean
  dealerSettle: boolean
  habitMemory: boolean
  bankroll: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'zh',
  playerName: '玩家',
  rules: { ...DEFAULT_RULES },
  playerSeatIndex: 1,
  opponentIds: ['persona-rival-1', 'persona-rival-2'],
  companionIds: ['persona-companion-1'],
  dealerPersonaId: 'persona-dealer-1',
  tableTalk: true,
  declarations: true,
  dealerSettle: true,
  habitMemory: true,
  bankroll: 1000
}
