import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

// The Steam-style "achievement unlocked" notice, shown over the game.
//
// Its own small window: transparent, frameless and always on top, but never
// focusable and deaf to the mouse — taking focus from a fullscreen game
// would minimize it. It goes to the bottom-right corner of the display the
// cursor is on (normally the game's: Electron can't see another process's
// windows). Notices queue up and show one after another.
//
// Over a game in *exclusive* fullscreen no window can appear; borderless
// fullscreen (the Unity and Unreal default) works.

export interface AchievementToast {
  apiName: string
  name: Record<string, string> | null
  description: Record<string, string> | null
  iconUrl: string | null
  target: number
}

const WIDTH = 400
const HEIGHT = 120
const MARGIN = 16
// How long one notice owns the window: slide in, stay, slide out (toast.css)
const SHOW_MS = 5600

export class AchievementToastWindow {
  private static instance: AchievementToastWindow
  private window: BrowserWindow | null = null
  private ready: Promise<void> | null = null
  private queue: AchievementToast[] = []
  private busy = false

  public static getInstance(): AchievementToastWindow {
    if (!AchievementToastWindow.instance) {
      AchievementToastWindow.instance = new AchievementToastWindow()
    }
    return AchievementToastWindow.instance
  }

  // Creates the (hidden) window ahead of time, so the first notice of a
  // session doesn't wait for a page load.
  public prepare(): void {
    if (this.window && !this.window.isDestroyed()) return
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        // The unlock chime plays without any click on this window
        autoplayPolicy: 'no-user-gesture-required',
        devTools: is.dev
      }
    })
    // Above fullscreen (borderless) windows, on every desktop
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.setIgnoreMouseEvents(true)
    win.on('closed', () => {
      if (this.window === win) {
        this.window = null
        this.ready = null
      }
    })

    this.ready = new Promise((resolve) => win.webContents.once('did-finish-load', () => resolve()))
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/toast.html`)
    } else {
      win.loadFile(join(__dirname, '../renderer/toast.html'))
    }
    this.window = win
  }

  public show(toast: AchievementToast): void {
    this.queue.push(toast)
    if (!this.busy) void this.next()
  }

  private async next(): Promise<void> {
    const toast = this.queue.shift()
    if (!toast) {
      this.busy = false
      this.window?.hide()
      return
    }
    this.busy = true
    this.prepare()
    const win = this.window!
    await this.ready

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const { x, y, width, height } = display.workArea
    win.setBounds({ x: x + width - WIDTH - MARGIN, y: y + height - HEIGHT - MARGIN, width: WIDTH, height: HEIGHT })
    win.showInactive()
    win.moveTop()
    win.webContents.send('achievement-toast', toast)

    setTimeout(() => void this.next(), SHOW_MS)
  }
}
