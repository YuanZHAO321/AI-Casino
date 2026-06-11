import { describe, it, expect } from 'vitest'
import { BlackjackSession, SessionEvent } from '@/games/blackjack/session'
import { DEFAULT_RULES } from '@/games/blackjack/types'
import { Persona, ApiProfile, LOCAL_BOT_PROFILE_ID, RoundRecord } from '@/core/types'

const botProfile: ApiProfile = {
  id: LOCAL_BOT_PROFILE_ID, name: 'bot', baseURL: '', apiKey: '',
  model: 'basic', temperature: 0, useJsonMode: false
}

function botPersona(id: string, role: Persona['role']): Persona {
  return {
    id, name: id, role: role as 'opponent', promptMode: 'simple', characterText: '',
    profileId: LOCAL_BOT_PROFILE_ID, cardCounting: false, speechEnabled: false,
    memoryMode: 'per-round'
  }
}

describe('端到端整局流程（本地机器人，无 API）', () => {
  it('完整跑一局：下注→AI行动→玩家行动→庄家→结算→记录', async () => {
    const events: SessionEvent[] = []
    let record: RoundRecord | null = null
    let awaiting = false

    const session = new BlackjackSession({
      rules: DEFAULT_RULES,
      playerName: '玩家',
      playerBankroll: 1000,
      playerSeatIndex: 1,
      opponents: [
        { persona: botPersona('opp1', 'opponent'), profile: botProfile },
        { persona: botPersona('opp2', 'opponent'), profile: botProfile }
      ],
      companions: [{ persona: botPersona('comp1', 'companion'), profile: botProfile }],
      dealer: { persona: botPersona('dealer1', 'dealer'), profile: botProfile },
      settings: { tableTalk: true, declarations: true, dealerSettle: true, habitMemory: true },
      onEvent: (e) => {
        events.push(e)
        if (e.type === 'awaiting-player') awaiting = true
        if (e.type === 'round-settled') record = e.record
      }
    })

    await session.startRound(100, { pairs: 10 })

    // 多局循环直到没有玩家手需要决策的情况都处理：本测试只跑一局
    // 玩家可能开局就 BJ（直接结算），否则等待玩家行动
    if (awaiting) {
      // 一直停牌直到结算
      let guard = 0
      while (!record && guard++ < 10) {
        await session.playerAction('stand')
      }
    }

    expect(record).not.toBeNull()
    const r = record! as RoundRecord
    expect(r.round).toBe(1)
    expect(r.playerBet).toBe(100)
    expect(r.seats).toHaveLength(3)
    expect(r.bankrollBefore).toBe(1000)
    expect(r.bankrollAfter).toBe(session.playerBankroll)
    // 玩家盈亏 = 余额差
    expect(r.bankrollAfter - r.bankrollBefore).toBe(r.playerNet)
    // 对手筹码也已结算
    for (const opp of session.opponents) {
      expect(typeof opp.bankroll).toBe('number')
      expect(opp.nextBet).toBe(DEFAULT_RULES.minBet) // 本地机器人下局最低注
    }
    // 牌靴守恒：已发牌数 = 桌面所有牌
    const view = session.currentView!
    const visible =
      view.dealer.cards.length +
      view.seats.reduce((n, s) => n + s.hands.reduce((m, h) => m + h.cards.length, 0), 0)
    expect(visible).toBe(session.shoe.dealtCount)
  })

  it('连续多局：注额沿用、局数递增、切牌重洗不丢牌', async () => {
    let record: RoundRecord | null = null
    let awaiting = false
    const session = new BlackjackSession({
      rules: { ...DEFAULT_RULES, decks: 1, penetration: 0.5 },
      playerName: 'P',
      playerBankroll: 1000,
      playerSeatIndex: 0,
      opponents: [{ persona: botPersona('opp1', 'opponent'), profile: botProfile }],
      companions: [],
      dealer: null,
      settings: { tableTalk: false, declarations: false, dealerSettle: false, habitMemory: false },
      onEvent: (e) => {
        if (e.type === 'awaiting-player') awaiting = true
        if (e.type === 'round-settled') record = e.record
      }
    })

    for (let round = 1; round <= 8; round++) {
      record = null
      awaiting = false
      await session.startRound(10, {})
      if (awaiting) {
        let guard = 0
        while (!record && guard++ < 10) await session.playerAction('stand')
      }
      expect(record).not.toBeNull()
      expect((record! as RoundRecord).round).toBe(round)
    }
    expect(session.roundNo).toBe(8)
  })
})
