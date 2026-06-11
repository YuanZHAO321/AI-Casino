/**
 * OpenAI 兼容 LLM 客户端（主进程：避开 CORS，apiKey 不进渲染层）。
 * baseURL 兼容带不带 /v1、带不带尾斜杠。
 */

export interface LlmRequest {
  baseURL: string
  apiKey: string
  model: string
  temperature?: number
  useJsonMode?: boolean
  messages: { role: string; content: string }[]
  maxTokens?: number
}

export interface LlmResponse {
  ok: boolean
  content?: string
  error?: string
  usage?: { promptTokens?: number; completionTokens?: number }
}

function normalizeBase(baseURL: string): string {
  let url = baseURL.trim().replace(/\/+$/, '')
  // 已带 /v1 或其他版本路径的不再追加
  if (!/\/v\d+$/.test(url) && !/\/(openai|api)$/.test(url)) {
    url += '/v1'
  }
  return url
}

export async function chatCompletion(req: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
  const url = `${normalizeBase(req.baseURL)}/chat/completions`
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.8
  }
  if (req.maxTokens) body.max_tokens = req.maxTokens
  if (req.useJsonMode) body.response_format = { type: 'json_object' }

  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.apiKey}`
      },
      body: JSON.stringify(body)
    }, 60000, signal)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      // json_object 不被支持时自动回退重试一次
      if (req.useJsonMode && (res.status === 400 || res.status === 422)) {
        return chatCompletion({ ...req, useJsonMode: false }, signal)
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

export async function listModels(baseURL: string, apiKey: string): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  try {
    const res = await fetchWithTimeout(`${normalizeBase(baseURL)}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    }, 15000)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
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

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
  outer?: AbortSignal
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error(`请求超时（${ms / 1000}s）`)), ms)
  outer?.addEventListener('abort', () => ctrl.abort(outer.reason))
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}
