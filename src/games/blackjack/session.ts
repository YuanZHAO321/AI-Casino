/**
 * 牌桌会话编排器：驱动整局流程、AI 调用预算、记忆、桌聊、兜底。
 * 一个 session = 一场（Match）内的连续多局。
 *
 * 调用预算（对调用次数计费友好）：
 *  - 对手下注：第 1 局每对手 1 次；之后用上局结算输出的 nextBet（0 调用）；
 *    关闭结算宣言则沿用上局注额（0 调用）。
 *  - 对手行动/保险：每个决策点 1 次（行动+台词同一次调用）。
 *  - 结算：开启宣言时每对手 1 次（宣言+下局注额同一次）、每陪玩 1 次、荷官 1 次。
 *  - 玩家私聊与桌聊并入对应角色下一次调用，0 额外调用。
 *  - 备用模型：仅主模型重试后仍失败时追加调用。
 */
import { Shoe, ShoeSnapshot } from '@/core/shoe'
import { cardLabel } from '@/core/cards'
import { chance } from '@/core/rng'
import {
  ApiProfile, Persona, RoundRecord, SeatResult, TableUtterance, PlayerDecision
} from '@/core/types'
import { CharacterMemory } from '@/core/memory'
import {
  callModel, resolveModelRef, pickSlot, ModelSlot, ResolvedModel
} from '@/core/aiClient'
import { extractJsonObject, numField, strField, unwrapSpeech } from '@/core/json'
import {
  BlackjackRules, BlackjackState, SideBetStakes, TableView, BlackjackAction
} from './types'
import {
  startRound as engineStartRound, getLegalActions, applyAction,
  playDealer, dealerMustDraw, dealerDrawOne, settleRound, SeatBetInput
} from './engine'
import { projectView } from './projection'
import { basicStrategy, fallbackAction, resolveProposedAction } from './basicStrategy'
import {
  buildSystemPrompt, betPrompt, decisionPrompt, settlementPrompt, speechPrompt,
  SPEECH_INSTRUCTIONS, DEALER_DRAW_FORMAT, rulesLayer, characterLayer, TurnContext
} from './prompts'

export interface SessionSettings {
  tableTalk: boolean
  declarations: boolean
  dealerSettle: boolean
  habitMemory: boolean
  playMode: 'auto' | 'manual'
}

export interface CharacterState {
  persona: Persona
  memory: CharacterMemory
  lastSeenUtterance: number
  pendingPlayerMsgs: string[]
  pendingCorrection?: string
  /** 对手位筹码 */
  bankroll: number
  nextBet?: number
  nextSideBets?: SideBetStakes
  /** 最近几局战绩（按 historyAwareness 注入） */
  recentResults: string[]
}

export type SessionEvent =
  | { type: 'view'; view: TableView }
  | { type: 'utterance'; utterance: TableUtterance; channel: 'table' | 'companion' }
  | { type: 'awaiting-player'; legal: BlackjackAction[]; handIndex: number }
  | { type: 'corrected'; speakerName: string; proposed: string; action: string }
  | { type: 'error'; message: string }
  | { type: 'thinking'; personaId: string; on: boolean }
  | { type: 'bankrolls'; player: number; opponents: Record<string, number> }
  | { type: 'rebuy'; who: string }
  | { type: 'round-settled'; record: RoundRecord }
  | { type: 'log'; message: string }
  | { type: 'step'; personaId: string; personaName: string; what: string }
  | { type: 'backup-used'; personaName: string; model: string }

export interface SessionConfig {
  rules: BlackjackRules
  playerName: string
  playerBankroll: number
  /** 本场起始资金（陪玩可见的盈亏基准） */
  matchStartBankroll: number
  /** 已进行的局数（继续一场时恢复局号） */
  startRoundNo?: number
  /** box 顺序：'player' 或 对手 personaId */
  seatOrder: string[]
  opponents: Persona[]
  companions: Persona[]
  dealer: Persona | null
  settings: SessionSettings
  getProfile: (id: string) => ApiProfile | undefined
  shoeSnapshot?: ShoeSnapshot | null
  onEvent: (e: SessionEvent) => void
}

const PLAYER_SEAT = 'player'
const REBUY_AMOUNT = 1000

function makeChar(persona: Persona): CharacterState {
  return {
    persona,
    memory: new CharacterMemory(persona.memoryReset),
    lastSeenUtterance: 0,
    pendingPlayerMsgs: [],
    bankroll: REBUY_AMOUNT,
    recentResults: []
  }
}

