import { ApiProfile, ChatMessage, LOCAL_BOT_PROFILE_ID } from './types'

export interface AiCallResult {
  ok: boolean
  content: string
  error?: string
}

export function isLocalBot(profile: ApiProfile | undefined): boolean {
  return !profile || profile.id === LOCAL_BOT_PROFILE_ID
}

/**
 * 调一次 LLM（经主进程 IPC）。失败自动重试一次。
 * system 每次重组（静态层在前，利于 prompt cache），history 来自角色记忆。
 */
export async function callCharacter(
  profile: ApiProfile,
  system: string,
  history: ChatMessage[],
  userMsg: string,
  maxTokens = 400
): Promise<AiCallResult> {
  const messages = [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: userMsg }
  ]
  const req = {
    baseURL: profile.baseURL,
    apiKey: profile.apiKey,
    model: profile.model,
    temperature: profile.temperature,
    useJsonMode: profile.useJsonMode,
    messages,
    maxTokens
  }
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await window.casino.llm.chat(req)
    if (res.ok && res.content) return { ok: true, content: res.content }
    lastError = res.error ?? '空响应'
  }
  return { ok: false, content: '', error: lastError }
}
