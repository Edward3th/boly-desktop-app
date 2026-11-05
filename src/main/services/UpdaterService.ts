import { autoUpdater } from 'electron-updater'
import { WindowManager } from './WindowManager'

export type UpdateState = {
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error'
  // The version on offer. On 'error' it is set only if the download failed, so
  // the UI can offer a retry; a failed check has nothing to retry and stays quiet.
  version?: string
  percent?: number
  bytesPerSecond?: number
}

export class UpdaterService {
  private static instance: UpdaterService
  private state: UpdateState = { status: 'idle' }

  private constructor() {
    this.configureAutoUpdater()
    this.setupListeners()
  }

  public static getInstance(): UpdaterService {
    if (!UpdaterService.instance) {
      UpdaterService.instance = new UpdaterService()
    }
    return UpdaterService.instance
  }

  private configureAutoUpdater(): void {
    // The user decides when to download. A finished download that they didn't
    // install straight away goes in when they close the app.
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = console
    autoUpdater.allowPrerelease = false
    autoUpdater.forceDevUpdateConfig = true
    autoUpdater.requestHeaders = {
      'User-Agent': 'Boly-Desktop-App'
    }
    autoUpdater.setFeedURL({
      provider: 'github',
      repo: 'boly-desktop-app',
      owner: 'Edward3th',
      private: false
    })
  }

  private setState(state: UpdateState): void {
    this.state = state
    const win = WindowManager.getInstance().getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-state', state)
    }
  }

  private setupListeners(): void {
    autoUpdater.on('update-available', (info) => {
      this.setState({ status: 'available', version: info.version })
    })

    autoUpdater.on('update-not-available', () => {
      this.setState({ status: 'up-to-date' })
    })

    autoUpdater.on('error', (error) => {
      console.error('Update error:', error)
      this.setState({ status: 'error', version: this.state.version })
    })

    autoUpdater.on('download-progress', (progress) => {
      this.setState({
        status: 'downloading',
        version: this.state.version,
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.setState({ status: 'ready', version: info.version })
    })
  }

  public getState(): UpdateState {
    return this.state
  }

  public checkForUpdates(): void {
    if (['checking', 'downloading', 'ready'].includes(this.state.status)) return

    this.setState({ status: 'checking' })
    autoUpdater
      .checkForUpdates()
      .then((result) => {
        // electron-updater skips the check and resolves null when updates don't
        // apply to this run, without firing any of the events above.
        if (!result && this.state.status === 'checking') this.setState({ status: 'idle' })
      })
      // Already reported through the 'error' event.
      .catch(() => {})
  }

  public downloadUpdate(): void {
    const { status, version } = this.state
    if (!version || (status !== 'available' && status !== 'error')) return

    this.setState({ status: 'downloading', version, percent: 0, bytesPerSecond: 0 })
    // Already reported through the 'error' event.
    autoUpdater.downloadUpdate().catch(() => {})
  }

  public applyUpdate(): void {
    autoUpdater.quitAndInstall()
  }

  public getVersion(): string {
    return autoUpdater.currentVersion.version
  }
}
