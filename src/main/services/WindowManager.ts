import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'

export class WindowManager {
  private static instance: WindowManager
  public mainWindow: BrowserWindow | null = null

  private constructor() {
    // Singleton pattern
  }

  public static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager()
    }
    return WindowManager.instance
  }

  public createWindow(): void {
    // Create the browser window.
    this.mainWindow = new BrowserWindow({
      width: 1920,
      height: 1080,
      show: false,
      frame: false,
      autoHideMenuBar: true,
      backgroundColor: '#FF8A3D',
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        nodeIntegration: true,
        contextIsolation: true,
        devTools: is.dev
      }
    })

    // Closing the main window quits Boly: helper windows (the hidden
    // achievement notice, browser games) must not keep a windowless app alive.
    const win = this.mainWindow
    win.on('closed', () => {
      if (this.mainWindow === win) this.mainWindow = null
      if (process.platform !== 'darwin') app.quit()
    })

    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.webContents.openDevTools()
      this.mainWindow?.show()
    })

    // Notify the renderer so the custom title-bar can swap its maximize/restore icon
    this.mainWindow.on('maximize', () => this.send('window-maximized'))
    this.mainWindow.on('unmaximize', () => this.send('window-unmaximized'))

    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
      // Handle navigation events to ensure proper routing in production
      this.mainWindow.webContents.on('did-finish-load', () => {
        // Check for and handle any pending deep link URLs
        if (process.env.PENDING_DEEP_LINK_URL) {
          const url = process.env.PENDING_DEEP_LINK_URL
          this.send('deep-link-url', url)
          delete process.env.PENDING_DEEP_LINK_URL
        }
        this.mainWindow?.show()
      })
    }
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null
  }

  public send(channel: string, ...args: any[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args)
    }
  }

  public loadURL(url: string): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.loadURL(url)
    }
  }

  public async executeJavaScript(code: string): Promise<any> {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow.webContents.executeJavaScript(code)
    }
    return null
  }
}
