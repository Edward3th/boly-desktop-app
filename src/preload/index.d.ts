import { ElectronAPI } from '@electron-toolkit/preload'

interface ElectronAPIExtended {
  seleccionarArchivo: () => Promise<string>
  seleccionarCarpeta: () => Promise<string>
  instalarDesdeZip: (rutaExe: string, rutaDestion: string) => Promise<any>
  playGame: (appData: any) => Promise<{ success?: boolean; pid?: number; error?: string }>
  downloadGame: (appData: { game_id: number; token: string; gameName: string }) => Promise<any>
  uninstallGame: (appData: {
    game_id: number
    uninstallerPath: string
  }) => Promise<{ success: boolean; message?: string; error?: string }>
  isGameRunning: (gameId: number) => Promise<boolean>
  searchExeFiles: (baseDir?: string) => Promise<{ files?: string[]; error?: string }>
  listLibraryFolders: () => Promise<{
    folders?: { name: string; root: string; entry: string; kind: 'exe' | 'html' }[]
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
  updateMessage: (callback: (message: string) => void) => void
  onUpdateProgress: (
    callback: (data: {
      bytesPerSecond: number
      percent: number
      transferred: number
      total: number
    }) => void
  ) => void
  applyUpdate: () => Promise<void>
  checkUpdates: () => Promise<string>
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
