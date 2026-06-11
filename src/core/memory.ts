import { ChatMessage, MemoryMode } from './types'

/** 单个角色的对话记忆。三种模式 + 手动压缩/开新会话。 */
export class CharacterMemory {
  mode: MemoryMode
  /** 压缩后的记忆摘要（压缩或持久模式恢复时使用） */
  note: string | null = null
  /** user/assistant 轮次（不含 system，system 每次重组） */
  turns: ChatMessage[] = []
  /** 自动截断阈值（保留最近 N 条消息，防 context 失控） */
  maxMessages = 40

  constructor(mode: MemoryMode) {
    this.mode = mode
  }

  /** 组装进入下一次调用的历史消息 */
  contextMessages(): ChatMessage[] {
    const msgs: ChatMessage[] = []
    if (this.note) {
      msgs.push({ role: 'user', content: `（你此前的记忆摘要）${this.note}` })
      msgs.push({ role: 'assistant', content: '（记下了）' })
    }
    return [...msgs, ...this.turns]
  }

  record(userMsg: string, assistantMsg: string): void {
    this.turns.push({ role: 'user', content: userMsg })
    this.turns.push({ role: 'assistant', content: assistantMsg })
    if (this.turns.length > this.maxMessages) {
      this.turns = this.turns.slice(this.turns.length - this.maxMessages)
    }
  }

  /** 每局结束时调用：per-round 模式清空本局对话 */
  endRound(): void {
    if (this.mode === 'per-round') this.turns = []
  }

  /** 手动压缩：外部用 LLM 生成摘要后写入 */
  applyCompression(summary: string): void {
    this.note = summary
    this.turns = []
  }

  /** 手动开新会话：抹掉对话与摘要 */
  reset(): void {
    this.note = null
    this.turns = []
  }

  /** 持久模式的序列化/恢复 */
  serialize(): { note: string | null; turns: ChatMessage[] } {
    return { note: this.note, turns: this.turns }
  }

  restore(data: { note?: string | null; turns?: ChatMessage[] } | null): void {
    if (!data || this.mode !== 'persistent') return
    this.note = data.note ?? null
    this.turns = Array.isArray(data.turns) ? data.turns : []
  }
}
