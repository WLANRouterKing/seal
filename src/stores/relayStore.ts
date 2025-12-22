import {create} from 'zustand'
import type {Relay} from '../types'
import {
    DEFAULT_RELAYS,
    MIN_RELAYS_PER_SESSION,
    NIP17_KIND,
    MAX_RELAYS_PER_SESSION
} from '../utils/constants'
import {relayPool} from '../services/relay'
import {getAllRelays, saveRelay, deleteRelay as deleteRelayFromDB} from '../services/db'
import {parseDMRelayListEvent} from '../services/crypto'

// Cache for DM relay lookups (pubkey -> relays)
const dmRelayCache = new Map<string, { relays: string[]; timestamp: number }>()
const DM_RELAY_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Relays that don't support NIP-17 (kind 1059) - should be removed from user's list
const INCOMPATIBLE_RELAYS = [
    'wss://purplepag.es',      // Profile data only, rejects kind 1059
    'wss://relay.mostr.pub',   // Mastodon bridge, filters events
    'wss://nostr.bitcoiner.social', // Requires web of trust
    'wss://offchain.pub',      // Often unavailable
    'wss://nostr.fmt.wiz.biz'  // Often unavailable
]

interface RelayState {
    relays: Relay[]
    allRelayUrls: string[] // Full pool of available relays
    activeRelayUrls: string[] // Currently selected subset for this session
    isConnecting: boolean

    // Actions
    initialize: () => Promise<void>
    connectToRelays: (urls?: string[]) => Promise<void>
    addRelay: (url: string) => Promise<void>
    removeRelay: (url: string) => Promise<void>
    disconnect: () => void
    getDMRelays: (pubkey: string) => Promise<string[]>
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

/**
 * Select a random number of relays for this session.
 * - Minimum: MIN_RELAYS_PER_SESSION (5)
 * - Maximum: MAX_RELAY_PERCENTAGE (80%) of the pool
 * - Never uses all relays to ensure privacy through randomization
 */
function selectSessionRelays(urls: string[]): string[] {
    if (urls.length <= MIN_RELAYS_PER_SESSION) {
        // If pool is small, use all available
        return shuffleArray(urls)
    }

    // Random count between MIN and MAX
    const count = Math.floor(Math.random() * (MAX_RELAYS_PER_SESSION - MIN_RELAYS_PER_SESSION + 1) + MIN_RELAYS_PER_SESSION);

    const shuffled = shuffleArray(urls)
    return shuffled.slice(0, count)
}

export const useRelayStore = create<RelayState>((set, get) => ({
    relays: [],
    allRelayUrls: [],
    activeRelayUrls: [],
    isConnecting: false,

    initialize: async () => {
        // Load saved relays from DB
        const savedRelays = await getAllRelays()

        // Remove incompatible relays from saved list
        const incompatibleSaved = savedRelays.filter(r => INCOMPATIBLE_RELAYS.includes(r.url))
        if (incompatibleSaved.length > 0) {
            console.log(`[Relay] Removing ${incompatibleSaved.length} incompatible relays:`, incompatibleSaved.map(r => r.url))
            await Promise.all(incompatibleSaved.map(r => deleteRelayFromDB(r.url)))
        }

        // Get remaining relays after cleanup
        const cleanedRelays = savedRelays.filter(r => !INCOMPATIBLE_RELAYS.includes(r.url))
        const allUrls = cleanedRelays.length > 0
            ? cleanedRelays.map(r => r.url)
            : DEFAULT_RELAYS

        // Save default relays if none exist (or all were removed)
        if (cleanedRelays.length === 0) {
            await Promise.all(
                DEFAULT_RELAYS.map(url => saveRelay({url, read: true, write: true}))
            )
        }

        set({allRelayUrls: allUrls})

        // Set up status listener
        relayPool.onStatusChange((relays) => {
            set({relays})
        })

        // Select random subset for this session (at least 5, but not all)
        // This selection is done once per session - no rotation during active use
        const selectedUrls = selectSessionRelays(allUrls)
        console.log(`[Relay] Session started with ${selectedUrls.length}/${allUrls.length} relays`)

        set({activeRelayUrls: selectedUrls})
        await get().connectToRelays(selectedUrls)
    },

    connectToRelays: async (urls?: string[]) => {
        set({isConnecting: true})
        const relayUrls = urls || get().activeRelayUrls

        await Promise.all(relayUrls.map(url => relayPool.connect(url)))

        set({
            relays: relayPool.getStatus(),
            isConnecting: false
        })
    },

    addRelay: async (url: string) => {
        // Normalize URL
        const normalizedUrl = url.trim().toLowerCase()
        if (!normalizedUrl.startsWith('wss://') && !normalizedUrl.startsWith('ws://')) {
            throw new Error('Invalid relay URL')
        }

        // Check if already exists
        const {allRelayUrls} = get()
        if (allRelayUrls.includes(normalizedUrl)) {
            throw new Error('Relay already exists')
        }

        // Save to DB and add to pool
        await saveRelay({url: normalizedUrl, read: true, write: true})
        set({allRelayUrls: [...allRelayUrls, normalizedUrl]})

        // Connect to new relay immediately (it becomes part of active session)
        await relayPool.connect(normalizedUrl)
        set({
            relays: relayPool.getStatus(),
            activeRelayUrls: [...get().activeRelayUrls, normalizedUrl]
        })
    },

    removeRelay: async (url: string) => {
        relayPool.disconnect(url)
        await deleteRelayFromDB(url)

        const {allRelayUrls, activeRelayUrls} = get()
        set({
            allRelayUrls: allRelayUrls.filter(u => u !== url),
            activeRelayUrls: activeRelayUrls.filter(u => u !== url),
            relays: relayPool.getStatus()
        })
    },

    disconnect: () => {
        relayPool.disconnectAll()
        set({relays: []})
    },

    // Fetch DM relay preferences for a pubkey (Kind 10050)
    getDMRelays: async (pubkey: string): Promise<string[]> => {
        // Check cache first
        const cached = dmRelayCache.get(pubkey)
        if (cached && Date.now() - cached.timestamp < DM_RELAY_CACHE_TTL) {
            return cached.relays
        }

        const connectedRelays = relayPool.getConnectedUrls()
        if (connectedRelays.length === 0) {
            return get().activeRelayUrls
        }

        return new Promise((resolve) => {
            let found = false
            const timeout = setTimeout(() => {
                if (!found) {
                    // No DM relays found, use our active relays as fallback
                    resolve(get().activeRelayUrls)
                }
            }, 3000) // 3 second timeout

            const unsubscribe = relayPool.subscribe(
                connectedRelays,
                [{kinds: [NIP17_KIND.DM_RELAYS], authors: [pubkey], limit: 1}],
                (event) => {
                    if (found) return
                    found = true
                    clearTimeout(timeout)
                    unsubscribe()

                    const dmRelayList = parseDMRelayListEvent(event)
                    if (dmRelayList && dmRelayList.relays.length > 0) {
                        // Cache the result
                        dmRelayCache.set(pubkey, {
                            relays: dmRelayList.relays,
                            timestamp: Date.now()
                        })
                        resolve(dmRelayList.relays)
                    } else {
                        resolve(get().activeRelayUrls)
                    }
                },
                () => {
                    // EOSE - no events found
                    if (!found) {
                        found = true
                        clearTimeout(timeout)
                        unsubscribe()
                        resolve(get().activeRelayUrls)
                    }
                }
            )
        })
    }
}))
