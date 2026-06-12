import { app, BrowserWindow, ipcMain, shell, protocol } from 'electron'
import { join } from 'path'
import { chatCompletion, listModels as listLlmModels, LlmRequest } from './llm'
import { load, save } from './storage'
import { registerAssetProtocol, importFile, removeAsset, AssetDir } from './files'
import { exportData, importData, ExportSection } from './dataTransfer'
import {
  listModels as listTtsModels, downloadModel, cancelDownload, importLocalModel,
  removeModel, ensureNeuralLoaded, synthesizeNeural, apiTts
} from './tts'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'casino-asset',
    privileges: { standard: false, secure: true, supportFetchAPI: true, stream: true }
  }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'AI Casino',
    backgroundColor: '#0d1f17',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerAssetProtocol()

  // LLM
  ipcMain.handle('llm:chat', (_e, req: LlmRequest) => chatCompletion(req))
  ipcMain.handle('llm:models', (_e, baseURL: string, apiKey: string) => listLlmModels(baseURL, apiKey))

  // 存储
  ipcMain.handle('store:load', (_e, key: string) => load(key))
  ipcMain.handle('store:save', (_e, key: string, value: unknown) => save(key, value))

  // 文件导入（纹理/头像/音乐）
  ipcMain.handle('file:import', (_e, kind: 'image' | 'audio', dir: AssetDir) =>
    importFile(mainWindow, kind, dir)
  )
  ipcMain.handle('file:remove', (_e, url: string) => removeAsset(url))

  // 数据导出/导入（设备间转移，支持全量/部分）
  ipcMain.handle('data:export', (_e, sections: ExportSection[]) =>
    mainWindow ? exportData(mainWindow, sections?.length ? sections : ['all']) : { ok: false, error: 'no window' }
  )
  ipcMain.handle('data:import', () =>
    mainWindow ? importData(mainWindow) : { ok: false, error: 'no window' }
  )

  // TTS
  ipcMain.handle('tts:models', () => listTtsModels())
  ipcMain.handle('tts:download-model', (_e, modelId: string) =>
    mainWindow ? downloadModel(mainWindow, modelId) : { ok: false, error: 'no window' }
  )
  ipcMain.handle('tts:cancel-download', () => cancelDownload())
  ipcMain.handle('tts:import-model', () =>
    mainWindow ? importLocalModel(mainWindow) : { ok: false, error: 'no window' }
  )
  ipcMain.handle('tts:remove-model', (_e, modelId: string) => removeModel(modelId))
  ipcMain.handle('tts:load', (_e, modelId: string) => ensureNeuralLoaded(modelId))
  ipcMain.handle('tts:synthesize', (_e, modelId: string, text: string, sid: number, speed: number) =>
    synthesizeNeural(modelId, text, sid, speed)
  )
  ipcMain.handle(
    'tts:api',
    (_e, req: { baseURL: string; apiKey: string; model: string; voice: string; input: string }) =>
      apiTts(req)
  )

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
