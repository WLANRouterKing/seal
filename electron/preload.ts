import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  secureUnlock: {
    availability: () => ipcRenderer.invoke('secure-unlock-availability'),
    enroll: () => ipcRenderer.invoke('secure-unlock-enroll'),
    unlock: (id: string) => ipcRenderer.invoke('secure-unlock-unlock', id),
    remove: async () => {}, // Credential management remains with the passkey provider.
  },
  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (callback: (info: unknown) => void) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info))
  },
  onUpdateDownloadProgress: (callback: (progress: unknown) => void) => {
    ipcRenderer.on('update-download-progress', (_event, progress) => callback(progress))
  },
  onUpdateDownloaded: (callback: (info: unknown) => void) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info))
  },

  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Native notifications
  showNotification: (title: string, body: string) => ipcRenderer.invoke('show-notification', { title, body }),

  // Platform detection
  platform: process.platform,
  isElectron: true,
})

// Type definitions for the renderer
declare global {
  interface Window {
    electronAPI?: {
      secureUnlock: {
        availability: () => Promise<{ available: boolean; kind: string }>
        enroll: () => Promise<{ id: string; secret: string }>
        unlock: (id: string) => Promise<{ id: string; secret: string }>
        remove: (id: string) => Promise<void>
      }
      checkForUpdates: () => Promise<{ updateAvailable: boolean }>
      installUpdate: () => Promise<void>
      onUpdateAvailable: (callback: (info: unknown) => void) => void
      onUpdateDownloadProgress: (callback: (progress: unknown) => void) => void
      onUpdateDownloaded: (callback: (info: unknown) => void) => void
      getAppVersion: () => Promise<string>
      showNotification: (title: string, body: string) => Promise<void>
      platform: string
      isElectron: boolean
    }
  }
}
