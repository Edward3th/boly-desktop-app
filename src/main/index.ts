/* eslint-disable @typescript-eslint/no-require-imports */
import { app, ipcMain, dialog, session } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { WindowManager } from './services/WindowManager'
import { AuthService } from './services/AuthService'
import { InstallerService } from './services/InstallerService'
import GameService from './services/GameService'
import { UpdaterService } from './services/UpdaterService'
import { LocalGameServer } from './services/LocalGameServer'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
require('dotenv').config()

// Privileges have to be declared before the protocol layer starts, which
// happens on app ready — this cannot move into whenReady().
LocalGameServer.registerScheme()

// Initialize singleton services
const windowManager = WindowManager.getInstance()
const authService = AuthService.getInstance()
const installerService = InstallerService.getInstance()
const gameService = GameService.getInstance()
const updaterService = UpdaterService.getInstance()
const localGameServer = LocalGameServer.getInstance()

// Handle single instance
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const mainWindow = windowManager.getMainWindow()
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    } else if (app.isReady()) {
      windowManager.createWindow()
    }
    const deepLinkUrl = argv.find(
      (arg) => arg.startsWith('boly-app://') || arg.startsWith('boly://')
    )
    if (deepLinkUrl) {
      windowManager.send('deep-link-url', deepLinkUrl)
    }
  })
}

// Protocol registration
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('boly-app', process.execPath, [path.resolve(process.argv[1])])
    app.setAsDefaultProtocolClient('boly', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('boly-app')
  app.setAsDefaultProtocolClient('boly')
}

// IPC Handlers
function registerIpcHandlers() {
  // Note: login-with-google removed as requested

  ipcMain.handle('get-version', () => updaterService.getVersion())

  ipcMain.handle('get-current-token', () =>
    windowManager.executeJavaScript('localStorage.getItem("token")')
  )

  ipcMain.handle('close-app', () => app.quit())

  // Custom title-bar window controls
  ipcMain.handle('window-minimize', () => windowManager.getMainWindow()?.minimize())
  ipcMain.handle('window-maximize-toggle', () => {
    const win = windowManager.getMainWindow()
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
      return false
    }
    win.maximize()
    return true
  })
  ipcMain.handle('window-close', () => windowManager.getMainWindow()?.close())
  ipcMain.handle('window-is-maximized', () => windowManager.getMainWindow()?.isMaximized() ?? false)

  ipcMain.handle('is-game-running', (_event, gameId) => gameService.isActive(gameId))

  ipcMain.handle('check-updates', () => {
    updaterService.checkForUpdates()
    return 'Checking for updates...'
  })

  ipcMain.handle('apply-update', () => {
    updaterService.applyUpdate()
  })

  // API Proxy
  ipcMain.handle('api-request', async (_event, options) => {
    try {
      const { method, path, data, headers } = options
      // @ts-ignore
      const apiBaseUrl = import.meta.env.VITE_APP_API_URL
      const url = `${apiBaseUrl}${path}`
      const response = await axios({ url, method, data, headers })
      return response.data
    } catch (error: any) {
      console.error('API request error:', error)
      return {
        error: true,
        status: error.response?.status,
        message: error.message,
        data: error.response?.data
      }
    }
  })

  ipcMain.handle('search-exe-files', async (_event, baseDir) => {
    try {
      if (baseDir) {
        if (!fs.existsSync(baseDir)) return { error: `Directory does not exist: ${baseDir}` }
        return { files: installerService.searchForExecutablesRecursive(baseDir) }
      }
      const legacyPath = path.join(app.getPath('documents'), 'My Games')
      const newLibraryPath = installerService.getLibraryPath()
      const pathsToSearch = [newLibraryPath]
      if (legacyPath !== newLibraryPath && fs.existsSync(legacyPath)) {
        pathsToSearch.push(legacyPath)
      }
      const allExeFiles: string[] = []
      for (const searchDir of pathsToSearch) {
        if (fs.existsSync(searchDir)) {
          console.log(`Searching for games in: ${searchDir}`)
          const files = installerService.searchForExecutablesRecursive(searchDir)
          files.forEach((file) => {
            if (!allExeFiles.includes(file)) allExeFiles.push(file)
          })
        }
      }
      return { files: allExeFiles }
    } catch (error) {
      console.error('Error searching for executable files:', error)
      return { error: (error as Error).message }
    }
  })

  ipcMain.handle('list-library-folders', async () => {
    try {
      return { folders: installerService.listLibraryFolders() }
    } catch (error) {
      console.error('Error listing library folders:', error)
      return { error: (error as Error).message }
    }
  })

  ipcMain.handle('seleccionar-archivo', async () => {
    try {
      const result = await dialog.showOpenDialog({ properties: ['openFile'] })
      return result.filePaths[0]
    } catch (error) {
      console.error('Error selecting file:', error)
      return null
    }
  })

  ipcMain.handle('seleccionar-carpeta', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.filePaths[0]
  })

  ipcMain.handle('instalar-desde-zip', async (rutaExe, rutaDestino) => {
    // Logic was effectively exec command in original file
    require('child_process').exec(
      `"${rutaExe}" /DIR="${rutaDestino}" /SILENT`,
      (err: any, stdout: any) => {
        if (err) console.error('Error:', err.message)
        else console.log('Resultado:', stdout)
      }
    )
    return true
  })

  ipcMain.handle('download-game', async (_event, appData) => {
    const { game_id, token, gameName, build_id } = appData
    return installerService.downloadTempFile(token, game_id, gameName, build_id)
  })

  ipcMain.handle('play-game', async (_event, appData) => {
    console.log('Play game event triggered')
    return gameService.playGame(appData)
  })

  ipcMain.handle('uninstall-game', async (_event, appData) => {
    localGameServer.unregister(appData.game_id)
    return installerService.uninstallGame(appData.game_id, appData.uninstallerPath)
  })

  // Opens an installed browser-style build in its own window, the same way
  // play-game opens a native .exe in its own process. The renderer owns the
  // install registry, so it supplies the paths; LocalGameServer validates
  // them against the real games library before anything is served.
  ipcMain.handle('play-local-game', async (_event, appData) => {
    return gameService.playLocalGame(appData)
  })

  // Test IPC
  ipcMain.on('ping', () => console.log('pong'))
}

