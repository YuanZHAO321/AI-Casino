import { contextBridge, ipcRenderer } from 'electron'

const api = {
  llm: {
    chat: (req: unknown) => ipcRenderer.invoke('llm:chat', req),
    models: (baseURL: string, apiKey: string) => ipcRenderer.invoke('llm:models', baseURL, apiKey)
  },
  store: {
    load: (key: string) => ipcRenderer.invoke('store:load', key),
    save: (key: string, value: unknown) => ipcRenderer.invoke('store:save', key, value)
  },
  files: {
    import: (kind: 'image' | 'audio', dir: 'custom' | 'music') =>
      ipcRenderer.invoke('file:import', kind, dir),
    remove: (url: string) => ipcRenderer.invoke('file:remove', url)
  },
  data: {
    export: (sections: string[]) => ipcRenderer.invoke('data:export', sections),
    import: () => ipcRenderer.invoke('data:import')
  },
  tts: {
    models: () => ipcRenderer.invoke('tts:models'),
    downloadModel: (modelId: string) => ipcRenderer.invoke('tts:download-model', modelId),
    cancelDownload: () => ipcRenderer.invoke('tts:cancel-download'),
    importModel: () => ipcRenderer.invoke('tts:import-model'),
    removeModel: (modelId: string) => ipcRenderer.invoke('tts:remove-model', modelId),
    load: (modelId: string) => ipcRenderer.invoke('tts:load', modelId),
    synthesize: (modelId: string, text: string, sid: number, speed: number) =>
      ipcRenderer.invoke('tts:synthesize', modelId, text, sid, speed),
    api: (req: unknown) => ipcRenderer.invoke('tts:api', req),
    onDownloadProgress: (cb: (p: { modelId: string; received: number; total: number }) => void) => {
      const listener = (_e: unknown, p: { modelId: string; received: number; total: number }): void => cb(p)
      ipcRenderer.on('tts:download-progress', listener)
      return () => ipcRenderer.removeListener('tts:download-progress', listener)
    }
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('casino', api)

export type CasinoApi = typeof api
