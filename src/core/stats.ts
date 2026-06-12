import { RoundRecord } from './types'

/** 内置统计（代码计算）：玩家 / 赌场 / 按人格（跨模型） / 按模型（跨人格） */

export interface GlobalStats {
  rounds: number
  playerNet: number
  wins: number
  losses: number
  pushes: number
  blackjacks: number
  busts: number
  surrenders: number
  winRate: number
  biggestWin: number
  biggestLoss: number
  rebuys: number
  /** 玩家习惯：与基本策略一致率（有记录的决策中） */
  strategyMatchRate: number | null
  /** 场均盈亏 */
  avgNetPerRound: number
}

export interface HouseStats {
  rounds: number
  /** 赌场总盈亏（= -∑所有座位盈亏） */
  houseNet: number
  /** 抽水率：houseNet / 总下注额 */
  edgeRate: number
  /** 最近走势（每局 houseNet，最多 30 局） */
  trend: number[]
  totalWagered: number
}

export interface AggStats {
  key: string
  rounds: number
  net: number
  wins: number
  losses: number
  pushes: number
  blackjacks: number
  busts: number
  surrenders: number
  winRate: number
}

interface OutcomeCounts {
  win: number; loss: number; push: number; bj: number; bust: number; surrender: number
}

function outcomeCounts(outcome: string): OutcomeCounts {
  const c: OutcomeCounts = { win: 0, loss: 0, push: 0, bj: 0, bust: 0, surrender: 0 }
  for (const o of outcome.split('/')) {
    if (o === 'win') c.win++
    else if (o === 'blackjack') { c.win++; c.bj++ }
    else if (o === 'push') c.push++
    else if (o === 'bust') { c.loss++; c.bust++ }
    else if (o === 'surrender') { c.loss++; c.surrender++ }
    else if (o === 'lose' || o === 'dealer-blackjack') c.loss++
  }
  return c
}

function gameRounds(records: RoundRecord[]): RoundRecord[] {
  return records.filter((r) => r.round !== 0)
}

export function computeGlobalStats(records: RoundRecord[]): GlobalStats {
  const s: GlobalStats = {
    rounds: 0, playerNet: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0,
    busts: 0, surrenders: 0, winRate: 0, biggestWin: 0, biggestLoss: 0,
    rebuys: 0, strategyMatchRate: null, avgNetPerRound: 0
  }
  let decisions = 0
  let matched = 0
  for (const r of records) {
    if (r.bankrollEvent) s.rebuys++
    if (r.round === 0) continue
    s.rounds++
    s.playerNet += r.playerNet
    s.biggestWin = Math.max(s.biggestWin, r.playerNet)
    s.biggestLoss = Math.min(s.biggestLoss, r.playerNet)
    const playerSeat = r.seats.find((x) => !x.personaId)
    if (playerSeat) {
      const c = outcomeCounts(playerSeat.outcome)
      s.wins += c.win
      s.losses += c.loss
      s.pushes += c.push
      s.blackjacks += c.bj
      s.busts += c.bust
      s.surrenders += c.surrender
      for (const d of playerSeat.decisions ?? []) {
        decisions++
        if (d.action === d.basicStrategy) matched++
      }
    }
  }
  const decided = s.wins + s.losses
  s.winRate = decided ? s.wins / decided : 0
  s.strategyMatchRate = decisions ? matched / decisions : null
  s.avgNetPerRound = s.rounds ? s.playerNet / s.rounds : 0
  return s
}

export function computeHouseStats(records: RoundRecord[]): HouseStats {
  const rounds = gameRounds(records)
  let houseNet = 0
  let totalWagered = 0
  const trend: number[] = []
  for (const r of rounds) {
    const roundHouse = -r.seats.reduce((n, seat) => n + seat.net, 0)
    houseNet += roundHouse
    trend.push(roundHouse)
    totalWagered += r.seats.reduce((n, seat) => n + seat.bet, 0)
  }
  return {
    rounds: rounds.length,
    houseNet,
    edgeRate: totalWagered ? houseNet / totalWagered : 0,
    trend: trend.slice(-30),
    totalWagered
  }
}

function aggregate(
  records: RoundRecord[],
  keyOf: (seat: { personaId?: string; personaName: string; modelLabel?: string }) => string | null
): AggStats[] {
  const map = new Map<string, AggStats>()
  for (const r of gameRounds(records)) {
    for (const seat of r.seats) {
      if (!seat.personaId) continue
      const key = keyOf(seat)
      if (!key) continue
      let a = map.get(key)
      if (!a) {
        a = {
          key, rounds: 0, net: 0, wins: 0, losses: 0, pushes: 0,
          blackjacks: 0, busts: 0, surrenders: 0, winRate: 0
        }
        map.set(key, a)
      }
      a.rounds++
      a.net += seat.net
      const c = outcomeCounts(seat.outcome)
      a.wins += c.win
      a.losses += c.loss
      a.pushes += c.push
      a.blackjacks += c.bj
      a.busts += c.bust
      a.surrenders += c.surrender
    }
  }
  for (const a of map.values()) {
    const decided = a.wins + a.losses
    a.winRate = decided ? a.wins / decided : 0
  }
  return [...map.values()].sort((x, y) => y.net - x.net)
}

/** 每个人格各自统计一次（该角色用过的所有模型合并） */
export function computePersonaStats(records: RoundRecord[]): AggStats[] {
  return aggregate(records, (s) => s.personaName)
}

/** 每个模型各自统计一次（用过该模型的所有角色合并） */
export function computeModelStats(records: RoundRecord[]): AggStats[] {
  return aggregate(records, (s) => s.modelLabel ?? null)
}

export function statsBrief(records: RoundRecord[]): string {
  const g = computeGlobalStats(records)
  const h = computeHouseStats(records)
  const lines = [
    `玩家：${g.rounds}局 净${g.playerNet >= 0 ? '+' : ''}£${g.playerNet} 胜率${(g.winRate * 100).toFixed(1)}% BJ×${g.blackjacks} 爆牌×${g.busts} 重新买入×${g.rebuys}`,
    `赌场：净${h.houseNet >= 0 ? '+' : ''}£${h.houseNet}（总下注 £${h.totalWagered}）`
  ]
  for (const c of computePersonaStats(records)) {
    lines.push(`${c.key}：${c.rounds}局 净${c.net >= 0 ? '+' : ''}£${c.net} 胜率${(c.winRate * 100).toFixed(1)}%`)
  }
  return lines.join('\n')
}

/** 某个角色（或玩家）的对局摘要 —— 供角色分析报告 */
export function characterRecordsBrief(
  records: RoundRecord[],
  personaId: string | 'player',
  limit = 60
): string {
  const lines: string[] = []
  for (const r of gameRounds(records).slice(-limit)) {
    const seat = r.seats.find((s) =>
      personaId === 'player' ? !s.personaId : s.personaId === personaId
    )
    if (!seat) continue
    const decl = r.declarations[personaId === 'player' ? 'player' : personaId]
    lines.push(
      `#${r.matchRound ?? r.round} 注£${seat.bet} ${seat.outcome} ${seat.net >= 0 ? '+' : ''}£${seat.net}` +
      (seat.decisions?.length
        ? ` 决策[${seat.decisions.map((d) => `${d.situation}:${d.action}${d.action !== d.basicStrategy ? `(策略${d.basicStrategy})` : ''}`).join(' ')}]`
        : '') +
      (decl ? ` 宣言「${decl}」` : '')
    )
  }
  return lines.join('\n')
}
