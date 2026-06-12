import { describe, it, expect } from 'vitest'
import { extractJsonObject, numField, strField, unwrapSpeech } from '@/core/json'
import { CharacterMemory } from '@/core/memory'
import {
  computeGlobalStats, computeHouseStats, computePersonaStats, computeModelStats
} from '@/core/stats'
import { checkAchievements } from '@/core/achievements'
import { migrateProfile, migratePersona } from '@/core/migrate'
import { RoundRecord } from '@/core/types'

describe('健壮 JSON 提取（劣质模型兼容）', () => {
  it('纯 JSON', () => {
    expect(extractJsonObject('{"action":"hit","say":"来"}')).toEqual({ action: 'hit', say: '来' })
  })
  it('围栏代码块与前后废话', () => {
    const text = '好的，我决定要牌。\n```json\n{"action": "hit", "say": "再来一张！"}\n```\n祝我好运'
    expect(extractJsonObject(text)?.action).toBe('hit')
  })
  it('嵌套对象与字符串内大括号', () => {
    const text = '前缀 {"say": "这把{稳}了", "nextBet": 50, "nextSideBets": {"pairs": 10}} 后缀'
    const obj = extractJsonObject(text)!
    expect(obj.nextBet).toBe(50)
    expect((obj.nextSideBets as Record<string, number>).pairs).toBe(10)
  })
  it('无 JSON 返回 null', () => {
    expect(extractJsonObject('我要牌！')).toBeNull()
    expect(extractJsonObject('{broken')).toBeNull()
  })
  it('字段宽容解析', () => {
    const obj = extractJsonObject('{"bet": "£250", "say": "  梭哈  "}')!
    expect(numField(obj, 'bet')).toBe(250)
    expect(strField(obj, 'say')).toBe('梭哈')
    expect(numField(obj, 'missing')).toBeUndefined()
  })
})

describe('unwrapSpeech：纯说话输出防 JSON 泄漏（#6/#11）', () => {
  it('{"response": "..."} 解包', () => {
    expect(unwrapSpeech('{"response": "这把打得不错！"}')).toBe('这把打得不错！')
  })
  it('{"say": "..."} 与 {"report": "..."} 解包', () => {
    expect(unwrapSpeech('{"say": "稳住"}')).toBe('稳住')
    expect(unwrapSpeech('{"report": "### 分析\\n内容"}')).toBe('### 分析\n内容')
  })
  it('代码块包裹的 JSON 解包', () => {
    expect(unwrapSpeech('```json\n{"text": "冲鸭！"}\n```')).toBe('冲鸭！')
  })
  it('普通文本原样返回（含开头不是 { 的）', () => {
    expect(unwrapSpeech('这把打得不错！')).toBe('这把打得不错！')
    expect(unwrapSpeech('  前后有空格  ')).toBe('前后有空格')
  })
  it('未知键取第一个字符串字段', () => {
    expect(unwrapSpeech('{"输出": "你好"}')).toBe('你好')
  })
})

describe('角色记忆（六档清理）', () => {
  it('none：完全不记录', () => {
    const m = new CharacterMemory('none')
    m.record('u1', 'a1')
    expect(m.contextMessages()).toHaveLength(0)
  })
  it('per-round：每局清空', () => {
    const m = new CharacterMemory('per-round')
    m.record('u1', 'a1')
    expect(m.contextMessages()).toHaveLength(2)
    m.endRound()
    expect(m.contextMessages()).toHaveLength(0)
  })
  it('per-match：跨局保留、新场清空、可持久化', () => {
    const m = new CharacterMemory('per-match')
    m.record('u1', 'a1')
    m.endRound()
    expect(m.contextMessages()).toHaveLength(2)
    expect(m.persisted).toBe(true)
    m.endMatch()
    expect(m.contextMessages()).toHaveLength(0)
  })
  it('per-launch：跨场保留但不持久化', () => {
    const m = new CharacterMemory('per-launch')
    m.record('u1', 'a1')
    m.endMatch()
    expect(m.contextMessages()).toHaveLength(2)
    expect(m.persisted).toBe(false)
    m.restore({ note: 'x', turns: [] })
    expect(m.note).toBeNull() // 不恢复
  })
  it('permanent/manual：持久且只有手动清', () => {
    for (const mode of ['permanent', 'manual'] as const) {
      const m = new CharacterMemory(mode)
      m.record('u1', 'a1')
      m.endRound()
      m.endMatch()
      expect(m.contextMessages()).toHaveLength(2)
      expect(m.persisted).toBe(true)
      m.resetAll()
      expect(m.contextMessages()).toHaveLength(0)
    }
  })
  it('压缩后历史替换为摘要', () => {
    const m = new CharacterMemory('permanent')
    m.record('u1', 'a1')
    m.applyCompression('我赢了很多')
    const ctx = m.contextMessages()
    expect(ctx[0].content).toContain('我赢了很多')
    expect(ctx).toHaveLength(2)
  })
  it('超长自动截断', () => {
    const m = new CharacterMemory('per-launch')
    for (let i = 0; i < 30; i++) m.record(`u${i}`, `a${i}`)
    expect(m.turns.length).toBe(40)
    expect(m.turns[0].content).toBe('u10')
  })
})

