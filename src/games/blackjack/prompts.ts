/**
 * 21 点 prompt 预设 —— 分层组装：
 *   [1] 游戏规则层（锁定，本文件，按当前牌桌规则动态生成）
 *   [2] 角色层（用户编辑：simple 套模板 / advanced 原文）
 *   [3] 输出格式层（锁定，按调用类型）
 *
 * 所有态势输入只接受 TableView（投影），prompt 层无法接触引擎内部状态。
 * 静态层放最前，利于服务商 prompt cache。
 */
import { Persona } from '@/core/types'
import { BlackjackAction, TableView, SeatView, SideBetStakes } from './types'

/* ---------- [1] 游戏规则层 ---------- */

export function rulesLayer(view: Pick<TableView, 'rules'>): string {
  const r = view.rules
  const dealStyle = r.holeCard
    ? `所有人两张明牌，庄家一张明牌一张暗牌${r.peek ? '（明牌为 A/10 时庄家先偷看暗牌，是 Blackjack 直接结算）' : ''}`
    : '所有人两张明牌，庄家先只发一张明牌，所有人行动完庄家才补牌（无暗牌）'
  const doubleRule =
    r.doubleRestriction === 'any'
      ? '任意前两张可加倍'
      : `仅硬 ${r.doubleRestriction} 点可加倍`
  const splitRule = `同点对子可分牌（每座位最多 ${r.maxSplitHands} 手${r.maxSplitHands > 2 ? '，分 A 除外不可再分' : '，不可再分'}）${r.splitAcesOneCard ? '，分 A 每手只补一张' : ''}；分 A 后 A+10 只算 21 不算 Blackjack。${r.doubleAfterSplit ? '分牌后可加倍。' : '分牌后不可加倍。'}`
  const lines = [
    `你正坐在一张 21 点（Blackjack）赌桌旁。规则：`,
    `- ${r.decks} 副牌混洗成一靴，切牌到达后局间重洗。${dealStyle}。`,
    `- 庄家补牌到至少 17 点${r.hitSoft17 ? '（软 17 继续要牌）' : '（软 17 停牌）'}。Blackjack（最初两张 A+10）赔 3:2，普通赢 1:1，平局退注。庄家两张成 Blackjack 时通吃所有注（对方 Blackjack 平局）。`,
    `- Double：${doubleRule}，只买一张。Split：${splitRule}`
  ]
  if (r.insurance) {
    lines.push(`- 庄家明牌为 A 时可买保险（半注，庄家 Blackjack 时赔 2:1）。`)
  }
  if (r.lateSurrender) {
    lines.push(`- 可投降（Surrender）：确认庄家无 Blackjack 后，前两张时放弃本手损失半注。`)
  }
  lines.push(
    `- 台注限红 £${r.minBet}–£${r.maxBet}。边注：21+3（你的两张+庄家明牌成同花/顺子/三条/同花顺，9:1）、Pairs（你的前两张成对：混色 5:1 / 同色 ${r.decks <= 4 ? 12 : 10}:1 / 同花 30:1）、Top 3（三条 90:1 / 同花顺 180:1 / 同花三条 270:1）。`,
    `你只能看到桌面上公开的信息（各家明牌、注额、已发牌情况${r.holeCard ? '——庄家暗牌在揭示前对所有人都是未知的' : ''}），像一个真实玩家一样思考。`
  )
  return lines.join('\n')
}

/* ---------- [2] 角色层 ---------- */

export function characterLayer(persona: Persona): string {
  if (persona.promptMode === 'advanced') return persona.characterText
  const roleDesc =
    persona.role === 'opponent'
      ? '你是这张桌上的一名玩家，用自己的钱下注，希望赢钱，也享受牌桌上的交流。'
      : persona.role === 'companion'
        ? '你是坐在玩家身边的陪玩，看着玩家的牌、筹码和桌面替 TA 出谋划策、吐槽喝彩。你自己不下注。'
        : '你是这张桌的荷官（Dealer），专业、克制，按赌场规范主持牌局。'
  return [
    `你将扮演「${persona.name}」。${roleDesc}`,
    persona.characterText ? `角色设定：${persona.characterText}` : '',
    `始终保持角色的性格、语气和说话习惯。说话简短自然（一两句话），像牌桌上的真人，不要长篇大论，不要解释规则。`
  ].filter(Boolean).join('\n')
}

/* ---------- [3] 输出格式层（锁定） ---------- */

