/** 渲染层可见的 IPC 桥类型（与 preload/index.ts 保持一致） */

export interface LlmChatRequest {
  baseURL: string
  apiKey: string
  model: string
  temperature?: number
  useJsonMode?: boolean
  messages: { role: string; content: string }[]
  maxTokens?: number
}

export interface LlmChatResponse {
  ok: boolean
  content?: string
  error?: string
  usage?: { promptTokens?: number; completionTokens?: number }
}

declare global {
  interface Window {
    casino: {
      llm: {
        chat: (req: LlmChatRequest) => Promise<LlmChatResponse>
        models: (
          baseURL: string,
          apiKey: string
        ) => Promise<{ ok: boolean; models?: string[]; error?: string }>
      }
      store: {
        load: (key: string) => Promise<unknown>
        save: (key: string, value: unknown) => Promise<void>
      }
      platform: string
    }
  }
}

export {}
