import { RoundRecord } from './types'

/** 内置统计（代码计算）：全局 + 每角色（人格+模型组合） */

export interface GlobalStats {
  rounds: number
  playerNet: number
  wins: number
  losses: number
  pushes: number
  blackjacks: number
  busts: number
  winRate: number
  biggestWin: number
  biggestLoss: number
  sideBetNet: number
  sideBetHits: number
  rebuys: number
}

export interface CharacterStats {
  key: string // personaName @ model
  personaName: string
  modelLabel?: string
  rounds: number
  net: number
  wins: number
  losses: number
  pushes: number
  blackjacks: number
  busts: number
  winRate: number
}

function outcomeCounts(outcome: string): { win: number; loss: number; push: number; bj: number; bust: number } {
  // outcome 形如 "win" 或分牌 "win/push"
  let win = 0, loss = 0, push = 0, bj = 0, bust = 0
  for (const o of outcome.split('/')) {
    if (o === 'win') win++
    else if (o === 'blackjack') { win++; bj++ }
    else if (o === 'push') push++
    else if (o === 'bust') { loss++; bust++ }
    else if (o === 'lose' || o === 'dealer-blackjack') loss++
  }
  return { win, loss, push, bj, bust }
}

export function computeGlobalStats(records: RoundRecord[]): GlobalStats {
  const s: GlobalStats = {
    rounds: 0, playerNet: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0,
    busts: 0, winRate: 0, biggestWin: 0, biggestLoss: 0, sideBetNet: 0, sideBetHits: 0, rebuys: 0
  }
  for (const r of records) {
    if (r.bankrollEvent) s.rebuys++
    if (r.round === 0) continue // 纯资金事件记录
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
    }
  }
  const decided = s.wins + s.losses
  s.winRate = decided ? s.wins / decided : 0
  return s
}

export function computeCharacterStats(records: RoundRecord[]): CharacterStats[] {
  const map = new Map<string, CharacterStats>()
  for (const r of records) {
    for (const seat of r.seats) {
      if (!seat.personaId) continue
      const key = `${seat.personaName} @ ${seat.modelLabel ?? 'local'}`
      let cs = map.get(key)
      if (!cs) {
        cs = {
          key, personaName: seat.personaName, modelLabel: seat.modelLabel,
          rounds: 0, net: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, busts: 0, winRate: 0
        }
        map.set(key, cs)
      }
      cs.rounds++
      cs.net += seat.net
      const c = outcomeCounts(seat.outcome)
      cs.wins += c.win
      cs.losses += c.loss
      cs.pushes += c.push
      cs.blackjacks += c.bj
      cs.busts += c.bust
    }
  }
  for (const cs of map.values()) {
    const decided = cs.wins + cs.losses
    cs.winRate = decided ? cs.wins / decided : 0
  }
  return [...map.values()].sort((a, b) => b.net - a.net)
}

export function statsBrief(records: RoundRecord[]): string {
  const g = computeGlobalStats(records)
  const chars = computeCharacterStats(records)
  const lines = [
    `玩家：${g.rounds}局 净${g.playerNet >= 0 ? '+' : ''}£${g.playerNet} 胜率${(g.winRate * 100).toFixed(1)}% BJ×${g.blackjacks} 爆牌×${g.busts} 重新买入×${g.rebuys}`
  ]
  for (const c of chars) {
    lines.push(`${c.key}：${c.rounds}局 净${c.net >= 0 ? '+' : ''}£${c.net} 胜率${(c.winRate * 100).toFixed(1)}%`)
  }
  return lines.join('\n')
}
