import { create } from 'zustand'
import type { Relay } from '../types'
import { DEFAULT_RELAYS, RELAYS_PER_SESSION, RELAY_ROTATION_INTERVAL } from '../utils/constants'
import { relayPool } from '../services/relay'
import { getAllRelays, saveRelay, deleteRelay as deleteRelayFromDB } from '../services/db'

interface RelayState {
  relays: Relay[]
  allRelayUrls: string[] // Full pool of available relays
  activeRelayUrls: string[] // Currently selected subset
  isConnecting: boolean
  rotationTimer: ReturnType<typeof setInterval> | null

  // Actions
  initialize: () => Promise<void>
  connectToRelays: (urls?: string[]) => Promise<void>
  rotateRelays: () => Promise<void>
  addRelay: (url: string) => Promise<void>
  removeRelay: (url: string) => Promise<void>
  disconnect: () => void
}

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Select random subset of relays
function selectRandomRelays(urls: string[], count: number): string[] {
  const shuffled = shuffleArray(urls)
  return shuffled.slice(0, Math.min(count, urls.length))
}

export const useRelayStore = create<RelayState>((set, get) => ({
  relays: [],
  allRelayUrls: [],
  activeRelayUrls: [],
  isConnecting: false,
  rotationTimer: null,

  initialize: async () => {
    // Load saved relays from DB
    const savedRelays = await getAllRelays()
    const allUrls = savedRelays.length > 0
      ? savedRelays.map(r => r.url)
      : DEFAULT_RELAYS

    // Save default relays if none exist
    if (savedRelays.length === 0) {
      await Promise.all(
        DEFAULT_RELAYS.map(url => saveRelay({ url, read: true, write: true }))
      )
    }

    set({ allRelayUrls: allUrls })

    // Set up status listener
    relayPool.onStatusChange((relays) => {
      set({ relays })
    })

    // Select random subset and connect
    const selectedUrls = selectRandomRelays(allUrls, RELAYS_PER_SESSION)
    set({ activeRelayUrls: selectedUrls })
    await get().connectToRelays(selectedUrls)

    // Set up rotation timer
    const timer = setInterval(() => {
      get().rotateRelays()
    }, RELAY_ROTATION_INTERVAL)
    set({ rotationTimer: timer })
  },

  connectToRelays: async (urls?: string[]) => {
    set({ isConnecting: true })
    const relayUrls = urls || get().activeRelayUrls

    await Promise.all(relayUrls.map(url => relayPool.connect(url)))

    set({
      relays: relayPool.getStatus(),
      isConnecting: false
    })
  },

  rotateRelays: async () => {
    const { allRelayUrls, activeRelayUrls } = get()

    // Select new random subset, trying to pick different relays
    let newSelection = selectRandomRelays(allRelayUrls, RELAYS_PER_SESSION)

    // If we have enough relays, try to get at least some different ones
    if (allRelayUrls.length > RELAYS_PER_SESSION) {
      const notCurrentlyActive = allRelayUrls.filter(url => !activeRelayUrls.includes(url))
      const keepCount = Math.floor(RELAYS_PER_SESSION / 2) // Keep ~half of current
      const newCount = RELAYS_PER_SESSION - keepCount

      const toKeep = selectRandomRelays(activeRelayUrls, keepCount)
      const toAdd = selectRandomRelays(notCurrentlyActive, newCount)
      newSelection = [...toKeep, ...toAdd]
    }

    // Disconnect from relays no longer in selection
    const toDisconnect = activeRelayUrls.filter(url => !newSelection.includes(url))
    toDisconnect.forEach(url => relayPool.disconnect(url))

    // Connect to new relays
    const toConnect = newSelection.filter(url => !activeRelayUrls.includes(url))
    await Promise.all(toConnect.map(url => relayPool.connect(url)))

    set({
      activeRelayUrls: newSelection,
      relays: relayPool.getStatus()
    })

    console.log('[Relay] Rotated relays:', newSelection)
  },

  addRelay: async (url: string) => {
    // Normalize URL
    const normalizedUrl = url.trim().toLowerCase()
    if (!normalizedUrl.startsWith('wss://') && !normalizedUrl.startsWith('ws://')) {
      throw new Error('Invalid relay URL')
    }

    // Check if already exists
    const { allRelayUrls } = get()
    if (allRelayUrls.includes(normalizedUrl)) {
      throw new Error('Relay already exists')
    }

    // Save to DB and add to pool
    await saveRelay({ url: normalizedUrl, read: true, write: true })
    set({ allRelayUrls: [...allRelayUrls, normalizedUrl] })

    // Connect to new relay immediately
    await relayPool.connect(normalizedUrl)
    set({
      relays: relayPool.getStatus(),
      activeRelayUrls: [...get().activeRelayUrls, normalizedUrl]
    })
  },

  removeRelay: async (url: string) => {
    relayPool.disconnect(url)
    await deleteRelayFromDB(url)

    const { allRelayUrls, activeRelayUrls } = get()
    set({
      allRelayUrls: allRelayUrls.filter(u => u !== url),
      activeRelayUrls: activeRelayUrls.filter(u => u !== url),
      relays: relayPool.getStatus()
    })
  },

  disconnect: () => {
    const { rotationTimer } = get()
    if (rotationTimer) {
      clearInterval(rotationTimer)
    }
    relayPool.disconnectAll()
    set({ relays: [], rotationTimer: null })
  }
}))
