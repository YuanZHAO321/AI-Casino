import { describe, it, expect } from 'vitest'
import { BlackjackSession, SessionEvent, SessionConfig } from '@/games/blackjack/session'
import { DEFAULT_RULES } from '@/games/blackjack/types'
import { Persona, ApiProfile, LOCAL_BOT_PROFILE_ID, RoundRecord } from '@/core/types'

const botProfile: ApiProfile = {
  id: LOCAL_BOT_PROFILE_ID, name: 'bot', baseURL: '', apiKey: '',
  models: ['basic'], temperature: 0, useJsonMode: false
}

function botPersona(id: string, role: Persona['role']): Persona {
  return {
    id, name: id, role, promptMode: 'simple', characterText: '',
    fast: { profileId: LOCAL_BOT_PROFILE_ID, model: '' },
    cardCounting: false, speechEnabled: false,
    memoryReset: 'per-round', historyAwareness: 'none'
  }
}

function makeConfig(partial: Partial<SessionConfig>, onEvent: (e: SessionEvent) => void): SessionConfig {
  return {
    rules: DEFAULT_RULES,
    playerName: '玩家',
    playerBankroll: 1000,
    matchStartBankroll: 1000,
    seatOrder: ['player'],
    opponents: [],
    companions: [],
    dealer: null,
    settings: { tableTalk: true, declarations: true, dealerSettle: true, habitMemory: true, playMode: 'auto' },
    getProfile: (id) => (id === LOCAL_BOT_PROFILE_ID ? botProfile : undefined),
    onEvent,
    ...partial
  }
}

