import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { exec } from 'child_process'
import extract from 'extract-zip'
import { WindowManager } from './WindowManager'
import { removeAchievementManifest } from './buildManifest'

export class InstallerService {
  private static instance: InstallerService

  private constructor() {
    // Singleton pattern
  }

  public static getInstance(): InstallerService {
    if (!InstallerService.instance) {
      InstallerService.instance = new InstallerService()
    }
    return InstallerService.instance
  }

  public getLibraryPath(): string {
    const appName = 'Boly'
    let libraryRoot = ''

    if (process.platform === 'win32') {
      libraryRoot = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local')
    } else {
      libraryRoot = app.getPath('appData')
    }

    const libPath = path.join(libraryRoot, appName, 'Games')

    if (!fs.existsSync(libPath)) {
      try {
        fs.mkdirSync(libPath, { recursive: true })
      } catch (e) {
        console.error('Failed to create library path:', e)
      }
    }
    return libPath
  }

  public async downloadTempFile(token: string, game_id: number, gameName: string, build_id?: number): Promise<any> {
    // build_id previews a specific (possibly still-pending) build for review
    // instead of the game's live one — see Game.controller.ts's getUrl.
    const req = { token, game_id, is_web: false, ...(build_id != null ? { build_id } : {}) }
    const file_game_id = game_id
    try {
      WindowManager.getInstance().send('download-started', {
        gameId: file_game_id,
        gameName: gameName
      })

      // @ts-ignore
      const apiBaseUrl = import.meta.env.VITE_APP_API_URL
      const responseUrl = await axios.post(`${apiBaseUrl}/v1/games/url`, req, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!responseUrl.data) {
        WindowManager.getInstance().send('download-error', {
          gameId: file_game_id,
          error: 'Failed to get download URL'
        })
        return
      }

      // Legacy games are Inno Setup installers (exe); dev-uploaded builds are
      // plain zips. The API reports which via file_type; the URL-path check
      // covers older API deployments that don't send it yet.
      let fileType: 'zip' | 'exe' = responseUrl.data.file_type === 'zip' ? 'zip' : 'exe'
      if (!responseUrl.data.file_type) {
        try {
          if (new URL(responseUrl.data.url).pathname.toLowerCase().endsWith('.zip')) {
            fileType = 'zip'
          }
        } catch {
          // keep exe default
        }
      }

      const tempPath = path.join(app.getPath('temp'), `descarga_${Date.now()}.${fileType}`)
      const writer = fs.createWriteStream(tempPath)
      console.log('temp path: ' + tempPath)

      const response = await axios({
        method: 'get',
        url: responseUrl.data.url,
        responseType: 'stream'
      })
      const totalLength = parseInt(response.headers['content-length'] || '0', 10)

      let downloaded = 0
      let lastProgressUpdate = Date.now()
      const UPDATE_INTERVAL = 100

      response.data.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        const percent = (downloaded / totalLength) * 100
        process.stdout.write(`\r📥 Descargando... ${percent.toFixed(2)}%`)

        const now = Date.now()
        if (now - lastProgressUpdate > UPDATE_INTERVAL) {
          lastProgressUpdate = now
          WindowManager.getInstance().send('download-progress', {
            gameId: file_game_id,
            progress: percent,
            downloaded: downloaded,
            total: totalLength
          })
        }
      })

