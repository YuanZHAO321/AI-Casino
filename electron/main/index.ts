import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { chatCompletion, listModels, LlmRequest } from './llm'
import { load, save } from './storage'

function createWindow(): void {
  const win = new BrowserWindow({
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('llm:chat', (_e, req: LlmRequest) => chatCompletion(req))
  ipcMain.handle('llm:models', (_e, baseURL: string, apiKey: string) => listModels(baseURL, apiKey))
  ipcMain.handle('store:load', (_e, key: string) => load(key))
  ipcMain.handle('store:save', (_e, key: string, value: unknown) => save(key, value))

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