const ACTION_FORMAT = `你必须只输出一个 JSON 对象，不要输出任何其他文字。格式：
{"action": "<从给出的合法操作中选一个>", "say": "<一句话台词，可省略>"}`

const ACTION_FORMAT_MUTE = `你必须只输出一个 JSON 对象，不要输出任何其他文字。格式：
{"action": "<从给出的合法操作中选一个>"}`

const BET_FORMAT = `你必须只输出一个 JSON 对象，不要输出任何其他文字。格式：
{"bet": <主注金额数字>, "sideBets": {"pairs": <金额或0>, "twentyOnePlusThree": <金额或0>, "top3": <金额或0>}, "say": "<一句话台词，可省略>"}`

const SETTLE_FORMAT = `你必须只输出一个 JSON 对象，不要输出任何其他文字。格式：
{"say": "<本局结算宣言：对结果的反应，如有人跟你说话可一并回应>", "nextBet": <下一局主注金额数字>, "nextSideBets": {"pairs": <金额或0>, "twentyOnePlusThree": <金额或0>, "top3": <金额或0>}}`

const SPEECH_FORMAT = `输出规则：直接输出你要说的话本身。严禁输出 JSON、严禁用大括号或引号包裹、严禁任何前缀（如「回复：」）或解释，就像真人开口说话一样。`

/* ---------- 系统 prompt 组装 ---------- */

export type CallKind = 'bet' | 'decision' | 'settlement' | 'speech'

export function buildSystemPrompt(
  persona: Persona,
  view: Pick<TableView, 'rules'>,
  kind: CallKind
): string {
  const format =
    kind === 'bet' ? BET_FORMAT
    : kind === 'decision' ? (persona.speechEnabled ? ACTION_FORMAT : ACTION_FORMAT_MUTE)
    : kind === 'settlement' ? SETTLE_FORMAT
    : SPEECH_FORMAT
  return [rulesLayer(view), characterLayer(persona), format].join('\n\n')
}

/* ---------- 态势序列化（紧凑，省 token） ---------- */

function handLine(s: SeatView): string {
  return s.hands
    .map((h) => {
      const flags = [
        h.blackjack ? 'BJ' : '',
        h.bust ? '爆' : '',
        h.surrendered ? '投降' : '',
        h.doubled ? '加倍' : '',
        h.fromSplit ? '分牌' : ''
      ].filter(Boolean).join(',')
      return `${h.cards.join(' ')}(${h.soft ? '软' : ''}${h.total}${flags ? ' ' + flags : ''}) 注£${h.bet}`
    })
    .join(' | ')
}

export function serializeView(view: TableView, opts: { cardCounting: boolean }): string {
  const lines: string[] = []
  lines.push(`第${view.round}局${view.shuffledThisRound ? '（本局前刚洗牌）' : ''}`)
  const d = view.dealer
  const dealerDesc = d.cards.length
    ? `${d.cards.join(' ')}(明牌${d.total}${d.holeCardHidden ? '+暗牌?' : ''}${d.blackjack ? ' BJ' : d.bust ? ' 爆' : ''})`
    : '未发牌'
  lines.push(`庄家: ${dealerDesc}`)
  for (const s of view.seats) {
    const you = s.isYou ? '（你）' : s.isHuman ? '（人类玩家）' : ''
    const side = sideBetsBrief(s.sideBets)
    const ins = s.insuranceBet > 0 ? ` 保险£${s.insuranceBet}` : ''
    lines.push(`${s.name}${you}: ${handLine(s)}${side}${ins}${settledBrief(s)}`)
  }
  if (opts.cardCounting) {
    const seen = view.seen
    const ranks = Object.entries(seen.byRank).map(([r, n]) => `${r}:${n}`).join(' ')
    lines.push(`本靴已见 ${seen.dealt} 张（余约 ${seen.remaining}），已见点数 [${ranks}]`)
  }
  return lines.join('\n')
}

function sideBetsBrief(sb: SideBetStakes): string {
  const parts: string[] = []
  if (sb.pairs) parts.push(`Pairs£${sb.pairs}`)
  if (sb.twentyOnePlusThree) parts.push(`21+3£${sb.twentyOnePlusThree}`)
  if (sb.top3) parts.push(`Top3£${sb.top3}`)
  return parts.length ? ` 边注[${parts.join(' ')}]` : ''
}

function settledBrief(s: SeatView): string {
  if (s.net === undefined) return ''
  const outcomes = s.hands.map((h) => h.outcome).filter(Boolean).join('/')
  return ` → ${outcomes} ${s.net >= 0 ? '+' : ''}£${s.net}`
}