describe('端到端整局流程（本地机器人，无 API）', () => {
  it('完整跑一局：下注→AI行动→玩家行动→庄家→结算→记录', async () => {
    let record: RoundRecord | null = null
    let awaiting = false
    const session = new BlackjackSession(
      makeConfig(
        {
          seatOrder: ['opp1', 'player', 'opp2'],
          opponents: [botPersona('opp1', 'opponent'), botPersona('opp2', 'opponent')],
          companions: [botPersona('comp1', 'companion')],
          dealer: botPersona('dealer1', 'dealer')
        },
        (e) => {
          if (e.type === 'awaiting-player') awaiting = true
          if (e.type === 'round-settled') record = e.record
        }
      )
    )

    await session.startRound(100, { pairs: 10 })
    if (awaiting) {
      let guard = 0
      while (!record && guard++ < 10) await session.playerAction('stand')
    }

    expect(record).not.toBeNull()
    const r = record! as RoundRecord
    expect(r.round).toBe(1)
    expect(r.matchRound).toBe(1)
    expect(r.playerBet).toBe(100)
    expect(r.seats).toHaveLength(3)
    expect(r.seats[0].seatId).toBe('opp1') // 座位顺序生效
    expect(r.seats[1].seatId).toBe('player')
    expect(r.bankrollAfter - r.bankrollBefore).toBe(r.playerNet)
    // 每局记录所有人的牌面（含荷官）
    for (const s of r.seats) {
      expect(s.hands?.[0]?.length).toBeGreaterThanOrEqual(2)
      expect(s.hands![0][0]).toMatch(/^[♠♥♦♣]/)
    }
    expect((r.detail as { dealerCards: string[] }).dealerCards[0]).toMatch(/^[♠♥♦♣]/)
    for (const opp of session.opponents) {
      expect(opp.nextBet).toBe(DEFAULT_RULES.minBet)
    }
    const view = session.currentView!
    const visible =
      view.dealer.cards.filter((c) => c !== '??').length +
      view.seats.reduce((n, s) => n + s.hands.reduce((m, h) => m + h.cards.length, 0), 0)
    expect(visible).toBe(session.shoe.dealtCount)
  })

  it('连续多局：局数递增、牌靴快照可恢复局间状态', async () => {
    let record: RoundRecord | null = null
    let awaiting = false
    const onEvent = (e: SessionEvent): void => {
      if (e.type === 'awaiting-player') awaiting = true
      if (e.type === 'round-settled') record = e.record
    }
    const session = new BlackjackSession(
      makeConfig(
        {
          rules: { ...DEFAULT_RULES, decks: 1, penetration: 0.5 },
          seatOrder: ['player', 'opp1'],
          opponents: [botPersona('opp1', 'opponent')]
        },
        onEvent
      )
    )

    for (let round = 1; round <= 5; round++) {
      record = null
      awaiting = false
      await session.startRound(10, {})
      if (awaiting) {
        let guard = 0
        while (!record && guard++ < 10) await session.playerAction('stand')
      }
      expect((record! as RoundRecord).round).toBe(round)
    }

    // 牌靴快照 → 新 session 恢复后继续（模拟重启续场）
    const snap = session.getShoeSnapshot()
    const resumed = new BlackjackSession(
      makeConfig(
        {
          rules: { ...DEFAULT_RULES, decks: 1, penetration: 0.5 },
          seatOrder: ['player', 'opp1'],
          opponents: [botPersona('opp1', 'opponent')],
          startRoundNo: 5,
          shoeSnapshot: snap
        },
        onEvent
      )
    )
    expect(resumed.shoe.dealtCount).toBe(snap.dealt)
    record = null
    awaiting = false
    await resumed.startRound(10, {})
    if (awaiting) {
      let guard = 0
      while (!record && guard++ < 10) await resumed.playerAction('stand')
    }
    expect((record! as RoundRecord).round).toBe(6)
  })

  it('手动模式：每次 AI 调用前等待 continueStep（本地机器人不触发闸门）', async () => {
    // 本地机器人不调 API → 不应触发 step；保证手动模式下机器人桌不卡住
    let record: RoundRecord | null = null
    let awaiting = false
    let steps = 0
    const session = new BlackjackSession(
      makeConfig(
        {
          seatOrder: ['opp1', 'player'],
          opponents: [botPersona('opp1', 'opponent')],
          settings: { tableTalk: false, declarations: false, dealerSettle: false, habitMemory: false, playMode: 'manual' }
        },
        (e) => {
          if (e.type === 'awaiting-player') awaiting = true
          if (e.type === 'round-settled') record = e.record
          if (e.type === 'step') steps++
        }
      )
    )
    await session.startRound(10, {})
    if (awaiting) {
      let guard = 0
      while (!record && guard++ < 10) await session.playerAction('stand')
    }
    expect(record).not.toBeNull()
    expect(steps).toBe(0)
  })

  it('美式规则：玩家保险决策经 awaiting-player 暴露', async () => {
    // 用固定牌序保证庄家明牌 A：直接构造美式 session 多跑几局直到出现保险阶段过于随机，
    // 这里改用：检查 legal 列表在保险阶段输出 insure
    const us = { ...DEFAULT_RULES, holeCard: true, peek: true, insurance: true, lateSurrender: true, maxSplitHands: 4 }
    let sawInsuranceLegal = false
    let record: RoundRecord | null = null
    let legalNow: string[] = []
    const session = new BlackjackSession(
      makeConfig(
        { rules: us, seatOrder: ['player'] },
        (e) => {
          if (e.type === 'awaiting-player') legalNow = e.legal
          if (e.type === 'round-settled') record = e.record
        }
      )
    )
    // 多跑几局，遇到保险阶段就验证（随机牌；150 局内不出 A 明牌的概率 < 0.001%）
    for (let i = 0; i < 150 && !sawInsuranceLegal; i++) {
      record = null
      legalNow = []
      await session.startRound(10, {})
      let guard = 0
      while (!record && guard++ < 20) {
        if (legalNow.includes('insure')) {
          sawInsuranceLegal = true
          await session.playerAction('no-insurance')
        } else if (legalNow.length) {
          await session.playerAction('stand')
        } else {
          break // 偷看直接结算等情况
        }
      }
    }
    expect(sawInsuranceLegal).toBe(true)
  })
})
