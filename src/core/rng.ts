/**
 * 真随机（CSPRNG）：基于 crypto.getRandomValues，拒绝采样消除取模偏差。
 * 浏览器与 Node (>=19) 均有 globalThis.crypto。
 */

export function randomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error(`randomInt: 非法上界 ${maxExclusive}`)
  }
  if (maxExclusive === 1) return 0
  const range = 0x100000000 // 2^32
  const limit = range - (range % maxExclusive)
  const buf = new Uint32Array(1)
  for (;;) {
    globalThis.crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % maxExclusive
  }
}

/** Fisher–Yates 原地洗牌 */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** 概率触发：p ∈ [0,1] */
export function chance(p: number): boolean {
  if (p <= 0) return false
  if (p >= 1) return true
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return buf[0] / 0x100000000 < p
}
