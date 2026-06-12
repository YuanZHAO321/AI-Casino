import { ApiProfile, ChatMessage, ModelRef, Persona, LOCAL_BOT_PROFILE_ID } from './types'

export interface ResolvedModel {
  profile: ApiProfile
  model: string
}

export interface AiCallResult {
  ok: boolean
  content: string
  error?: string
}

export type ModelSlot = 'fast' | 'smart'

export function isLocalRef(rm: ResolvedModel | null): boolean {
  return !rm || rm.profile.id === LOCAL_BOT_PROFILE_ID || !rm.model
}

/** 把角色的某个模型槽解析为 接口+模型；本地机器人/无效引用返回 null */
export function resolveModelRef(
  ref: ModelRef | undefined,
  getProfile: (id: string) => ApiProfile | undefined
): ResolvedModel | null {
  if (!ref) return null
  const profile = getProfile(ref.profileId)
  if (!profile || profile.id === LOCAL_BOT_PROFILE_ID) return null
  const model = ref.model || profile.models[0] || ''
  if (!model) return null
  return { profile, model }
}

/** 按调用用途选槽：smart 槽缺省回落 fast */
export function pickSlot(persona: Persona, slot: ModelSlot): ModelRef | undefined {
  if (slot === 'smart' && persona.smart) return persona.smart
  return persona.fast
}

/**
 * 调一次 LLM（经主进程 IPC）。失败自动重试一次。
 * system 每次重组（静态层在前，利于 prompt cache），history 来自角色记忆。
 */
export async function callModel(
  rm: ResolvedModel,
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
    baseURL: rm.profile.baseURL,
    apiKey: rm.profile.apiKey,
    model: rm.model,
    temperature: rm.profile.temperature,
    useJsonMode: rm.profile.useJsonMode,
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
