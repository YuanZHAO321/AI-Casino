import { RoundRecord } from './types'
import { computeGlobalStats } from './stats'

export interface AchievementDef {
  id: string
  /** i18n key 前缀：achievements.<id>.name / .desc */
  check: (records: RoundRecord[], latest: RoundRecord) => boolean
}

function playerOutcome(r: RoundRecord): string {
  return r.seats.find((s) => !s.personaId)?.outcome ?? ''
}

function streak(records: RoundRecord[], pred: (r: RoundRecord) => boolean): number {
  let n = 0
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].round === 0) continue
    if (pred(records[i])) n++
    else break
  }
  return n
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-blackjack', check: (_rs, r) => playerOutcome(r).includes('blackjack') },
  { id: 'big-win-500', check: (_rs, r) => r.playerNet >= 500 },
  { id: 'win-streak-5', check: (rs) => streak(rs, (r) => r.playerNet > 0) >= 5 },
  { id: 'split-double-win', check: (_rs, r) => playerOutcome(r) === 'win/win' },
  { id: 'suited-pair-30', check: (_rs, r) => suitedPairHit(r) },
  { id: 'top3-hit', check: (_rs, r) => (r.playerSideBets?.['top3'] ?? 0) > 0 && r.playerNet > 0 && top3Win(r) },
  { id: 'comeback', check: (_rs, r) => r.bankrollBefore < 100 && r.bankrollAfter >= 500 },
  { id: 'rounds-100', check: (rs) => computeGlobalStats(rs).rounds >= 100 },
  { id: 'high-roller', check: (_rs, r) => r.playerBet >= 1000 },
  { id: 'bankroll-5000', check: (_rs, r) => r.bankrollAfter >= 5000 },
  { id: 'survivor', check: (rs) => computeGlobalStats(rs).rebuys === 0 && computeGlobalStats(rs).rounds >= 50 },
  { id: 'push-3', check: (rs) => streak(rs, (r) => r.playerNet === 0 && playerOutcome(r).includes('push')) >= 3 }
]

interface DetailLike {
  playerSideBetHits?: { kind: string; hit: string | null; odds: number }[]
}

function suitedPairHit(r: RoundRecord): boolean {
  const d = r.detail as DetailLike | undefined
  return !!d?.playerSideBetHits?.some((h) => h.hit === 'same-suit-pair')
}

function top3Win(r: RoundRecord): boolean {
  const d = r.detail as DetailLike | undefined
  return !!d?.playerSideBetHits?.some((h) => h.kind === 'top3' && h.hit)
}

/** 返回本局新解锁的成就 id 列表 */
export function checkAchievements(
  records: RoundRecord[],
  latest: RoundRecord,
  unlocked: Set<string>
): string[] {
  const fresh: string[] = []
  for (const def of ACHIEVEMENTS) {
    if (unlocked.has(def.id)) continue
    try {
      if (def.check(records, latest)) fresh.push(def.id)
    } catch {
      /* 单个成就判定失败不影响其他 */
    }
  }
  return fresh
}
