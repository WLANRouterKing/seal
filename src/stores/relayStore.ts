import {create} from 'zustand'
import type {Relay} from '../types'
import {
    DEFAULT_RELAYS,
    NIP17_KIND
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
    'wss://nostr.fmt.wiz.biz',  // Often unavailable
    'wss://relay.nostr.bg',
    'wss://relay.nostr.band'
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

// Note: We intentionally connect to ALL configured relays (no random subset)
// This provides better anonymity through "crowd anonymity" - all users look the same
// Random relay selection would create a unique fingerprint per user/session

export const useRelayStore = create<RelayState>((set, get) => ({
    relays: [],
    allRelayUrls: [],
    activeRelayUrls: [],
    isConnecting: false,

    initialize: async () => {
        // Load user-added relays from DB (defaults come from code, not DB)
        const userRelays = await getAllRelays()

        // Remove incompatible relays from user's saved list
        const incompatibleSaved = userRelays.filter(r => INCOMPATIBLE_RELAYS.includes(r.url))
        if (incompatibleSaved.length > 0) {
            await Promise.all(incompatibleSaved.map(r => deleteRelayFromDB(r.url)))
        }

        // Clean user relays
        const cleanedUserRelays = userRelays
            .filter(r => !INCOMPATIBLE_RELAYS.includes(r.url))
            .map(r => r.url)

        // Merge: DEFAULT_RELAYS + user-added relays (deduplicated)
        const allUrls = [...new Set([...DEFAULT_RELAYS, ...cleanedUserRelays])]

        set({allRelayUrls: allUrls})

        // Set up status listener
        relayPool.onStatusChange((relays) => {
            set({relays})
        })

        // Connect to ALL relays for better crowd anonymity
        // (random subset would create unique fingerprint per user)
        console.log(`[Relay] Connecting to all ${allUrls.length} relays`)

        set({activeRelayUrls: allUrls})
        await get().connectToRelays(allUrls)
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

        // Check if already exists (in defaults or user-added)
        const {allRelayUrls} = get()
        if (allRelayUrls.includes(normalizedUrl) || DEFAULT_RELAYS.includes(normalizedUrl)) {
            throw new Error('Relay already exists')
        }

        // Save user-added relay to DB
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
        // Don't allow removing default relays
        if (DEFAULT_RELAYS.includes(url)) {
            throw new Error('Cannot remove default relay')
        }

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
