import { describe, it, expect } from 'vitest'
import { extractJsonObject, numField, strField } from '@/core/json'
import { CharacterMemory } from '@/core/memory'
import { computeGlobalStats, computeCharacterStats } from '@/core/stats'
import { checkAchievements } from '@/core/achievements'
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

describe('角色记忆', () => {
  it('per-round 模式每局清空，note 保留', () => {
    const m = new CharacterMemory('per-round')
    m.record('u1', 'a1')
    expect(m.contextMessages()).toHaveLength(2)
    m.endRound()
    expect(m.contextMessages()).toHaveLength(0)
  })
  it('session 模式跨局保留', () => {
    const m = new CharacterMemory('session')
    m.record('u1', 'a1')
    m.endRound()
    expect(m.contextMessages()).toHaveLength(2)
  })
  it('压缩后历史替换为摘要', () => {
    const m = new CharacterMemory('persistent')
    m.record('u1', 'a1')
    m.applyCompression('我赢了很多')
    const ctx = m.contextMessages()
    expect(ctx[0].content).toContain('我赢了很多')
    expect(ctx).toHaveLength(2) // 摘要对 + 无对话
  })
  it('超长自动截断', () => {
    const m = new CharacterMemory('session')
    for (let i = 0; i < 30; i++) m.record(`u${i}`, `a${i}`)
    expect(m.turns.length).toBe(40)
    expect(m.turns[0].content).toBe('u10')
  })
  it('persistent 模式可序列化恢复，其他模式不恢复', () => {
    const p = new CharacterMemory('persistent')
    p.restore({ note: 'n', turns: [{ role: 'user', content: 'x' }] })
    expect(p.note).toBe('n')
    const s = new CharacterMemory('session')
    s.restore({ note: 'n', turns: [] })
    expect(s.note).toBeNull()
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

describe('统计聚合', () => {
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
        { seatId: 'o1', personaId: 'o1', personaName: 'Saber', modelLabel: 'gpt-x', bet: 50, net: 50, outcome: 'win' }
      ]
    }),
    record({
      round: 3, playerNet: 200,
      seats: [
        { seatId: 'player', personaName: '玩家', bet: 100, net: 200, outcome: 'win/win' },
        { seatId: 'o1', personaId: 'o1', personaName: 'Saber', modelLabel: 'gpt-x', bet: 50, net: 0, outcome: 'push' }
      ]
    })
  ]

  it('全局统计：胜率/BJ/爆牌/极值', () => {
    const g = computeGlobalStats(records)
    expect(g.rounds).toBe(3)
    expect(g.playerNet).toBe(250)
    expect(g.blackjacks).toBe(1)
    expect(g.wins).toBe(3) // BJ + 分牌双赢(2)
    expect(g.losses).toBe(1)
    expect(g.winRate).toBeCloseTo(0.75)
    expect(g.biggestWin).toBe(200)
    expect(g.biggestLoss).toBe(-100)
  })

  it('角色统计按 人格@模型 聚合', () => {
    const cs = computeCharacterStats(records)
    expect(cs).toHaveLength(1)
    expect(cs[0].key).toBe('Saber @ gpt-x')
    expect(cs[0].rounds).toBe(3)
    expect(cs[0].net).toBe(0)
    expect(cs[0].busts).toBe(1)
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
  it('已解锁不重复', () => {
    const r1 = record({
      round: 1, playerNet: 150,
      seats: [{ seatId: 'player', personaName: '玩家', bet: 100, net: 150, outcome: 'blackjack' }]
    })
    expect(checkAchievements([r1], r1, new Set(['first-blackjack']))).not.toContain('first-blackjack')
  })
  it('连胜 5 局', () => {
    const rs = [1, 2, 3, 4, 5].map((i) =>
      record({
        round: i, playerNet: 100,
        seats: [{ seatId: 'player', personaName: '玩家', bet: 100, net: 100, outcome: 'win' }]
      })
    )
    expect(checkAchievements(rs, rs[4], new Set())).toContain('win-streak-5')
    const broken = [...rs.slice(0, 3), record({ round: 4, playerNet: -100 }), rs[4]]
    expect(checkAchievements(broken, rs[4], new Set())).not.toContain('win-streak-5')
  })
})