// App Lifecycle
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  // Before any window exists, so the first navigation can already resolve
  // boly-game:// requests.
  localGameServer.start()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register Handlers
  registerIpcHandlers()

  // Create Window
  windowManager.createWindow()

  // Intercept requests to YouTube to fix playback errors (152, 153 etc)
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
    (details, callback) => {
      // Set Referer to allow restricted videos
      // detailed explanation: 'https://www.youtube.com/' can cause "embedder.identity.denied"
      // because the player detects it's an embed but the referer claims it's the main site.
      // Using a generic trusted domain like google.com or a valid localhost often works better.
      details.requestHeaders['Referer'] = 'https://www.google.com/'

      // Spoof User-Agent to remove "Electron/" which is often blocked or restricted
      details.requestHeaders['User-Agent'] =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

      // Error 152 Fix: Do NOT spoof Origin as youtube.com.
      // The mismatch between the header and the actual window location triggers the error.
      // Removing the Origin header entirely is often the most compatible approach for Electron.
      if (details.requestHeaders['Origin']) {
        delete details.requestHeaders['Origin']
      }

      // Add Sec-Fetch headers to simulate a legitimate embedded request
      // These help the server validate the "identity" of the requester
      details.requestHeaders['Sec-Fetch-Dest'] = 'iframe'
      details.requestHeaders['Sec-Fetch-Mode'] = 'navigate'
      details.requestHeaders['Sec-Fetch-Site'] = 'cross-site'

      callback({ cancel: false, requestHeaders: details.requestHeaders })
    }
  )

  // Initial version check
  try {
    const win = windowManager.getMainWindow()
    if (win) {
      const version = updaterService.getVersion()
      console.log('Current version:', version)
      win.webContents.send('get-version', version)
    }
  } catch (error) {
    console.error('Error in update setup:', error)
  }

  // Listen for session invalidation to cleanup games
  authService.on('session-invalidated', async () => {
    console.log('Session invalidated event received. Cleaning up games.')
    await gameService.cleanupActiveGameSession()
    await gameService.cleanupActiveLocalGameSession()
  })

  const win = windowManager.getMainWindow()
  if (win) {
    win.on('ready-to-show', () => {
      authService.startSessionMonitoring()
    })
  }
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  if (url.startsWith('boly-app://') || url.startsWith('boly://')) {
    const win = windowManager.getMainWindow()
    if (win && !win.isDestroyed()) {
      windowManager.send('deep-link-url', url)
    } else {
      process.env.PENDING_DEEP_LINK_URL = url
    }
  }
})

app.on('window-all-closed', async () => {
  console.log('Main window closed, cleaning up active game sessions...')
  await gameService.cleanupActiveGameSession()
  await gameService.cleanupActiveLocalGameSession()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async (event) => {
  if (gameService.hasActiveSession()) {
    console.log('App quitting with active game session, cleaning up...')
    event.preventDefault()
    await gameService.cleanupActiveGameSession()
    await gameService.cleanupActiveLocalGameSession()

    // Stop session monitoring
    authService.stopSessionMonitoring()

    app.quit()
  } else {
    authService.stopSessionMonitoring()
  }
})
