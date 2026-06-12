import { ChatMessage, MemoryReset } from './types'

/** 单个角色的对话记忆。六档清理时机 + 手动压缩/开新会话。 */
export class CharacterMemory {
  reset: MemoryReset
  /** 压缩后的记忆摘要 */
  note: string | null = null
  /** user/assistant 轮次（不含 system，system 每次重组） */
  turns: ChatMessage[] = []
  /** 自动截断阈值（保留最近 N 条消息，防 context 失控） */
  maxMessages = 40

  constructor(reset: MemoryReset) {
    this.reset = reset
  }

  /** 组装进入下一次调用的历史消息 */
  contextMessages(): ChatMessage[] {
    if (this.reset === 'none') return []
    const msgs: ChatMessage[] = []
    if (this.note) {
      msgs.push({ role: 'user', content: `（你此前的记忆摘要）${this.note}` })
      msgs.push({ role: 'assistant', content: '（记下了）' })
    }
    return [...msgs, ...this.turns]
  }

  record(userMsg: string, assistantMsg: string): void {
    if (this.reset === 'none') return // 无记忆：每次调用都是新人
    this.turns.push({ role: 'user', content: userMsg })
    this.turns.push({ role: 'assistant', content: assistantMsg })
    if (this.turns.length > this.maxMessages) {
      this.turns = this.turns.slice(this.turns.length - this.maxMessages)
    }
  }

  /** 每局结束 */
  endRound(): void {
    if (this.reset === 'per-round' || this.reset === 'none') this.turns = []
  }

  /** 新开一场 */
  endMatch(): void {
    if (this.reset === 'per-match' || this.reset === 'per-round' || this.reset === 'none') {
      this.turns = []
      this.note = null
    }
  }

  /** 是否跨重启持久化 */
  get persisted(): boolean {
    return this.reset === 'permanent' || this.reset === 'manual' || this.reset === 'per-match'
  }

  /** 手动压缩：外部用 LLM 生成摘要后写入 */
  applyCompression(summary: string): void {
    this.note = summary
    this.turns = []
  }

  /** 手动开新会话：抹掉对话与摘要 */
  resetAll(): void {
    this.note = null
    this.turns = []
  }

  serialize(): { note: string | null; turns: ChatMessage[] } {
    return { note: this.note, turns: this.turns }
  }

  restore(data: { note?: string | null; turns?: ChatMessage[] } | null): void {
    if (!data || !this.persisted) return
    this.note = data.note ?? null
    this.turns = Array.isArray(data.turns) ? data.turns : []
  }
}
