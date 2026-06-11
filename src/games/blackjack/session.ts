/**
 * 牌桌会话编排器：驱动整局流程、AI 调用预算、记忆、桌聊、兜底。
 *
 * 调用预算（设计目标：对调用次数计费友好）：
 *  - 对手下注：第 1 局每对手 1 次；之后用上局结算输出的 nextBet（0 调用）；
 *    若关闭结算宣言则直接沿用上局注额（0 调用）。
 *  - 对手行动：每个决策点 1 次（行动+台词同一次调用）。
 *  - 结算：开启宣言时每对手 1 次（宣言+下局注额同一次调用）、每陪玩 1 次、荷官 1 次。
 *  - 玩家私聊与桌聊并入对应角色下一次调用，0 额外调用。
 */
import { Shoe } from '@/core/shoe'
import { chance } from '@/core/rng'
import {
  ApiProfile, Persona, RoundRecord, SeatResult, TableUtterance, PlayerDecision
} from '@/core/types'
import { CharacterMemory } from '@/core/memory'
import { callCharacter, isLocalBot } from '@/core/aiClient'
import { extractJsonObject, numField, strField } from '@/core/json'
import {
  BlackjackRules, BlackjackState, SideBetStakes, TableView, BlackjackAction
} from './types'
import {
  startRound as engineStartRound, getLegalActions, applyAction, playDealer, SeatBetInput
} from './engine'
import { projectView } from './projection'
import { basicStrategy, fallbackAction, resolveProposedAction } from './basicStrategy'
import {
  buildSystemPrompt, betPrompt, decisionPrompt, settlementPrompt, speechPrompt,
  SPEECH_INSTRUCTIONS, TurnContext
} from './prompts'

export interface SessionSettings {
  tableTalk: boolean
  declarations: boolean
  dealerSettle: boolean
  habitMemory: boolean
}

