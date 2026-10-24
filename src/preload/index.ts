/* eslint-disable @typescript-eslint/no-require-imports */
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
//import { on } from 'events';
// @ts-ignore (define in dts)
window.ipcRenderer = require('electron').ipcRenderer

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
console.log('contextIsolated: ' + process.contextIsolated)
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('electronAPI', {
      seleccionarArchivo: () => ipcRenderer.invoke('seleccionar-archivo'),
      seleccionarCarpeta: () => ipcRenderer.invoke('seleccionar-carpeta'),
      instalarDesdeZip: (rutaExe, rutaDestion) =>
        ipcRenderer.invoke('instalar-desde-zip', rutaExe, rutaDestion),
      playGame: (appData) => ipcRenderer.invoke('play-game', appData),
      downloadGame: (appData) => ipcRenderer.invoke('download-game', appData),
      uninstallGame: (appData) => ipcRenderer.invoke('uninstall-game', appData),
      playLocalGame: (appData) => ipcRenderer.invoke('play-local-game', appData),
      isGameRunning: (gameId) => ipcRenderer.invoke('is-game-running', gameId),
      windowMinimize: () => ipcRenderer.invoke('window-minimize'),
      windowMaximizeToggle: () => ipcRenderer.invoke('window-maximize-toggle'),
      windowClose: () => ipcRenderer.invoke('window-close'),
      windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
      onWindowMaximized: (callback) => {
        ipcRenderer.on('window-maximized', () => callback(true))
        ipcRenderer.on('window-unmaximized', () => callback(false))
      },
      searchExeFiles: (baseDir) => ipcRenderer.invoke('search-exe-files', baseDir),
      listLibraryFolders: () => ipcRenderer.invoke('list-library-folders'),
      apiRequest: (options) => ipcRenderer.invoke('api-request', options),
      checkUpdates: () => ipcRenderer.invoke('check-updates'),
      getVersion: () => ipcRenderer.invoke('get-version'),
      onDeepLinkUrl: (callback) => {
        ipcRenderer.on('deep-link-url', (_event, url) => callback(url))
      },
      updateMessage: (callback) => {
        ipcRenderer.on('update-message', (_event, ...args) => callback(...args))
      },
      onUpdateProgress: (callback) => {
        ipcRenderer.on('update-progress', (_event, ...args) => callback(...args))
      },
      applyUpdate: () => ipcRenderer.invoke('apply-update'),
      onDownloadStarted: (callback) => {
        ipcRenderer.on('download-started', (_event, ...args) => callback(...args))
      },
      onDownloadProgress: (callback) => {
        ipcRenderer.on('download-progress', (_event, ...args) => callback(...args))
      },
      onDownloadComplete: (callback) => {
        ipcRenderer.on('download-complete', (_event, ...args) => callback(...args))
      },
      onDownloadError: (callback) => {
        ipcRenderer.on('download-error', (_event, ...args) => callback(...args))
      },
      onInstallStarted: (callback) => {
        ipcRenderer.on('install-started', (_event, ...args) => callback(...args))
      },
      onInstallError: (callback) => {
        ipcRenderer.on('install-error', (_event, ...args) => callback(...args))
      },
      onInstallComplete: (callback) => {
        ipcRenderer.on('install-complete', (_event, ...args) => callback(...args))
      },
      onGameStarted: (callback) => {
        ipcRenderer.on('game-started', (_event, ...args) => callback(...args))
      },
      onGameStopped: (callback) => {
        ipcRenderer.on('game-stopped', (_event, ...args) => callback(...args))
      },
      removeAllListeners: (channel) => {
        if (
          [
            'download-started',
            'download-progress',
            'download-complete',
            'download-error',
            'install-started',
            'install-error',
            'install-complete',
            'game-started',
            'game-stopped'
          ].includes(channel)
        ) {
          ipcRenderer.removeAllListeners(channel)
        }
      }
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.electronAPI = {
    seleccionarArchivo: () => ipcRenderer.invoke('seleccionar-archivo'),
    seleccionarCarpeta: () => ipcRenderer.invoke('seleccionar-carpeta'),
    instalarDesdeZip: (rutaExe, rutaDestion) =>
      ipcRenderer.invoke('instalar-desde-zip', rutaExe, rutaDestion),
    playGame: (appData) => ipcRenderer.invoke('play-game', appData),
    downloadGame: (appData) => ipcRenderer.invoke('download-game', appData),
    uninstallGame: (appData) => ipcRenderer.invoke('uninstall-game', appData),
    playLocalGame: (appData) => ipcRenderer.invoke('play-local-game', appData),
    isGameRunning: (gameId) => ipcRenderer.invoke('is-game-running', gameId),
    windowMinimize: () => ipcRenderer.invoke('window-minimize'),
    windowMaximizeToggle: () => ipcRenderer.invoke('window-maximize-toggle'),
    windowClose: () => ipcRenderer.invoke('window-close'),
    windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    onWindowMaximized: (callback) => {
      ipcRenderer.on('window-maximized', () => callback(true))
      ipcRenderer.on('window-unmaximized', () => callback(false))
    },
    searchExeFiles: (baseDir) => ipcRenderer.invoke('search-exe-files', baseDir),
    listLibraryFolders: () => ipcRenderer.invoke('list-library-folders'),
    apiRequest: (options) => ipcRenderer.invoke('api-request', options),
    checkUpdates: () => ipcRenderer.invoke('check-updates'),
    getVersion: () => ipcRenderer.invoke('get-version'), // Added proper method to get version
    onDeepLinkUrl: (callback) => {
      ipcRenderer.on('deep-link-url', (_event, url) => callback(url))
    },
    updateMessage: (callback) => {
      ipcRenderer.on('update-message', (_event, ...args) => callback(...args))
    },
    onUpdateProgress: (callback) => {
      ipcRenderer.on('update-progress', (_event, ...args) => callback(...args))
    },
    applyUpdate: () => ipcRenderer.invoke('apply-update'),
    onDownloadStarted: (callback) => {
      ipcRenderer.on('download-started', (_event, ...args) => callback(...args))
    },
    onDownloadProgress: (callback) => {
      ipcRenderer.on('download-progress', (_event, ...args) => callback(...args))
    },
    onDownloadComplete: (callback) => {
      ipcRenderer.on('download-complete', (_event, ...args) => callback(...args))
    },
    onDownloadError: (callback) => {
      ipcRenderer.on('download-error', (_event, ...args) => callback(...args))
    },
    onInstallStarted: (callback) => {
      ipcRenderer.on('install-started', (_event, ...args) => callback(...args))
    },
    onInstallError: (callback) => {
      ipcRenderer.on('install-error', (_event, ...args) => callback(...args))
    },
    onInstallComplete: (callback) => {
      ipcRenderer.on('install-complete', (_event, ...args) => callback(...args))
    },
    onGameStarted: (callback) => {
      ipcRenderer.on('game-started', (_event, ...args) => callback(...args))
    },
    onGameStopped: (callback) => {
      ipcRenderer.on('game-stopped', (_event, ...args) => callback(...args))
    },
    removeAllListeners: (channel) => {
      if (
        [
          'download-started',
          'download-progress',
          'download-complete',
          'download-error',
          'install-started',
          'install-error',
          'install-complete',
          'game-started',
          'game-stopped'
        ].includes(channel)
      ) {
        ipcRenderer.removeAllListeners(channel)
      }
    }
  }
}
