import { app, BrowserWindow, shell, ipcMain, Notification } from 'electron'
import electronUpdater from 'electron-updater'
import path from 'path'
import { fileURLToPath } from 'url'

const { autoUpdater } = electronUpdater

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Disable hardware acceleration for better compatibility on Linux/Windows
// Prevents black screen issues on some Windows systems
app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null

// Determine if we're in development
const isDev = !app.isPackaged

// For alpha/pre-release testing
const isAlpha = app.getVersion().includes('alpha') || app.getVersion().includes('beta')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev,
      // Use persist partition for IndexedDB
      partition: 'persist:seal',
    },
    icon: path.join(__dirname, '../public/pwa-512x512.png'),
    // Hide until ready to prevent flash
    show: false,
    // Use native frame
    frame: true,
    titleBarStyle: 'default',
  })

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load the app
  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173')
    // Open DevTools in development
    mainWindow.webContents.openDevTools()
  } else {
    // In production, load from built files
    const indexPath = path.join(__dirname, '../dist/index.html')
    console.log('Loading from:', indexPath)

    mainWindow.loadFile(indexPath)

    mainWindow.webContents.on('console-message', (event, level, message) => {
      console.log(`[App Console] ${message}`)
    })
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[${level}] ${sourceId}:${line} - ${message}`)
    })
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('✓ Page loaded')
      mainWindow?.show()
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Auto-updater configuration
function setupAutoUpdater(): void {
  if (isDev) {
    console.log('[AutoUpdater] Skipping in development mode')
    return
  }

  // Allow pre-releases for alpha builds
  autoUpdater.allowPrerelease = isAlpha
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for update...')
  })

  autoUpdater.on('update-available', (info: { version: string }) => {
    console.log('[AutoUpdater] Update available:', info.version)
    // Notify renderer
    mainWindow?.webContents.send('update-available', info)

    // Show native notification
    new Notification({
      title: 'Update Available',
      body: `Version ${info.version} is available and will be installed on restart.`
    }).show()
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] No update available')
  })

  autoUpdater.on('download-progress', (progress: { percent: number }) => {
    console.log(`[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}%`)
    mainWindow?.webContents.send('update-download-progress', progress)
  })

  autoUpdater.on('update-downloaded', (info: { version: string }) => {
    console.log('[AutoUpdater] Update downloaded:', info.version)
    mainWindow?.webContents.send('update-downloaded', info)

    new Notification({
      title: 'Update Ready',
      body: `Version ${info.version} has been downloaded. Restart to apply.`
    }).show()
  })

  autoUpdater.on('error', (error: Error) => {
    console.error('[AutoUpdater] Error:', error)
  })

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      console.error('[AutoUpdater] Check failed:', err)
    })
  }, 3000)

  // Check for updates every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      console.error('[AutoUpdater] Periodic check failed:', err)
    })
  }, 4 * 60 * 60 * 1000)
}

// IPC handlers
function setupIPC(): void {
  // Check for updates manually
  ipcMain.handle('check-for-updates', async () => {
    if (isDev) return { updateAvailable: false }
    try {
      const result = await autoUpdater.checkForUpdates()
      return { updateAvailable: result?.updateInfo != null }
    } catch {
      return { updateAvailable: false }
    }
  })

  // Install update and restart
  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall()
  })

  // Get app version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  // Show native notification
  ipcMain.handle('show-notification', (_event, { title, body }) => {
    new Notification({ title, body }).show()
  })
}

// App lifecycle
app.whenReady().then(() => {
  createWindow()
  setupIPC()
  setupAutoUpdater()

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // On macOS, keep app running until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Security: Prevent navigation to external URLs
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url)
    // Allow localhost in dev, otherwise block navigation
    if (isDev && parsedUrl.hostname === 'localhost') return
    if (parsedUrl.protocol === 'file:') return
    event.preventDefault()
  })
})