export interface CharacterState {
  persona: Persona
  profile: ApiProfile
  memory: CharacterMemory
  lastSeenUtterance: number
  pendingPlayerMsgs: string[]
  pendingCorrection?: string
  /** 对手位筹码 */
  bankroll: number
  nextBet?: number
  nextSideBets?: SideBetStakes
  /** 最近几局战绩（注入开局/结算 ctx） */
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

export interface SessionConfig {
  rules: BlackjackRules
  playerName: string
  playerBankroll: number
  /** 玩家在 box 顺序中的位置（0 = 第一个行动） */
  playerSeatIndex: number
  opponents: { persona: Persona; profile: ApiProfile }[]
  companions: { persona: Persona; profile: ApiProfile }[]
  dealer: { persona: Persona; profile: ApiProfile } | null
  settings: SessionSettings
  onEvent: (e: SessionEvent) => void
}

const PLAYER_SEAT = 'player'
const REBUY_AMOUNT = 1000

function makeChar(persona: Persona, profile: ApiProfile): CharacterState {
  return {
    persona,
    profile,
    memory: new CharacterMemory(persona.memoryMode),
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
  playerSeatIndex: number
  opponents: CharacterState[]
  companions: CharacterState[]
  dealer: CharacterState | null
  roundNo = 0
  private state: BlackjackState | null = null
  private utterances: TableUtterance[] = []
  private utteranceSeq = 0
  private onEvent: (e: SessionEvent) => void
  private busy = false
  /** 玩家本局习惯记录 */
  private playerDecisions: PlayerDecision[] = []
  private playerBetThisRound = 0
  private playerSideBetsThisRound: SideBetStakes = {}
  private bankrollBefore = 0

  constructor(cfg: SessionConfig) {
    this.rules = cfg.rules
    this.shoe = new Shoe(cfg.rules.decks, cfg.rules.penetration)
    this.settings = cfg.settings
    this.playerName = cfg.playerName
    this.playerBankroll = cfg.playerBankroll
    this.playerSeatIndex = Math.min(cfg.playerSeatIndex, cfg.opponents.length)
    this.opponents = cfg.opponents.map((o) => makeChar(o.persona, o.profile))
    this.companions = cfg.companions.map((c) => makeChar(c.persona, c.profile))
    this.dealer = cfg.dealer ? makeChar(cfg.dealer.persona, cfg.dealer.profile) : null
    this.onEvent = cfg.onEvent
  }

  get currentView(): TableView | null {
    return this.state ? projectView(this.state, PLAYER_SEAT) : null
  }

  get inRound(): boolean {
    return this.state !== null && this.state.phase !== 'settled'
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

      const bets: SeatBetInput[] = []
      for (const opp of this.opponents) {
        const { bet, sideBets } = await this.resolveOpponentBet(opp)
        bets.push({
          seatId: opp.persona.id,
          isHuman: false,
          personaId: opp.persona.id,
          name: opp.persona.name,
          bet,
          sideBets
        })
      }
      bets.splice(this.playerSeatIndex, 0, {
        seatId: PLAYER_SEAT,
        isHuman: true,
        name: this.playerName,
        bet: playerBet,
        sideBets: playerSideBets
      })

      this.state = engineStartRound(this.shoe, this.rules, this.roundNo, bets)
      this.emitView()
      if (this.state.shuffledThisRound) {
        this.onEvent({ type: 'log', message: '切牌已到，荷官重新洗牌。' })
      }

      // 荷官开局评论
      await this.maybeDealerComment()
      // 陪玩概率吐槽（看到开局牌面）
      for (const comp of this.companions) {
        const p = comp.persona.companion?.autoCommentChance ?? 0
        if (p > 0 && chance(p)) await this.companionSpeech(comp, 'companionAuto')
      }

      this.busy = false
      await this.runTurns()
    } catch (err) {
      this.busy = false
      this.onEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  /** 推进 AI 行动，直到轮到玩家或进入庄家阶段 */
  private async runTurns(): Promise<void> {
    if (!this.state || this.busy) return
    this.busy = true
    try {
      while (this.state.phase === 'acting') {
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
      if (this.state.phase === 'dealer') await this.finishRound()
    } catch (err) {
      this.busy = false
      this.onEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  /** 玩家行动（UI 调用） */
  async playerAction(action: BlackjackAction): Promise<void> {
    if (!this.state || this.state.phase !== 'acting' || this.busy) return
    const seat = this.state.seats[this.state.activeSeatIndex]
    if (!seat.isHuman) return
    const legal = getLegalActions(this.state)
    if (!legal.includes(action)) return

    if (this.settings.habitMemory) {
      const hand = seat.hands[this.state.activeHandIndex]
      const v = hand.cards.length
        ? `${hand.cards.map((c) => c.rank).join('+')} vs ${this.state.dealerCards[0].rank}`
        : ''
      this.playerDecisions.push({
        situation: v,
        action,
        basicStrategy: basicStrategy(hand.cards, this.state.dealerCards[0], legal)
      })
    }
    applyAction(this.state, action)
    this.emitView()
    await this.runTurns()
  }

  /* ---------------- AI 对手 ---------------- */

  private async resolveOpponentBet(opp: CharacterState): Promise<{ bet: number; sideBets: SideBetStakes }> {
    // 破产自动重新买入
    if (opp.bankroll < this.rules.minBet) {
      opp.bankroll = REBUY_AMOUNT
      this.onEvent({ type: 'rebuy', who: opp.persona.name })
    }
    // 本地机器人 / 已有上局输出 / 宣言关闭沿用
    if (isLocalBot(opp.profile)) {
      return { bet: this.rules.minBet, sideBets: {} }
    }
    if (opp.nextBet !== undefined) {
      return {
        bet: this.clampBet(opp.nextBet, opp.bankroll),
        sideBets: this.clampSideBets(opp.nextSideBets, opp.nextBet, opp.bankroll)
      }
    }
    // 第一局：单独下注调用
    this.onEvent({ type: 'thinking', personaId: opp.persona.id, on: true })
    const viewStub = { rules: this.ruleView() }
    const system = buildSystemPrompt(opp.persona, viewStub, 'bet')
    const ctx = this.takeContext(opp, true)
    const user = betPrompt(opp.bankroll, this.ruleView(), ctx)
    const res = await callCharacter(opp.profile, system, opp.memory.contextMessages(), user)
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
    } else {
      this.onEvent({ type: 'error', message: `${opp.persona.name} 下注调用失败（${res.error}），按最低注` })
    }
    return { bet, sideBets }
  }

  private async aiDecision(seatId: string): Promise<void> {
    const state = this.state!
    const opp = this.opponents.find((o) => o.persona.id === seatId)!
    const legal = getLegalActions(state)

    if (isLocalBot(opp.profile)) {
      applyAction(state, fallbackAction(state, legal))
      return
    }

    this.onEvent({ type: 'thinking', personaId: opp.persona.id, on: true })
    const view = projectView(state, seatId)
    const system = buildSystemPrompt(opp.persona, view, 'decision')
    const ctx = this.takeContext(opp)
    const handCount = state.seats[state.activeSeatIndex].hands.length
    const handNote = handCount > 1 ? `（你的第 ${state.activeHandIndex + 1}/${handCount} 手）` : undefined
    const user = decisionPrompt(view, legal, opp.persona.cardCounting, ctx, handNote)
    const res = await callCharacter(opp.profile, system, opp.memory.contextMessages(), user)
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
      opp.pendingCorrection = `你上一次提出的操作「${proposed ?? '无法解析'}」不合法或无法识别，荷官按基本策略替你执行了 ${action}。`
      this.onEvent({ type: 'corrected', speakerName: opp.persona.name, proposed: proposed ?? '?', action })
    }
    if (say && opp.persona.speechEnabled) this.utter(opp.persona, say, 'table')
    applyAction(state, action)
  }

  /* ---------------- 结算 ---------------- */

  private async finishRound(): Promise<void> {
    const state = this.state!
    this.busy = true
    try {
      playDealer(state)
      this.emitView()

      // 筹码结算
      const playerSeat = state.seats.find((s) => s.isHuman)!
      this.playerBankroll += playerSeat.net
      const oppBankrolls: Record<string, number> = {}
      for (const seat of state.seats) {
        if (seat.isHuman) continue
        const opp = this.opponents.find((o) => o.persona.id === seat.seatId)!
        opp.bankroll += seat.net
        oppBankrolls[seat.seatId] = opp.bankroll
        opp.recentResults.push(`第${this.roundNo}局 ${seat.net >= 0 ? '+' : ''}£${seat.net}`)
        if (opp.recentResults.length > 5) opp.recentResults.shift()
      }
      this.onEvent({ type: 'bankrolls', player: this.playerBankroll, opponents: oppBankrolls })

      const declarations: Record<string, string> = {}

      // 对手结算宣言 + 下局注额（同一次调用）
      for (const seat of state.seats) {
        if (seat.isHuman) continue
        const opp = this.opponents.find((o) => o.persona.id === seat.seatId)!
        if (isLocalBot(opp.profile)) {
          opp.nextBet = this.rules.minBet
          continue
        }
        if (!this.settings.declarations) {
          // 关闭宣言：沿用本局注额，省一次调用
          opp.nextBet = seat.baseBet
          opp.nextSideBets = seat.sideBets
          continue
        }
        await this.opponentSettlement(opp, seat.seatId, declarations)
      }

      // 陪玩结算感想
      if (this.settings.declarations) {
        for (const comp of this.companions) {
          if (isLocalBot(comp.profile) || !comp.persona.speechEnabled) continue
          const text = await this.companionSpeech(comp, 'companionSettle')
          if (text) declarations[comp.persona.id] = text
        }
      }

      // 荷官结算播报
      if (this.settings.dealerSettle && this.dealer && !isLocalBot(this.dealer.profile)) {
        const text = await this.dealerSpeech('dealerSettle')
        if (text) declarations['dealer'] = text
      }

      for (const ch of [...this.opponents, ...this.companions, ...(this.dealer ? [this.dealer] : [])]) {
        ch.memory.endRound()
      }

      const record: RoundRecord = {
        id: globalThis.crypto.randomUUID(),
        game: 'blackjack',
        round: this.roundNo,
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
          modelLabel: s.isHuman
            ? undefined
            : this.opponents.find((o) => o.persona.id === s.seatId)?.profile.model,
          bet: s.baseBet,
          net: s.net,
          outcome: s.outcomes.join('/'),
          decisions: s.isHuman && this.settings.habitMemory ? this.playerDecisions : undefined
        })),
        declarations,
        detail: {
          dealerCards: state.dealerCards.map((c) => `${c.suit}${c.rank}`),
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
    const res = await callCharacter(opp.profile, system, opp.memory.contextMessages(), user)
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

  /** 陪玩说话（自动吐槽/按钮点评/结算感想），返回文本 */
  async companionSpeech(
    comp: CharacterState,
    kind: keyof typeof SPEECH_INSTRUCTIONS,
    extraUserMsg?: string
  ): Promise<string | null> {
    if (isLocalBot(comp.profile)) return null
    this.onEvent({ type: 'thinking', personaId: comp.persona.id, on: true })
    const view = this.state ? projectView(this.state, 'companion') : null
    const system = buildSystemPrompt(comp.persona, { rules: this.ruleView() }, 'speech')
    const ctx = this.takeContext(comp)
    if (extraUserMsg) ctx.playerMessages.push(extraUserMsg)
    const user = speechPrompt(view, comp.persona.cardCounting, ctx, SPEECH_INSTRUCTIONS[kind])
    const res = await callCharacter(comp.profile, system, comp.memory.contextMessages(), user)
    this.onEvent({ type: 'thinking', personaId: comp.persona.id, on: false })
    if (!res.ok) {
      this.onEvent({ type: 'error', message: `${comp.persona.name} 调用失败（${res.error}）` })
      return null
    }
    comp.memory.record(user, res.content)
    const text = res.content.trim()
    this.utter(comp.persona, text, 'companion')
    return text
  }

  /** 陪玩按钮：吐槽 / 建议 */
  async companionComment(personaId: string, kind: 'banter' | 'advice'): Promise<void> {
    const comp = this.companions.find((c) => c.persona.id === personaId)
    if (!comp) return
    await this.companionSpeech(comp, kind === 'advice' ? 'companionAdvice' : 'companionBanter')
  }

  /** 与陪玩自由聊天（即时一次调用） */
  async companionChat(personaId: string, text: string): Promise<void> {
    const comp = this.companions.find((c) => c.persona.id === personaId)
    if (!comp) return
    this.utterPlayer(text)
    await this.companionSpeech(comp, 'companionBanter', text)
  }

  /** 给对手留言（并入其下一次调用，0 额外调用） */
  queueMessageToOpponent(personaId: string, text: string): void {
    const opp = this.opponents.find((o) => o.persona.id === personaId)
    if (!opp) return
    this.utterPlayer(`（对${opp.persona.name}）${text}`)
    opp.pendingPlayerMsgs.push(text)
  }

  private async dealerSpeech(kind: 'dealerComment' | 'dealerSettle'): Promise<string | null> {
    const dealer = this.dealer
    if (!dealer || isLocalBot(dealer.profile)) return null
    this.onEvent({ type: 'thinking', personaId: dealer.persona.id, on: true })
    const view = this.state ? projectView(this.state, 'dealer') : null
    const system = buildSystemPrompt(dealer.persona, { rules: this.ruleView() }, 'speech')
    const ctx = this.takeContext(dealer)
    const user = speechPrompt(view, false, ctx, SPEECH_INSTRUCTIONS[kind])
    const res = await callCharacter(dealer.profile, system, dealer.memory.contextMessages(), user)
    this.onEvent({ type: 'thinking', personaId: dealer.persona.id, on: false })
    if (!res.ok) return null
    dealer.memory.record(user, res.content)
    const text = res.content.trim()
    this.utter(dealer.persona, text, 'table')
    return text
  }

  private async maybeDealerComment(): Promise<void> {
    const d = this.dealer
    if (!d) return
    const mode = d.persona.dealerCommentMode ?? 'off'
    if (mode === 'off') return
    if (mode === 'chance' && !chance(d.persona.dealerCommentChance ?? 0.3)) return
    await this.dealerSpeech('dealerComment')
  }

  /* ---------------- 记忆工具 ---------------- */

  async compressMemory(personaId: string): Promise<boolean> {
    const ch = this.findChar(personaId)
    if (!ch || isLocalBot(ch.profile) || ch.memory.turns.length === 0) return false
    const res = await callCharacter(
      ch.profile,
      '你是一个记忆压缩助手。把给出的对话压缩成一段第一人称的简短记忆摘要（200字内），保留：牌局输赢走势、和玩家的关系/约定、自己说过的重要的话。直接输出摘要文本。',
      [],
      ch.memory.turns.map((t) => `${t.role}: ${t.content}`).join('\n')
    )
    if (!res.ok) {
      this.onEvent({ type: 'error', message: `压缩记忆失败：${res.error}` })
      return false
    }
    ch.memory.applyCompression(res.content.trim())
    return true
  }

  newMemorySession(personaId: string): void {
    this.findChar(personaId)?.memory.reset()
  }

  getMemorySnapshots(): Record<string, { note: string | null; turns: { role: string; content: string }[] }> {
    const out: Record<string, { note: string | null; turns: { role: string; content: string }[] }> = {}
    for (const ch of this.allChars()) {
      if (ch.persona.memoryMode === 'persistent') out[ch.persona.id] = ch.memory.serialize()
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
    const { decks, hitSoft17, splitAcesOneCard, doubleAfterSplit, minBet, maxBet } = this.rules
    return { decks, hitSoft17, splitAcesOneCard, doubleAfterSplit, minBet, maxBet }
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
    const ctx: TurnContext = {
      playerMessages: ch.pendingPlayerMsgs.splice(0),
      tableTalk: tableTalk.slice(-8),
      correction: ch.pendingCorrection,
      historyBrief:
        withHistory && ch.recentResults.length
          ? `你最近几局：${ch.recentResults.join('，')}`
          : undefined
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

  private utterPlayer(text: string): void {
    const u: TableUtterance = {
      seq: ++this.utteranceSeq,
      speakerId: 'player',
      speakerName: this.playerName,
      text,
      round: this.roundNo
    }
    this.utterances.push(u)
    this.onEvent({ type: 'utterance', utterance: u, channel: 'table' })
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

/** AI 战绩分析报告（历史面板按钮，单次调用） */
export async function generateReport(
  profile: ApiProfile,
  records: RoundRecord[],
  statsBrief: string
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const recent = records.slice(-60)
  const lines = recent.map((r) => {
    const seats = r.seats.map((s) => `${s.personaName}${s.net >= 0 ? '+' : ''}${s.net}`).join(' ')
    return `#${r.round} 玩家注£${r.playerBet} ${r.playerNet >= 0 ? '+' : ''}£${r.playerNet} | ${seats}`
  })
  const res = await callCharacter(
    profile,
    '你是一位赌场数据分析师。根据给出的 21 点对局记录和统计，写一份简短的中文分析报告：玩家整体胜率与盈亏走势、下注习惯点评、每位 AI 角色的表现对比、有意思的事件。用小标题分段，总长 400 字以内。直接输出报告。',
    [],
    `${statsBrief}\n\n最近对局：\n${lines.join('\n')}`,
    1200
  )
  return res.ok ? { ok: true, text: res.content.trim() } : { ok: false, error: res.error }
}
