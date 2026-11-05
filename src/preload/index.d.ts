type AppUpdateState = {
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  bytesPerSecond?: number
}

import { ElectronAPI } from '@electron-toolkit/preload'

interface ElectronAPIExtended {
  seleccionarArchivo: () => Promise<string>
  seleccionarCarpeta: () => Promise<string>
  playGame: (appData: any) => Promise<{ success?: boolean; pid?: number; error?: string }>
  downloadGame: (appData: {
    game_id: number
    token: string
    gameName: string
    build_id?: number
    buildKey?: string
    previousRoot?: string
  }) => Promise<any>
  uninstallGame: (appData: {
    game_id: number
    uninstallerPath: string
  }) => Promise<{ success: boolean; message?: string; error?: string }>
  isGameRunning: (gameId: number) => Promise<boolean>
  endGameSession: () => Promise<void>
  searchExeFiles: (baseDir?: string) => Promise<{ files?: string[]; error?: string }>
  listLibraryFolders: () => Promise<{
    folders?: { name: string; root: string; entry: string; kind: 'exe' | 'html'; buildKey?: string }[]
    error?: string
  }>
  windowMinimize: () => Promise<void>
  windowMaximizeToggle: () => Promise<boolean>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  onWindowMaximized: (callback: (isMaximized: boolean) => void) => void
  apiRequest: (options: {
    method: string
    path: string
    data?: any
    headers?: Record<string, string>
  }) => Promise<any>
  onDeepLinkUrl: (callback: (url: string) => void) => void
  getUpdateState: () => Promise<AppUpdateState>
  onUpdateState: (callback: (state: AppUpdateState) => void) => void
  checkUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  // False when a game is running: installing would close it.
  applyUpdate: () => Promise<boolean>
  getVersion: () => Promise<string>
  onDownloadStarted: (callback: (data: any) => void) => void
  onDownloadProgress: (callback: (data: any) => void) => void
  onDownloadComplete: (callback: (data: any) => void) => void
  onDownloadError: (callback: (data: any) => void) => void
  onInstallStarted: (callback: (data: any) => void) => void
  onInstallError: (callback: (data: any) => void) => void
  onInstallComplete: (callback: (data: any) => void) => void
  onGameStarted: (callback: (data: any) => void) => void
  onGameStopped: (callback: (data: any) => void) => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    electronAPI: ElectronAPIExtended
  }
}
