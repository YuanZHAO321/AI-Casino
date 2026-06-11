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
  platform: process.platform
}

contextBridge.exposeInMainWorld('casino', api)

export type CasinoApi = typeof api
