import { BlackjackRules, DEFAULT_RULES } from './types'

/**
 * 规则预设。decks/penetration/限红不属于预设（玩家单独控制）。
 * - uk：用户上传的英式文档（默认）：无暗牌、任意前两张可加倍、仅分一次、DAS、S17
 * - eu：欧式 ENHC：无暗牌、双倍限硬 9-11、分 A 一张、无 DAS、仅分一次、S17
 * - us：美式 Vegas 拟真：暗牌+偷看+保险+Late Surrender、H17、任意加倍、DAS、
 *       可再分至 4 手、分 A 一张
 */
export type RulePresetId = 'uk' | 'eu' | 'us' | 'custom'

type PresetFields = Omit<BlackjackRules, 'decks' | 'penetration' | 'minBet' | 'maxBet'>

export const RULE_PRESETS: Record<Exclude<RulePresetId, 'custom'>, PresetFields> = {
  uk: {
    hitSoft17: false,
    splitAcesOneCard: false,
    doubleAfterSplit: true,
    holeCard: false,
    peek: false,
    insurance: false,
    lateSurrender: false,
    doubleRestriction: 'any',
    maxSplitHands: 2
  },
  eu: {
    hitSoft17: false,
    splitAcesOneCard: true,
    doubleAfterSplit: false,
    holeCard: false,
    peek: false,
    insurance: false,
    lateSurrender: false,
    doubleRestriction: '9-11',
    maxSplitHands: 2
  },
  us: {
    hitSoft17: true,
    splitAcesOneCard: true,
    doubleAfterSplit: true,
    holeCard: true,
    peek: true,
    insurance: true,
    lateSurrender: true,
    doubleRestriction: 'any',
    maxSplitHands: 4
  }
}

export function applyPreset(rules: BlackjackRules, preset: Exclude<RulePresetId, 'custom'>): BlackjackRules {
  return { ...rules, ...RULE_PRESETS[preset] }
}

/** 检测当前规则匹配哪个预设（全不匹配 = custom） */
export function detectPreset(rules: BlackjackRules): RulePresetId {
  for (const id of ['uk', 'eu', 'us'] as const) {
    const p = RULE_PRESETS[id]
    if ((Object.keys(p) as (keyof PresetFields)[]).every((k) => rules[k] === p[k])) return id
  }
  return 'custom'
}

export { DEFAULT_RULES }
