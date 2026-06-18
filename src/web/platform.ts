/**
 * 浏览器版 window.casino 适配器。组装 idb/llm/assets/data/tts 各模块为与
 * electron/preload 同构的 API，并安装到 window。仅在 Electron 桥不存在时安装，
 * 避免覆盖桌面版（src/ 全部经 window.casino 访问平台能力，无需改动）。
 */
import { idbGet, idbSet } from './idb'
import { chatCompletion, listModels } from './llm'
import { importFile, removeFile, type AssetDir } from './assets'
import { exportData, importData, type ExportSection } from './data'
import * as tts from './tts'
import type { LlmChatRequest } from '../../electron/preload/api.d'

export function installWebPlatform(): void {
  if (typeof window === 'undefined' || window.casino) return

  window.casino = {
    llm: {
      chat: (req) => chatCompletion(req as LlmChatRequest),
      models: (baseURL, apiKey) => listModels(baseURL, apiKey)
    },
    store: {
      load: (key) => idbGet(key),
      save: (key, value) => idbSet(key, value)
    },
    files: {
      import: (kind, dir) => importFile(kind, dir as AssetDir),
      remove: (url) => removeFile(url)
    },
    data: {
      export: (sections) => exportData(sections as ExportSection[]),
      import: () => importData()
    },
    tts: {
      models: () => tts.listModels(),
      downloadModel: () => tts.downloadModel(),
      cancelDownload: () => tts.cancelDownload(),
      importModel: () => tts.importModel(),
      removeModel: () => tts.removeModel(),
      load: () => tts.load(),
      synthesize: () => tts.synthesize(),
      api: (req) => tts.apiTts(req),
      onDownloadProgress: () => tts.onDownloadProgress()
    },
    platform: 'web'
  }
}
