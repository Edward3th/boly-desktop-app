// filepath: c:\Users\tiago\Documents\BolyDesk0\Boly\src\renderer\src\types\electron-api.d.ts
/**
 * Type definitions for Electron API
 */
interface ElectronAPIExtended {
  seleccionarArchivo: () => Promise<string>
  seleccionarCarpeta: () => Promise<string>
  playGame: (appData: {
    game_id: number
    appPath: string
    token: string
  }) => Promise<{ success?: boolean; pid?: number; error?: string }>
  uninstallGame: (appData: {
    game_id: number
    uninstallerPath: string
  }) => Promise<{ success: boolean; message?: string; error?: string }>
  /**
   * Opens an installed browser-style build in its own window — the same
   * shape as playGame, but for a build with no executable to spawn. Paths
   * are validated in the main process against the real games library before
   * anything becomes servable.
   */
  playLocalGame: (appData: {
    game_id: number
    root: string
    entryPath: string
    token: string
    gameName?: string
  }) => Promise<{ success?: boolean; error?: string }>
  /** Closes the open game (native or browser-style) and records its final playtime. */
  endGameSession: () => Promise<void>
  isGameRunning: (gameId: number) => Promise<boolean>
  /**
   * buildKey is recorded in the install folder; previousRoot is the folder of
   * the build being replaced, deleted once the new one is in place.
   */
  downloadGame: (appData: {
    game_id: number
    token: string
    gameName: string
    build_id?: number
    buildKey?: string
    previousRoot?: string
  }) => Promise<void>

  // Custom title-bar window controls
  windowMinimize: () => Promise<void>
  windowMaximizeToggle: () => Promise<boolean>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  onWindowMaximized: (callback: (isMaximized: boolean) => void) => void
  searchExeFiles: (baseDir?: string) => Promise<{ files?: string[]; error?: string }>
  /**
   * Each game folder in the library with what launching it means (its .exe,
   * or its index.html) — how the library tells which installs are on disk.
   */
  listLibraryFolders: () => Promise<{
    folders?: { name: string; root: string; entry: string; kind: 'exe' | 'html'; buildKey?: string }[]
    error?: string
  }>
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

  // Download event listeners
  onDownloadStarted: (callback: (data: { gameId: number; gameName: string }) => void) => void
  onDownloadProgress: (
    callback: (data: {
      gameId: number
      progress: number
      downloaded: number
      total: number
    }) => void
  ) => void
  onDownloadComplete: (callback: (data: { gameId: number; installPath: string }) => void) => void
  onDownloadError: (callback: (data: { gameId: number; error: string }) => void) => void
  onInstallStarted: (callback: (data: { gameId: number; installPath: string }) => void) => void
  onInstallError: (callback: (data: { gameId: number; error: string }) => void) => void
  onInstallComplete: (
    callback: (data: {
      gameId: number
      /** What launching needs: the .exe, or the build's index.html. */
      installPath: string
      /** Folder the build was extracted into; what uninstalling deletes. */
      installRoot?: string
      kind?: 'exe' | 'html'
    }) => void
  ) => void
  onGameStarted: (callback: (data: { gameId: number; pid: number }) => void) => void
  onGameStopped: (callback: (data: { gameId: number }) => void) => void

  // Cleanup listeners
  removeAllListeners: (channel: string) => void
}

interface Window {
  electronAPI: ElectronAPIExtended
}