      // The renderer's library rescan recovers installs by this folder name
      // (installFolderName in gameRoutes.ts) — keep the two in step.
      const gameNameNoSymbols = gameName.replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, '')
      return new Promise((resolve, reject) => {
        response.data.pipe(writer)
        writer.on('finish', () => {
          const gamePath = path.join(this.getLibraryPath(), `${gameNameNoSymbols}`)
          WindowManager.getInstance().send('download-complete', {
            gameId: file_game_id,
            installPath: gamePath
          })

          if (fileType === 'zip') {
            this.installGameFromZip(tempPath, gamePath, file_game_id)
          } else {
            this.installGame(tempPath, gamePath, file_game_id)
          }
          resolve(tempPath)
        })
        writer.on('error', (err) => {
          WindowManager.getInstance().send('download-error', {
            gameId: file_game_id,
            error: err.message
          })
          reject(err)
        })
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      WindowManager.getInstance().send('download-error', {
        gameId: file_game_id,
        error: errorMessage
      })
      console.error('Download error:', errorMessage)
      throw error
    }
  }

  public deleteFile(filePath: string): void {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error al eliminar el archivo:', err)
      } else {
        console.log('Archivo eliminado:', filePath)
      }
    })
  }

  public async installGame(
    installerRoute: string,
    destinationRoute: string,
    game_id: number
  ): Promise<any> {
    try {
      WindowManager.getInstance().send('install-started', {
        gameId: game_id,
        installPath: destinationRoute
      })
      const command = `"${installerRoute}" /DIR="${destinationRoute}" /SILENT`
      console.log(command)
      exec(command, (err, stdout) => {
        if (err) {
          console.error('Error:', err.message)
          WindowManager.getInstance().send('install-error', {
            gameId: game_id,
            error: err.message,
            installPath: destinationRoute
          })
        } else {
          console.log('Resultado:', stdout)
          const exeFiles = this.searchForExecutablesRecursive(destinationRoute)
          console.log('Found executable files:', exeFiles)

          if (exeFiles.length === 0) {
            // Downloaded file is a standalone exe, not an Inno Setup installer — copy it directly
            console.log('No files installed — treating download as standalone exe, copying to destination')
            if (!fs.existsSync(destinationRoute)) {
              fs.mkdirSync(destinationRoute, { recursive: true })
            }
            const gameFolderName = path.basename(destinationRoute)
            const destExePath = path.join(destinationRoute, `${gameFolderName}.exe`)
            try {
              fs.copyFileSync(installerRoute, destExePath)
              this.deleteFile(installerRoute)
              WindowManager.getInstance().send('install-complete', {
                gameId: game_id,
                installPath: destExePath,
                installRoot: destinationRoute,
                kind: 'exe'
              })
            } catch (copyErr) {
              console.error('Failed to copy standalone exe:', copyErr)
              WindowManager.getInstance().send('install-error', {
                gameId: game_id,
                error: String(copyErr),
                installPath: destinationRoute
              })
            }
            return
          }

          this.deleteFile(installerRoute)

          const gameExeFiles = exeFiles.filter((filePath) => {
            const fileName = path.basename(filePath).toLowerCase()
            return (
              !fileName.startsWith('unins') &&
              !fileName.includes('crash') &&
              !fileName.includes('setup') &&
              !fileName.includes('install') &&
              !fileName.includes('update')
            )
          })

          console.log('Filtered game executable files:', gameExeFiles)
          const exePath =
            gameExeFiles.length > 0
              ? gameExeFiles[0]
              : exeFiles[0]

          WindowManager.getInstance().send('install-complete', {
            gameId: game_id,
            installPath: exePath,
            installRoot: destinationRoute,
            kind: 'exe'
          })
        }
      })
      return true
    } catch (error) {
      const err = error as Error
      return [`Error: ${err.message}`]
    }
  }

  // Dev-uploaded builds: a plain zip of the game folder. Extract it into the
  // games library, then work out how the app is meant to run it.
  //
  // Two shapes are supported, matching what the API accepts on upload:
  //   - an executable  -> spawned as a process (kind 'exe')
  //   - an index.html  -> opened in the app's player (kind 'html')
  // An executable wins when a build somehow ships both, so a desktop game that
  // also bundles web content keeps behaving as a desktop game.
  //
  // install-complete carries installRoot as well as installPath: the path is
  // what launching needs, the root is the folder uninstalling has to delete,
  // and for a nested index.html those are not the same directory.
  public async installGameFromZip(
    zipPath: string,
    destinationRoute: string,
    game_id: number
  ): Promise<any> {
    try {
      WindowManager.getInstance().send('install-started', {
        gameId: game_id,
        installPath: destinationRoute
      })

      // Extract into a staging folder and only then swap it in. Extracting
      // straight over the previous install merged the two builds: extract-zip
      // overwrites same-named files but leaves everything the new build
      // renamed or dropped, so the exe search below could pick up the OLD
      // executable while the data files around it were the new ones.
      // Staging also means a failed extraction leaves the working install
      // untouched instead of destroying it.
      const stagingRoute = `${destinationRoute}.incoming`
      if (fs.existsSync(stagingRoute)) {
        fs.rmSync(stagingRoute, { recursive: true, force: true })
      }
      fs.mkdirSync(stagingRoute, { recursive: true })

      await extract(zipPath, { dir: stagingRoute })
      this.deleteFile(zipPath)

      // boly/achievements.json is for Boly, not the player (it names hidden
      // achievements): drop it before the build goes live.
      const removedManifests = removeAchievementManifest(stagingRoute)
      if (removedManifests.length > 0) console.log('Removed achievement manifest from the build:', removedManifests)

      if (fs.existsSync(destinationRoute)) {
        fs.rmSync(destinationRoute, { recursive: true, force: true })
      }
      fs.renameSync(stagingRoute, destinationRoute)

      const entry = this.resolveBuildEntry(destinationRoute)
      if (entry) {
        console.log(`Installed ${entry.kind} build, entry point:`, entry.path)
        WindowManager.getInstance().send('install-complete', {
          gameId: game_id,
          installPath: entry.path,
          installRoot: destinationRoute,
          kind: entry.kind
        })
        return true
      }

      WindowManager.getInstance().send('install-error', {
        gameId: game_id,
        error: 'No executable or index.html found in the extracted build',
        installPath: destinationRoute
      })
      return false
    } catch (error) {
      const err = error as Error
      console.error('Zip install error:', err.message)
      // Don't leave a half-extracted staging folder behind (these are GBs).
      try {
        const stagingRoute = `${destinationRoute}.incoming`
        if (fs.existsSync(stagingRoute)) {
          fs.rmSync(stagingRoute, { recursive: true, force: true })
        }
      } catch (cleanupErr) {
        console.error('Failed to clean up staging folder:', cleanupErr)
      }
      WindowManager.getInstance().send('install-error', {
        gameId: game_id,
        error: err.message,
        installPath: destinationRoute
      })
      return false
    }
  }

  // What launching an extracted zip build means: its executable, or failing
  // that its index.html. Shared by the install itself and the library rescan
  // so a rediscovered install launches exactly what the original one did.
  public resolveBuildEntry(root: string): { path: string; kind: 'exe' | 'html' } | null {
    const exeFiles = this.searchForExecutablesRecursive(root)
    const gameExeFiles = exeFiles.filter((filePath) => {
      const fileName = path.basename(filePath).toLowerCase()
      return (
        !fileName.startsWith('unins') &&
        !fileName.includes('crash') &&
        !fileName.includes('setup') &&
        !fileName.includes('install') &&
        !fileName.includes('update')
      )
    })

    const exePath = gameExeFiles[0] ?? exeFiles[0]
    if (exePath) return { path: exePath, kind: 'exe' }

    const entryPoint = this.findEntryPointHtml(root)
    return entryPoint ? { path: entryPoint.path, kind: 'html' } : null
  }

  // Every game folder in the library with what launching it means. Lets the
  // renderer check that a recorded install is still on disk, and recover
  // installs it has no record of: zip builds can't be matched by executable
  // name (their file_name.desktop is an S3 key, not an .exe), only by the
  // folder downloadTempFile named after the game.
  public listLibraryFolders(): { name: string; root: string; entry: string; kind: 'exe' | 'html' }[] {
    const libraryPath = this.getLibraryPath()
    const folders: { name: string; root: string; entry: string; kind: 'exe' | 'html' }[] = []
    for (const dirent of fs.readdirSync(libraryPath, { withFileTypes: true })) {
      // .incoming is an extraction still in progress (or one that crashed).
      if (!dirent.isDirectory() || dirent.name.endsWith('.incoming')) continue
      const root = path.join(libraryPath, dirent.name)
      const entry = this.resolveBuildEntry(root)
      if (entry) folders.push({ name: dirent.name, root, entry: entry.path, kind: entry.kind })
    }
    return folders
  }

  // The index.html a browser-style build starts from. Engines nest their export
  // as often as not (Vite emits dist/, Unity WebGL and Godot their own folders),
  // and a build can contain several html files, so the shallowest index.html
  // wins: it is the page that pulls in everything below it.
  public findEntryPointHtml(dir: string, depth = 0): { path: string; depth: number } | null {
    let best: { path: string; depth: number } | null = null
    try {
      for (const file of fs.readdirSync(dir)) {
        const filePath = path.join(dir, file)
        try {
          if (fs.statSync(filePath).isDirectory()) {
            const nested = this.findEntryPointHtml(filePath, depth + 1)
            if (nested && (!best || nested.depth < best.depth)) {
              best = nested
            }
          } else if (file.toLowerCase() === 'index.html') {
            // Nothing above this level can be shallower — stop descending here.
            return { path: filePath, depth }
          }
        } catch (err) {
          console.error(`Error accessing ${filePath}:`, err)
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${dir}:`, err)
    }
    return best
  }

  public searchForExecutablesRecursive(dir: string, fileList: string[] = []): string[] {
    try {
      const files = fs.readdirSync(dir)

      files.forEach((file: string) => {
        const filePath = path.join(dir, file)
        try {
          if (fs.statSync(filePath).isDirectory()) {
            this.searchForExecutablesRecursive(filePath, fileList)
          } else if (file.toLowerCase().endsWith('.exe')) {
            fileList.push(filePath)
          }
        } catch (err) {
          console.error(`Error accessing ${filePath}:`, err)
        }
      })
      return fileList
    } catch (err) {
      console.error(`Error reading directory ${dir}:`, err)
      return fileList
    }
  }

  public async uninstallGame(game_id: number, uninstallerPath: string): Promise<any> {
    try {
      console.log('Uninstalling game:', game_id, 'using uninstaller:', uninstallerPath)

      // Zip builds have no Inno Setup uninstaller, so the caller passes either
      // the extracted folder itself or a file inside it; both mean "delete that
      // folder". Only an existing FILE is treated as a real uninstaller to run.
      const existsAsDirectory =
        fs.existsSync(uninstallerPath) && fs.statSync(uninstallerPath).isDirectory()

      if (existsAsDirectory) {
        console.log('Uninstall target is a folder, deleting it:', uninstallerPath)
        fs.rmSync(uninstallerPath, { recursive: true, force: true })
        return { success: true, message: 'Game uninstalled successfully' }
      }

      if (!fs.existsSync(uninstallerPath)) {
        // Standalone exe or a path that has already gone — fall back to the
        // folder that contained it.
        const gameDir = path.dirname(uninstallerPath)
        console.log('No uninstaller found, deleting game folder:', gameDir)
        if (!fs.existsSync(gameDir)) {
          return { success: false, error: 'Game folder not found at: ' + gameDir }
        }
        fs.rmSync(gameDir, { recursive: true, force: true })
        return { success: true, message: 'Game uninstalled successfully' }
      }

      const command = `"${uninstallerPath}" /SILENT`
      console.log('Executing uninstall command:', command)

      return new Promise((resolve) => {
        exec(command, (err, stdout, stderr) => {
          if (err) {
            console.error('Uninstall error:', err.message)
            console.error('Stderr:', stderr)
            resolve({
              success: false,
              error: err.message
            })
          } else {
            console.log('Uninstall completed successfully')
            console.log('Stdout:', stdout)
            resolve({
              success: true,
              message: 'Game uninstalled successfully'
            })
          }
        })
      })
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }
}