/* ---------- 各调用类型的用户消息 ---------- */

export interface TurnContext {
  /** 排队的玩家私聊（对该角色说的话） */
  playerMessages: string[]
  /** 桌聊：该角色上次发言后没见过的别人发言 */
  tableTalk: { speaker: string; text: string }[]
  /** 上次操作被修正的提示 */
  correction?: string
  /** 历史战绩背景（按 historyAwareness 注入） */
  historyBrief?: string
  /** 陪玩/荷官可见的玩家资金行 */
  playerFunds?: string
}

function contextBlock(ctx: TurnContext): string {
  const lines: string[] = []
  if (ctx.correction) lines.push(`（提示：${ctx.correction}）`)
  for (const t of ctx.tableTalk) lines.push(`${t.speaker}说：「${t.text}」`)
  for (const m of ctx.playerMessages) lines.push(`玩家对你说：「${m}」`)
  if (ctx.playerFunds) lines.push(ctx.playerFunds)
  if (ctx.historyBrief) lines.push(ctx.historyBrief)
  return lines.join('\n')
}

export function betPrompt(bankroll: number, rules: TableView['rules'], ctx: TurnContext): string {
  return [
    contextBlock(ctx),
    `新一局开始。你的筹码余额 £${bankroll}，台注限红 £${rules.minBet}–£${rules.maxBet}。按你的性格决定本局下注（可选边注，不买填 0）。`
  ].filter(Boolean).join('\n')
}

export function decisionPrompt(
  view: TableView,
  legal: BlackjackAction[],
  cardCounting: boolean,
  ctx: TurnContext,
  activeHandNote?: string
): string {
  const isInsurance = legal.includes('insure')
  const ask = isInsurance
    ? `庄家明牌是 A，问你是否买保险（半注 £${Math.floor((view.seats.find((s) => s.isYou)?.baseBet ?? 0) / 2)}，庄家 BJ 赔 2:1）。合法操作：${legal.join(' / ')}。请决策。`
    : `轮到你行动${activeHandNote ?? ''}。合法操作：${legal.join(' / ')}。请决策。`
  return [serializeView(view, { cardCounting }), contextBlock(ctx), ask]
    .filter(Boolean).join('\n')
}

export function settlementPrompt(
  view: TableView,
  bankroll: number,
  cardCounting: boolean,
  ctx: TurnContext
): string {
  return [
    serializeView(view, { cardCounting }),
    contextBlock(ctx),
    `本局结束。你的筹码余额 £${bankroll}。请发表结算宣言并决定下一局下注。`
  ].filter(Boolean).join('\n')
}

/** 陪玩/荷官的纯说话调用 */
export function speechPrompt(
  view: TableView | null,
  cardCounting: boolean,
  ctx: TurnContext,
  instruction: string
): string {
  return [
    view ? serializeView(view, { cardCounting }) : '',
    contextBlock(ctx),
    instruction
  ].filter(Boolean).join('\n')
}

export const SPEECH_INSTRUCTIONS = {
  companionAuto: '看一眼现在的局面，按你的性格随口说点什么（吐槽、起哄、感叹都行）。',
  companionBanter: '玩家点了你一下让你说话。看看现在的局面，吐个槽或者聊两句。',
  companionAdvice: '玩家想听你的建议。结合玩家现在的牌和庄家明牌，给出你建议的打法（要牌/停牌/加倍/分牌等）和简短理由，用你的角色语气说。',
  companionSettle: '本局结束了。对这局的结果发表你的结算感想（替玩家高兴/惋惜/吐槽都行）。',
  dealerComment: '作为荷官，对当前局面说一句简短专业的评论或行话。',
  dealerSettle: '作为荷官，宣布本局结算结果（谁赢谁输、赔付情况），简短专业。',
  dealerDraw: '作为荷官，你正在给自己补牌。宣布你翻开/抽出的牌和当前点数，简短专业带一点仪式感。'
} as const

/** 荷官模型决策抽牌：返回 {action:'hit'|'stand', say} */
export const DEALER_DRAW_FORMAT = `你是荷官，正在按赌场规则给自己补牌（必须补到至少 17 点，规则之内你没有自由裁量权，这只是让你保持荷官的仪态与播报）。你必须只输出一个 JSON 对象：
{"action": "<hit 或 stand，按规则该补就 hit>", "say": "<一句荷官播报，可省略>"}`