export class BlackjackSession {
  readonly shoe: Shoe
  rules: BlackjackRules
  settings: SessionSettings
  playerName: string
  playerBankroll: number
  matchStartBankroll: number
  seatOrder: string[]
  opponents: CharacterState[]
  companions: CharacterState[]
  dealer: CharacterState | null
  roundNo: number
  private state: BlackjackState | null = null
  private utterances: TableUtterance[] = []
  private utteranceSeq = 0
  private onEvent: (e: SessionEvent) => void
  private getProfile: (id: string) => ApiProfile | undefined
  private busy = false
  private stepGate: (() => void) | null = null
  private playerDecisions: PlayerDecision[] = []
  private playerBetThisRound = 0
  private playerSideBetsThisRound: SideBetStakes = {}
  private bankrollBefore = 0
  /** 玩家最近几局战绩（陪玩感知用） */
  private playerRecent: string[] = []

  constructor(cfg: SessionConfig) {
    this.rules = cfg.rules
    this.shoe = new Shoe(cfg.rules.decks, cfg.rules.penetration)
    if (cfg.shoeSnapshot) this.shoe.restore(cfg.shoeSnapshot)
    this.settings = cfg.settings
    this.playerName = cfg.playerName
    this.playerBankroll = cfg.playerBankroll
    this.matchStartBankroll = cfg.matchStartBankroll
    this.roundNo = cfg.startRoundNo ?? 0
    this.opponents = cfg.opponents.map(makeChar)
    this.companions = cfg.companions.map(makeChar)
    this.dealer = cfg.dealer ? makeChar(cfg.dealer) : null
    this.getProfile = cfg.getProfile
    // 座位顺序：过滤掉无效项，保证玩家在场
    const validIds = new Set(this.opponents.map((o) => o.persona.id))
    this.seatOrder = cfg.seatOrder.filter((s) => s === PLAYER_SEAT || validIds.has(s))
    for (const o of this.opponents) {
      if (!this.seatOrder.includes(o.persona.id)) this.seatOrder.push(o.persona.id)
    }
    if (!this.seatOrder.includes(PLAYER_SEAT)) this.seatOrder.push(PLAYER_SEAT)
    this.onEvent = cfg.onEvent
  }

  get currentView(): TableView | null {
    return this.state ? projectView(this.state, PLAYER_SEAT) : null
  }

  get inRound(): boolean {
    return this.state !== null && this.state.phase !== 'settled'
  }

  getShoeSnapshot(): ShoeSnapshot {
    return this.shoe.serialize()
  }

  /** 局间手动换新牌靴 */
  newShoe(): boolean {
    if (this.inRound) return false
    this.shoe.reshuffle()
    this.onEvent({ type: 'log', message: '已更换新牌靴。' })
    return true
  }

  /* ---------------- 模型解析与调用 ---------------- */

  private resolveSlot(persona: Persona, slot: ModelSlot): ResolvedModel | null {
    return resolveModelRef(pickSlot(persona, slot), this.getProfile)
  }

  isLocalChar(persona: Persona): boolean {
    return this.resolveSlot(persona, 'fast') === null
  }

  /** 带备用模型的调用：主模型（内部重试1次）失败 → 备用模型再试 */
  private async callSlot(
    ch: CharacterState,
    slot: ModelSlot,
    system: string,
    userMsg: string,
    maxTokens = 400
  ): Promise<{ ok: boolean; content: string; modelLabel?: string; error?: string }> {
    const primary = this.resolveSlot(ch.persona, slot)
    if (!primary) return { ok: false, content: '', error: 'local' }
    const history = ch.memory.contextMessages()
    let res = await callModel(primary, system, history, userMsg, maxTokens)
    if (res.ok) return { ...res, modelLabel: primary.model }
    const backup = resolveModelRef(ch.persona.backup, this.getProfile)
    if (backup && (backup.profile.id !== primary.profile.id || backup.model !== primary.model)) {
      this.onEvent({ type: 'backup-used', personaName: ch.persona.name, model: backup.model })
      res = await callModel(backup, system, history, userMsg, maxTokens)
      if (res.ok) return { ...res, modelLabel: backup.model }
    }
    return { ok: false, content: '', error: res.error }
  }

  /** 手动节奏闸门：manual 模式下等待玩家点「让 TA 思考」 */
  private async gate(persona: Persona, what: string): Promise<void> {
    if (this.settings.playMode !== 'manual') return
    await new Promise<void>((resolve) => {
      this.stepGate = resolve
      this.onEvent({ type: 'step', personaId: persona.id, personaName: persona.name, what })
    })
    this.stepGate = null
  }

  /** UI：手动模式下推进一步 */
  continueStep(): void {
    this.stepGate?.()
  }

  get awaitingStep(): boolean {
    return this.stepGate !== null
  }

  /* ---------------- 回合主流程 ---------------- */

