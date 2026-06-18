/**
 * OpenAI 兼容 LLM 客户端（浏览器版）。逻辑移植自 electron/main/llm.ts，
 * 纯静态 PWA 直接 fetch 用户填写的接口（CORS 取决于目标端点）。
 * baseURL 兼容带不带 /v1、带不带尾斜杠。
 */
import type { LlmChatRequest, LlmChatResponse } from '../../electron/preload/api.d'

function normalizeBase(baseURL: string): string {
  let url = baseURL.trim().replace(/\/+$/, '')
  if (!/\/v\d+$/.test(url) && !/\/(openai|api)$/.test(url)) {
    url += '/v1'
  }
  return url
}

export async function chatCompletion(req: LlmChatRequest): Promise<LlmChatResponse> {
  const url = `${normalizeBase(req.baseURL)}/chat/completions`
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.8
  }
  if (req.maxTokens) body.max_tokens = req.maxTokens
  if (req.useJsonMode) body.response_format = { type: 'json_object' }

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${req.apiKey}`
        },
        body: JSON.stringify(body)
      },
      60000
    )

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      // json_object 不被支持时自动回退重试一次
      if (req.useJsonMode && (res.status === 400 || res.status === 422)) {
        return chatCompletion({ ...req, useJsonMode: false })
      }
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` }
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return { ok: false, error: '响应中没有 message.content' }
    }
    return {
      ok: true,
      content,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens
      }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function listModels(
  baseURL: string,
  apiKey: string
): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  try {
    const res = await fetchWithTimeout(
      `${normalizeBase(baseURL)}/models`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
      15000
    )
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = (await res.json()) as { data?: { id?: string }[] }
    const models = (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string')
      .sort()
    return { ok: true, models }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error(`请求超时（${ms / 1000}s）`)), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}