describe('存储迁移 v0.1→v0.2', () => {
  it('profile.model → models[]', () => {
    const p = migrateProfile({ id: 'x', name: 'a', baseURL: 'u', apiKey: 'k', model: 'gpt-4o-mini', temperature: 0.7, useJsonMode: true })
    expect(p.models).toEqual(['gpt-4o-mini'])
  })
  it('persona.profileId → fast 槽；memoryMode 三档 → 六档', () => {
    const p = migratePersona({
      id: 'p1', name: 'n', role: 'opponent', promptMode: 'simple', characterText: '',
      profileId: 'prof-1', cardCounting: false, speechEnabled: true, memoryMode: 'persistent'
    })
    expect(p.fast).toEqual({ profileId: 'prof-1', model: '' })
    expect(p.memoryReset).toBe('permanent')
    expect(p.historyAwareness).toBe('brief')
    expect(migratePersona({ memoryMode: 'session' }).memoryReset).toBe('per-launch')
    expect(migratePersona({ memoryMode: 'per-round' }).memoryReset).toBe('per-round')
  })
})

function record(partial: Partial<RoundRecord> & { round: number }): RoundRecord {
  return {
    id: String(partial.round),
    game: 'blackjack',
    timestamp: 0,
    playerBet: 100,
    playerNet: 0,
    bankrollBefore: 1000,
    bankrollAfter: 1000,
    seats: [{ seatId: 'player', personaName: '玩家', bet: 100, net: partial.playerNet ?? 0, outcome: 'push' }],
    declarations: {},
    ...partial
  }
}

describe('统计四块', () => {
  const records: RoundRecord[] = [
    record({
      round: 1, playerNet: 150,
      seats: [
        { seatId: 'player', personaName: '玩家', bet: 100, net: 150, outcome: 'blackjack' },
        { seatId: 'o1', personaId: 'o1', personaName: 'Saber', modelLabel: 'gpt-x', bet: 50, net: -50, outcome: 'bust' }
      ]
    }),
    record({
      round: 2, playerNet: -100,
      seats: [
        { seatId: 'player', personaName: '玩家', bet: 100, net: -100, outcome: 'lose' },
        { seatId: 'o1', personaId: 'o1', personaName: 'Saber', modelLabel: 'gpt-y', bet: 50, net: 50, outcome: 'win' }
      ]
    }),
    record({
      round: 3, playerNet: -50,
      seats: [
        { seatId: 'player', personaName: '玩家', bet: 100, net: -50, outcome: 'surrender' },
        { seatId: 'o2', personaId: 'o2', personaName: '老周', modelLabel: 'gpt-x', bet: 50, net: 0, outcome: 'push' }
      ]
    })
  ]

  it('玩家统计：胜率/投降/极值/习惯一致率', () => {
    const g = computeGlobalStats(records)
    expect(g.rounds).toBe(3)
    expect(g.playerNet).toBe(0)
    expect(g.blackjacks).toBe(1)
    expect(g.surrenders).toBe(1)
    expect(g.wins).toBe(1)
    expect(g.losses).toBe(2) // lose + surrender
    expect(g.strategyMatchRate).toBeNull()
  })

  it('赌场统计：houseNet 与抽水率', () => {
    const h = computeHouseStats(records)
    // 每局 house = -(玩家+对手)：r1 = -(150-50)=-100, r2 = -(-100+50)=50, r3 = -(-50+0)=50
    expect(h.houseNet).toBe(0)
    expect(h.trend).toEqual([-100, 50, 50])
    expect(h.totalWagered).toBe(450)
    expect(h.edgeRate).toBe(0)
  })

  it('按人格聚合（跨模型）', () => {
    const ps = computePersonaStats(records)
    const saber = ps.find((x) => x.key === 'Saber')!
    expect(saber.rounds).toBe(2) // gpt-x + gpt-y 合并
    expect(saber.net).toBe(0)
    expect(ps.find((x) => x.key === '老周')!.rounds).toBe(1)
  })

  it('按模型聚合（跨人格）', () => {
    const ms = computeModelStats(records)
    const gptx = ms.find((x) => x.key === 'gpt-x')!
    expect(gptx.rounds).toBe(2) // Saber + 老周 合并
    expect(gptx.net).toBe(-50)
    expect(ms.find((x) => x.key === 'gpt-y')!.net).toBe(50)
  })
})

describe('成就', () => {
  it('首个 BJ 与 £500 大胜', () => {
    const r1 = record({
      round: 1, playerNet: 600,
      seats: [{ seatId: 'player', personaName: '玩家', bet: 400, net: 600, outcome: 'blackjack' }]
    })
    const fresh = checkAchievements([r1], r1, new Set())
    expect(fresh).toContain('first-blackjack')
    expect(fresh).toContain('big-win-500')
  })
  it('连胜 5 局', () => {
    const rs = [1, 2, 3, 4, 5].map((i) =>
      record({
        round: i, playerNet: 100,
        seats: [{ seatId: 'player', personaName: '玩家', bet: 100, net: 100, outcome: 'win' }]
      })
    )
    expect(checkAchievements(rs, rs[4], new Set())).toContain('win-streak-5')
  })
})
