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

export interface ImportResult {
  ok: boolean
  url?: string
  name?: string
  error?: string
}

/** 解析后的备份内容（用于选择性导入） */
export interface BackupContent {
  app: string
  version?: number
  exportedAt?: number
  sections?: string[]
  data: Record<string, unknown>
  customFiles?: { name: string; base64: string }[]
}

/** 选择性导入：选哪些模块 + （history 时）选哪些记录 id */
export interface ImportSelection {
  modules: string[]
  historyIds?: string[]
}

export interface TtsModelInfo {
  id: string
  type: 'kokoro' | 'vits'
  sizeMB?: number
  builtin: boolean
  installed: boolean
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
      files: {
        import: (kind: 'image' | 'audio', dir: 'custom' | 'music') => Promise<ImportResult>
        remove: (url: string) => Promise<boolean>
      }
      data: {
        export: (
          sections: ('all' | 'api' | 'personas' | 'history')[]
        ) => Promise<{ ok: boolean; path?: string; error?: string }>
        import: () => Promise<{ ok: boolean; sections?: string[]; error?: string }>
        /** 选择性导入（可选，网页端实现）：先读备份，再按选择应用 */
        readBackup?: () => Promise<{ ok: boolean; backup?: BackupContent; error?: string }>
        applyBackup?: (
          backup: BackupContent,
          selection: ImportSelection
        ) => Promise<{ ok: boolean; imported?: string[]; error?: string }>
      }
      tts: {
        models: () => Promise<TtsModelInfo[]>
        downloadModel: (modelId: string) => Promise<{ ok: boolean; error?: string }>
        cancelDownload: () => Promise<void>
        importModel: () => Promise<{ ok: boolean; id?: string; error?: string }>
        removeModel: (modelId: string) => Promise<boolean>
        load: (modelId: string) => Promise<{ ok: boolean; numSpeakers?: number; error?: string }>
        synthesize: (
          modelId: string,
          text: string,
          sid: number,
          speed: number
        ) => Promise<{ ok: boolean; wavBase64?: string; error?: string }>
        api: (req: {
          baseURL: string
          apiKey: string
          model: string
          voice: string
          input: string
        }) => Promise<{ ok: boolean; audioBase64?: string; mime?: string; error?: string }>
        onDownloadProgress: (
          cb: (p: { modelId: string; received: number; total: number }) => void
        ) => () => void
      }
      platform: string
    }
  }
}

export {}