  async startRound(playerBet: number, playerSideBets: SideBetStakes): Promise<void> {
    if (this.busy || this.inRound) return
    this.busy = true
    try {
      this.roundNo++
      this.playerDecisions = []
      this.playerBetThisRound = playerBet
      this.playerSideBetsThisRound = playerSideBets
      this.bankrollBefore = this.playerBankroll

      // 按座位顺序收注
      const betBySeat = new Map<string, SeatBetInput>()
      for (const opp of this.opponents) {
        const { bet, sideBets } = await this.resolveOpponentBet(opp)
        betBySeat.set(opp.persona.id, {
          seatId: opp.persona.id,
          isHuman: false,
          personaId: opp.persona.id,
          name: opp.persona.name,
          bet,
          sideBets
        })
      }
      betBySeat.set(PLAYER_SEAT, {
        seatId: PLAYER_SEAT,
        isHuman: true,
        name: this.playerName,
        bet: playerBet,
        sideBets: playerSideBets
      })
      const bets = this.seatOrder
        .map((id) => betBySeat.get(id))
        .filter((b): b is SeatBetInput => !!b)

      this.state = engineStartRound(this.shoe, this.rules, this.roundNo, bets)
      this.emitView()
      if (this.state.shuffledThisRound) {
        this.onEvent({ type: 'log', message: '切牌已到，荷官重新洗牌。' })
      }

      await this.maybeDealerComment()
      for (const comp of this.companions) {
        const p = comp.persona.companion?.autoCommentChance ?? 0
        if (p > 0 && chance(p) && !this.isLocalChar(comp.persona)) {
          await this.gate(comp.persona, 'comment')
          await this.companionSpeech(comp, 'companionAuto')
        }
      }

      this.busy = false
      if (this.state.phase === 'settled') {
        // 偷看命中庄家 BJ：跳过行动直接结算
        await this.settleAndRecord()
      } else {
        await this.runTurns()
      }
    } catch (err) {
      this.busy = false
      this.onEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  /** 推进 AI 行动（含保险阶段），直到轮到玩家或庄家阶段 */
  private async runTurns(): Promise<void> {
    if (!this.state || this.busy) return
    this.busy = true
    try {
      while (this.state.phase === 'acting' || this.state.phase === 'insurance') {
        const seat = this.state.seats[this.state.activeSeatIndex]
        if (seat.isHuman) {
          this.busy = false
          this.onEvent({
            type: 'awaiting-player',
            legal: getLegalActions(this.state),
            handIndex: this.state.activeHandIndex
          })
          return
        }
        await this.aiDecision(seat.seatId)
        this.emitView()
      }
      this.busy = false
      if (this.state.phase === 'dealer') {
        await this.dealerPhase()
      } else if (this.state.phase === 'settled') {
        await this.settleAndRecord()
      }
    } catch (err) {
      this.busy = false
      this.onEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  /** 玩家行动（UI 调用，含保险决策） */
  async playerAction(action: BlackjackAction): Promise<void> {
    if (!this.state || this.busy) return
    if (this.state.phase !== 'acting' && this.state.phase !== 'insurance') return
    const seat = this.state.seats[this.state.activeSeatIndex]
    if (!seat.isHuman) return
    const legal = getLegalActions(this.state)
    if (!legal.includes(action)) return

    if (this.settings.habitMemory && this.state.phase === 'acting') {
      const hand = seat.hands[this.state.activeHandIndex]
      this.playerDecisions.push({
        situation: `${hand.cards.map((c) => c.rank).join('+')} vs ${this.state.dealerCards[0].rank}`,
        action,
        basicStrategy: basicStrategy(hand.cards, this.state.dealerCards[0], legal, {
          enhc: !this.rules.holeCard
        })
      })
    }
    applyAction(this.state, action)
    this.emitView()
    const phaseNow = this.state.phase as BlackjackState['phase']
    if (phaseNow === 'settled') {
      // 保险后偷看命中 BJ
      await this.settleAndRecord()
    } else {
      await this.runTurns()
    }
  }

  /* ---------------- AI 对手 ---------------- */

  private async resolveOpponentBet(opp: CharacterState): Promise<{ bet: number; sideBets: SideBetStakes }> {
    if (opp.bankroll < this.rules.minBet) {
      opp.bankroll = REBUY_AMOUNT
      this.onEvent({ type: 'rebuy', who: opp.persona.name })
    }
    if (this.isLocalChar(opp.persona)) {
      return { bet: this.rules.minBet, sideBets: {} }
    }
    if (opp.nextBet !== undefined) {
      return {
        bet: this.clampBet(opp.nextBet, opp.bankroll),
        sideBets: this.clampSideBets(opp.nextSideBets, opp.nextBet, opp.bankroll)
      }
    }
    // 第一局：单独下注调用
    await this.gate(opp.persona, 'bet')
    this.onEvent({ type: 'thinking', personaId: opp.persona.id, on: true })
    const viewStub = { rules: this.ruleView() }
    const system = buildSystemPrompt(opp.persona, viewStub, 'bet')
    const ctx = this.takeContext(opp, true)
    const user = betPrompt(opp.bankroll, this.ruleView(), ctx)
    const res = await this.callSlot(opp, 'fast', system, user)
    this.onEvent({ type: 'thinking', personaId: opp.persona.id, on: false })

    let bet = this.rules.minBet
    let sideBets: SideBetStakes = {}
    if (res.ok) {
      const obj = extractJsonObject(res.content)
      if (obj) {
        bet = this.clampBet(numField(obj, 'bet') ?? this.rules.minBet, opp.bankroll)
        sideBets = this.clampSideBets(this.parseSideBets(obj['sideBets']), bet, opp.bankroll)
        const say = strField(obj, 'say')
        if (say && opp.persona.speechEnabled) this.utter(opp.persona, say, 'table')
      }
      opp.memory.record(user, res.content)
    } else if (res.error !== 'local') {
      this.onEvent({ type: 'error', message: `${opp.persona.name} 下注调用失败（${res.error}），按最低注` })
    }
    return { bet, sideBets }
  }

  private async aiDecision(seatId: string): Promise<void> {
    const state = this.state!
    const opp = this.opponents.find((o) => o.persona.id === seatId)!
    const legal = getLegalActions(state)

    if (this.isLocalChar(opp.persona)) {
      applyAction(state, fallbackAction(state, legal))
      return
    }

    await this.gate(opp.persona, state.phase === 'insurance' ? 'insurance' : 'action')
    this.onEvent({ type: 'thinking', personaId: opp.persona.id, on: true })
    const view = projectView(state, seatId)
    const system = buildSystemPrompt(opp.persona, view, 'decision')
    const ctx = this.takeContext(opp)
    const seat = state.seats[state.activeSeatIndex]
    const handNote =
      seat.hands.length > 1 ? `（你的第 ${state.activeHandIndex + 1}/${seat.hands.length} 手）` : undefined
    const user = decisionPrompt(view, legal, opp.persona.cardCounting, ctx, handNote)
    const res = await this.callSlot(opp, 'fast', system, user)
    this.onEvent({ type: 'thinking', personaId: opp.persona.id, on: false })

    let proposed: string | undefined
    let say: string | undefined
    if (res.ok) {
      const obj = extractJsonObject(res.content)
      if (obj) {
        proposed = strField(obj, 'action')
        say = strField(obj, 'say')
      }
      opp.memory.record(user, res.content)
    } else {
      this.onEvent({ type: 'error', message: `${opp.persona.name} 行动调用失败（${res.error}），按基本策略兜底` })
    }
    const { action, corrected } = resolveProposedAction(state, legal, proposed)
    if (corrected) {
      opp.pendingCorrection = `你上一次提出的操作「${proposed ?? '无法解析'}」不合法或无法识别，已按基本策略替你执行了 ${action}。`
      this.onEvent({ type: 'corrected', speakerName: opp.persona.name, proposed: proposed ?? '?', action })
    }
    if (say && opp.persona.speechEnabled) this.utter(opp.persona, say, 'table')
    applyAction(state, action)
  }

  /* ---------------- 庄家阶段 ---------------- */

  private async dealerPhase(): Promise<void> {
    const state = this.state!
    const d = this.dealer
    const interactive =
      d && !this.isLocalChar(d.persona) && (d.persona.dealerUseModel || d.persona.dealerDrawSpeech)

    if (!interactive) {
      playDealer(state)
      this.emitView()
      await this.settleAndRecord()
      return
    }

    // 逐张抽牌（模型决策 / 抽牌播报）
    if (state.rules.holeCard) {
      state.holeRevealed = true
      this.emitView()
    }
    const anyLive = state.seats.some((s) => s.hands.some((h) => !h.bust && !h.surrendered))
    if (anyLive) {
      let guard = 0
      while (dealerMustDraw(state) && guard++ < 12) {
        if (d!.persona.dealerUseModel) {
          await this.gate(d!.persona, 'dealer-draw')
          this.onEvent({ type: 'thinking', personaId: d!.persona.id, on: true })
          const view = projectView(state, 'dealer')
          const system = [rulesLayer(view), characterLayer(d!.persona), DEALER_DRAW_FORMAT].join('\n\n')
          const ctx = this.takeContext(d!)
          const user = speechPrompt(view, false, ctx, '请按规则决定是否补牌并播报。')
          const res = await this.callSlot(d!, 'fast', system, user)
          this.onEvent({ type: 'thinking', personaId: d!.persona.id, on: false })
          if (res.ok) {
            d!.memory.record(user, res.content)
            const obj = extractJsonObject(res.content)
            const say = obj ? strField(obj, 'say') : undefined
            if (say && d!.persona.speechEnabled) this.utter(d!.persona, say, 'table')
            // 规则强制：必须补牌时模型说 stand 也照补（荷官无裁量权）
          }
          dealerDrawOne(state)
          this.emitView()
        } else {
          dealerDrawOne(state)
          this.emitView()
          if (d!.persona.dealerDrawSpeech) {
            await this.dealerSpeech('dealerDraw')
          }
        }
      }
    }
    settleRound(state)
    this.emitView()
    await this.settleAndRecord()
  }

  /* ---------------- 结算 ---------------- */

  private async settleAndRecord(): Promise<void> {
    const state = this.state!
    this.busy = true
    try {
      this.emitView()

      const playerSeat = state.seats.find((s) => s.isHuman)!
      this.playerBankroll += playerSeat.net
      const oppBankrolls: Record<string, number> = {}
      for (const seat of state.seats) {
        if (seat.isHuman) continue
        const opp = this.opponents.find((o) => o.persona.id === seat.seatId)!
        opp.bankroll += seat.net
        oppBankrolls[seat.seatId] = opp.bankroll
        opp.recentResults.push(`第${this.roundNo}局 ${seat.net >= 0 ? '+' : ''}£${seat.net}`)
        if (opp.recentResults.length > 15) opp.recentResults.shift()
      }
      this.playerRecent.push(
        `第${this.roundNo}局 注£${this.playerBetThisRound} ${playerSeat.net >= 0 ? '+' : ''}£${playerSeat.net}`
      )
      if (this.playerRecent.length > 15) this.playerRecent.shift()
      this.onEvent({ type: 'bankrolls', player: this.playerBankroll, opponents: oppBankrolls })

      const declarations: Record<string, string> = {}
      const modelUsed: Record<string, string> = {}

      for (const seat of state.seats) {
        if (seat.isHuman) continue
        const opp = this.opponents.find((o) => o.persona.id === seat.seatId)!
        const rm = this.resolveSlot(opp.persona, 'fast')
        if (rm) modelUsed[seat.seatId] = rm.model
        if (this.isLocalChar(opp.persona)) {
          opp.nextBet = this.rules.minBet
          continue
        }
        if (!this.settings.declarations) {
          opp.nextBet = seat.baseBet
          opp.nextSideBets = seat.sideBets
          continue
        }
        await this.gate(opp.persona, 'settlement')
        await this.opponentSettlement(opp, seat.seatId, declarations)
      }

      if (this.settings.declarations) {
        for (const comp of this.companions) {
          if (this.isLocalChar(comp.persona) || !comp.persona.speechEnabled) continue
          await this.gate(comp.persona, 'settlement')
          const text = await this.companionSpeech(comp, 'companionSettle')
          if (text) declarations[comp.persona.id] = text
        }
      }

      if (this.settings.dealerSettle && this.dealer && !this.isLocalChar(this.dealer.persona)) {
        await this.gate(this.dealer.persona, 'settlement')
        const text = await this.dealerSpeech('dealerSettle')
        if (text) declarations['dealer'] = text
      }

      for (const ch of this.allChars()) ch.memory.endRound()

      const record: RoundRecord = {
        id: globalThis.crypto.randomUUID(),
        game: 'blackjack',
        round: this.roundNo,
        matchRound: this.roundNo,
        timestamp: Date.now(),
        playerBet: this.playerBetThisRound,
        playerSideBets: this.playerSideBetsThisRound as Record<string, number>,
        playerNet: playerSeat.net,
        bankrollBefore: this.bankrollBefore,
        bankrollAfter: this.playerBankroll,
        seats: state.seats.map((s): SeatResult => ({
          seatId: s.seatId,
          personaId: s.isHuman ? undefined : s.seatId,
          personaName: s.name,
          modelLabel: s.isHuman ? undefined : modelUsed[s.seatId] ?? 'local',
          // 实际总押注（含加倍/分牌/边注/保险），与桌面筹码一致
          bet:
            s.hands.reduce((n, h) => n + h.bet, 0) +
            Object.values(s.sideBets).reduce((n, v) => n + (v ?? 0), 0) +
            s.insuranceBet,
          net: s.net,
          outcome: s.outcomes.join('/'),
          hands: s.hands.map((h) => h.cards.map(cardLabel)),
          decisions: s.isHuman && this.settings.habitMemory ? this.playerDecisions : undefined
        })),
        declarations,
        detail: {
          dealerCards: state.dealerCards.map(cardLabel),
          shuffled: state.shuffledThisRound,
          playerSideBetHits: playerSeat.sideBetResults.map((r) => ({
            kind: r.kind,
            hit: r.hit,
            odds: r.odds
          }))
        }
      }
      this.busy = false
      this.onEvent({ type: 'round-settled', record })
    } catch (err) {
      this.busy = false
      this.onEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async opponentSettlement(
    opp: CharacterState,
    seatId: string,
    declarations: Record<string, string>
  ): Promise<void> {
    const state = this.state!
    this.onEvent({ type: 'thinking', personaId: opp.persona.id, on: true })
    const view = projectView(state, seatId)
    const system = buildSystemPrompt(opp.persona, view, 'settlement')
    const ctx = this.takeContext(opp, true)
    const user = settlementPrompt(view, opp.bankroll, opp.persona.cardCounting, ctx)
    const res = await this.callSlot(opp, 'fast', system, user)
    this.onEvent({ type: 'thinking', personaId: opp.persona.id, on: false })

    if (!res.ok) {
      this.onEvent({ type: 'error', message: `${opp.persona.name} 结算调用失败（${res.error}）` })
      opp.nextBet = this.clampBet(opp.nextBet ?? this.rules.minBet, opp.bankroll)
      return
    }
    opp.memory.record(user, res.content)
    const obj = extractJsonObject(res.content)
    if (obj) {
      const say = strField(obj, 'say')
      if (say) {
        if (opp.persona.speechEnabled) this.utter(opp.persona, say, 'table')
        declarations[opp.persona.id] = say
      }
      opp.nextBet = this.clampBet(numField(obj, 'nextBet') ?? this.rules.minBet, opp.bankroll)
      opp.nextSideBets = this.parseSideBets(obj['nextSideBets'])
    } else {
      opp.nextBet = this.rules.minBet
    }
  }

  /* ---------------- 陪玩 / 荷官 ---------------- */

  /** 陪玩说话；speech 类输出统一过 unwrapSpeech 防 JSON 泄漏 */
  async companionSpeech(
    comp: CharacterState,
    kind: keyof typeof SPEECH_INSTRUCTIONS,
    extraUserMsg?: string,
    slot: ModelSlot = 'fast'
  ): Promise<string | null> {
    if (this.isLocalChar(comp.persona)) return null
    this.onEvent({ type: 'thinking', personaId: comp.persona.id, on: true })
    const view = this.state ? projectView(this.state, 'companion') : null
    const system = buildSystemPrompt(comp.persona, { rules: this.ruleView() }, 'speech')
    const ctx = this.takeContext(comp)
    ctx.playerFunds = this.playerFundsLine()
    if (extraUserMsg) ctx.playerMessages.push(extraUserMsg)
    const user = speechPrompt(view, comp.persona.cardCounting, ctx, SPEECH_INSTRUCTIONS[kind])
    const res = await this.callSlot(comp, slot, system, user)
    this.onEvent({ type: 'thinking', personaId: comp.persona.id, on: false })
    if (!res.ok) {
      if (res.error !== 'local') {
        this.onEvent({ type: 'error', message: `${comp.persona.name} 调用失败（${res.error}）` })
      }
      return null
    }
    comp.memory.record(user, res.content)
    const text = unwrapSpeech(res.content)
    this.utter(comp.persona, text, 'companion')
    return text
  }

  /** 陪玩按钮：吐槽（快速模型）/ 建议（推理模型） */
  async companionComment(personaId: string, kind: 'banter' | 'advice'): Promise<void> {
    const comp = this.companions.find((c) => c.persona.id === personaId)
    if (!comp) return
    await this.companionSpeech(
      comp,
      kind === 'advice' ? 'companionAdvice' : 'companionBanter',
      undefined,
      kind === 'advice' ? 'smart' : 'fast'
    )
  }

  /** 与陪玩自由聊天（推理模型，即时一次调用） */
  async companionChat(personaId: string, text: string): Promise<void> {
    const comp = this.companions.find((c) => c.persona.id === personaId)
    if (!comp) return
    this.utterPlayer(text, 'companion')
    await this.companionSpeech(comp, 'companionBanter', text, 'smart')
  }

  /** 给对手留言（并入其下一次调用，0 额外调用） */
  queueMessageToOpponent(personaId: string, text: string): void {
    const opp = this.opponents.find((o) => o.persona.id === personaId)
    if (!opp) return
    this.utterPlayer(`（对${opp.persona.name}）${text}`, 'table')
    opp.pendingPlayerMsgs.push(text)
  }

  private async dealerSpeech(kind: 'dealerComment' | 'dealerSettle' | 'dealerDraw'): Promise<string | null> {
    const dealer = this.dealer
    if (!dealer || this.isLocalChar(dealer.persona)) return null
    this.onEvent({ type: 'thinking', personaId: dealer.persona.id, on: true })
    const view = this.state ? projectView(this.state, 'dealer') : null
    const system = buildSystemPrompt(dealer.persona, { rules: this.ruleView() }, 'speech')
    const ctx = this.takeContext(dealer)
    const user = speechPrompt(view, false, ctx, SPEECH_INSTRUCTIONS[kind])
    const res = await this.callSlot(dealer, 'fast', system, user)
    this.onEvent({ type: 'thinking', personaId: dealer.persona.id, on: false })
    if (!res.ok) return null
    dealer.memory.record(user, res.content)
    const text = unwrapSpeech(res.content)
    this.utter(dealer.persona, text, 'table')
    return text
  }

  private async maybeDealerComment(): Promise<void> {
    const d = this.dealer
    if (!d || this.isLocalChar(d.persona)) return
    const mode = d.persona.dealerCommentMode ?? 'off'
    if (mode === 'off') return
    if (mode === 'chance' && !chance(d.persona.dealerCommentChance ?? 0.3)) return
    await this.gate(d.persona, 'comment')
    await this.dealerSpeech('dealerComment')
  }

  /* ---------------- 记忆工具 ---------------- */

  async compressMemory(personaId: string): Promise<boolean> {
    const ch = this.findChar(personaId)
    if (!ch || ch.memory.turns.length === 0) return false
    const rm = this.resolveSlot(ch.persona, 'smart') ?? this.resolveSlot(ch.persona, 'fast')
    if (!rm) return false
    const res = await callModel(
      rm,
      '你是一个记忆压缩助手。把给出的对话压缩成一段第一人称的简短记忆摘要（200字内），保留：牌局输赢走势、和玩家的关系/约定、自己说过的重要的话。直接输出摘要文本。',
      [],
      ch.memory.turns.map((t) => `${t.role}: ${t.content}`).join('\n'),
      400
    )
    if (!res.ok) {
      this.onEvent({ type: 'error', message: `压缩记忆失败：${res.error}` })
      return false
    }
    ch.memory.applyCompression(unwrapSpeech(res.content))
    return true
  }

  newMemorySession(personaId: string): void {
    this.findChar(personaId)?.memory.resetAll()
  }

  /** 新开一场时调用：per-match 及以下档位清空 */
  endMatchMemories(): void {
    for (const ch of this.allChars()) ch.memory.endMatch()
  }

  getMemorySnapshots(): Record<string, { note: string | null; turns: { role: string; content: string }[] }> {
    const out: Record<string, { note: string | null; turns: { role: string; content: string }[] }> = {}
    for (const ch of this.allChars()) {
      if (ch.memory.persisted) out[ch.persona.id] = ch.memory.serialize()
    }
    return out
  }

  restoreMemories(data: Record<string, { note?: string | null; turns?: { role: string; content: string }[] }> | null): void {
    if (!data) return
    for (const ch of this.allChars()) {
      const m = data[ch.persona.id]
      if (m) ch.memory.restore(m as { note?: string | null; turns?: [] })
    }
  }

  /* ---------------- 内部工具 ---------------- */

  private allChars(): CharacterState[] {
    return [...this.opponents, ...this.companions, ...(this.dealer ? [this.dealer] : [])]
  }

  private findChar(personaId: string): CharacterState | undefined {
    return this.allChars().find((c) => c.persona.id === personaId)
  }

  private ruleView(): TableView['rules'] {
    const {
      decks, hitSoft17, splitAcesOneCard, doubleAfterSplit, holeCard, peek,
      insurance, lateSurrender, doubleRestriction, maxSplitHands, minBet, maxBet
    } = this.rules
    return {
      decks, hitSoft17, splitAcesOneCard, doubleAfterSplit, holeCard, peek,
      insurance, lateSurrender, doubleRestriction, maxSplitHands, minBet, maxBet
    }
  }

  /** 陪玩/荷官可见的玩家资金（玩家视角全可见 #10） */
  private playerFundsLine(): string {
    const net = this.playerBankroll - this.matchStartBankroll
    const bet = this.inRound ? `，本局押注 £${this.playerBetThisRound}` : ''
    return `玩家筹码 £${this.playerBankroll}（本场起始 £${this.matchStartBankroll}，本场盈亏 ${net >= 0 ? '+' : ''}£${net}${bet}），已进行 ${this.roundNo} 局`
  }

  /** 取出并清空该角色待消费的上下文（私聊、未见桌聊、修正提示、战绩） */
  private takeContext(ch: CharacterState, withHistory = false): TurnContext {
    const tableTalk: { speaker: string; text: string }[] = []
    if (this.settings.tableTalk) {
      for (const u of this.utterances) {
        if (u.seq > ch.lastSeenUtterance && u.speakerId !== ch.persona.id) {
          tableTalk.push({ speaker: u.speakerName, text: u.text })
        }
      }
    }
    ch.lastSeenUtterance = this.utteranceSeq

    let historyBrief: string | undefined
    const awareness = ch.persona.historyAwareness
    if (awareness !== 'none' && (withHistory || awareness === 'full')) {
      const own = ch.persona.role === 'opponent' ? ch.recentResults : this.playerRecent
      const n = awareness === 'full' ? 15 : 5
      if (own.length) {
        historyBrief =
          ch.persona.role === 'opponent'
            ? `你最近几局：${own.slice(-n).join('，')}`
            : `玩家最近几局：${own.slice(-n).join('，')}`
      }
    }

    const ctx: TurnContext = {
      playerMessages: ch.pendingPlayerMsgs.splice(0),
      tableTalk: tableTalk.slice(-8),
      correction: ch.pendingCorrection,
      historyBrief
    }
    ch.pendingCorrection = undefined
    return ctx
  }

  private utter(persona: Persona, text: string, channel: 'table' | 'companion'): void {
    const u: TableUtterance = {
      seq: ++this.utteranceSeq,
      speakerId: persona.id,
      speakerName: persona.name,
      text,
      round: this.roundNo
    }
    this.utterances.push(u)
    if (this.utterances.length > 100) this.utterances.shift()
    this.onEvent({ type: 'utterance', utterance: u, channel })
  }

  private utterPlayer(text: string, channel: 'table' | 'companion'): void {
    const u: TableUtterance = {
      seq: ++this.utteranceSeq,
      speakerId: 'player',
      speakerName: this.playerName,
      text,
      round: this.roundNo
    }
    this.utterances.push(u)
    this.onEvent({ type: 'utterance', utterance: u, channel })
  }

  private clampBet(bet: number, bankroll: number): number {
    const max = Math.min(this.rules.maxBet, bankroll)
    return Math.max(this.rules.minBet, Math.min(max, Math.round(bet)))
  }

  private parseSideBets(raw: unknown): SideBetStakes {
    if (!raw || typeof raw !== 'object') return {}
    const obj = raw as Record<string, unknown>
    const out: SideBetStakes = {}
    const pairs = numField(obj, 'pairs')
    const tpt = numField(obj, 'twentyOnePlusThree') ?? numField(obj, '21+3')
    const top3 = numField(obj, 'top3')
    if (pairs && pairs > 0) out.pairs = Math.round(pairs)
    if (tpt && tpt > 0) out.twentyOnePlusThree = Math.round(tpt)
    if (top3 && top3 > 0) out.top3 = Math.round(top3)
    return out
  }

  private clampSideBets(sb: SideBetStakes | undefined, mainBet: number, bankroll: number): SideBetStakes {
    if (!sb) return {}
    let budget = Math.max(0, bankroll - mainBet)
    const out: SideBetStakes = {}
    for (const key of ['pairs', 'twentyOnePlusThree', 'top3'] as const) {
      const v = sb[key]
      if (!v || v <= 0) continue
      const stake = Math.min(Math.round(v), this.rules.maxBet, budget)
      if (stake > 0) {
        out[key] = stake
        budget -= stake
      }
    }
    return out
  }

  private emitView(): void {
    if (this.state) this.onEvent({ type: 'view', view: projectView(this.state, PLAYER_SEAT) })
  }
}

/* ---------------- 报告与分析（store 调用） ---------------- */

/** AI 战绩总报告（单次调用，输出过 unwrapSpeech 防 JSON 泄漏） */
export async function generateReport(
  rm: ResolvedModel,
  records: RoundRecord[],
  statsBrief: string
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const recent = records.filter((r) => r.round !== 0).slice(-60)
  const lines = recent.map((r) => {
    const seats = r.seats.map((s) => `${s.personaName}${s.net >= 0 ? '+' : ''}${s.net}`).join(' ')
    return `#${r.matchRound ?? r.round} 玩家注£${r.playerBet} ${r.playerNet >= 0 ? '+' : ''}£${r.playerNet} | ${seats}`
  })
  const res = await callModel(
    rm,
    '你是一位赌场数据分析师。根据给出的 21 点对局记录和统计，写一份简短的分析报告：玩家整体胜率与盈亏走势、下注习惯点评、各 AI 角色表现对比、赌场盈亏、有意思的事件。直接输出纯文本报告（可用小标题分段），严禁输出 JSON 或代码块，总长 500 字以内。',
    [],
    `${statsBrief}\n\n最近对局：\n${lines.join('\n')}`,
    1200
  )
  return res.ok ? { ok: true, text: unwrapSpeech(res.content) } : { ok: false, error: res.error }
}

/** 单角色风格分析（首次调用），之后可通过 analystChat 持续追问 */
export function buildAnalystSystem(targetName: string): string {
  return `你是一位常驻赌场的 21 点牌局分析师，正在和玩家讨论「${targetName}」的表现。基于给出的对局记录回答：出牌风格与流派（激进/保守/跟基本策略的偏差）、下注习惯、盈亏走势、值得注意的倾向。说人话，直接输出纯文本，严禁 JSON 或代码块，每次回答 300 字以内。`
}
