import { create } from 'zustand'
import type { Contact } from '../types'
import {
    saveBlockedContact as saveBlockedContactToDB,
    getAllBlockedContacts,
    deleteBlockedContact as deleteBlockedContactFromDB
} from '../services/db'
import { npubToPubkey, pubkeyToNpub, isValidNpub } from '../services/keys'

interface BlockedContactState {
    blockedContacts: Contact[]
    isLoading: boolean
    error: string | null

    // Actions
    initialize: () => Promise<void>
    addBlockedContact: (npubOrPubkey: string, name?: string) => Promise<Contact | null>
    removeBlockedContact: (pubkey: string) => Promise<void>
    clearError: () => void
}

export const useBlockedContactStore = create<BlockedContactState>((set, get) => ({
    blockedContacts: [],
    isLoading: false,
    error: null,

    initialize: async () => {
        set({ isLoading: true })
        try {
            const blockedContacts = await getAllBlockedContacts()
            console.log(blockedContacts)
            set({ blockedContacts, isLoading: false })
        } catch (error) {
            console.error('Failed to load blocked contacts:', error)
            set({ isLoading: false, error: 'Failed to load blocked contacts' })
        }
    },

    addBlockedContact: async (npubOrPubkey: string, name?: string) => {
        set({ error: null })

        let pubkey: string
        let npub: string

        // Check if it's an npub or hex pubkey
        if (npubOrPubkey.startsWith('npub')) {
            if (!isValidNpub(npubOrPubkey)) {
                set({ error: 'Invalid npub format' })
                return null
            }
            pubkey = npubToPubkey(npubOrPubkey)!
            npub = npubOrPubkey
        } else if (/^[0-9a-f]{64}$/i.test(npubOrPubkey)) {
            pubkey = npubOrPubkey.toLowerCase()
            npub = pubkeyToNpub(pubkey)
        } else {
            set({ error: 'Invalid public key format' })
            return null
        }

        // Check if contact already exists
        const existing = get().blockedContacts.find(c => c.pubkey === pubkey)
        if (existing) {
            set({ error: 'Contact already blocked' })
            return existing
        }

        const contact: Contact = {
            pubkey,
            npub,
            name,
            createdAt: Math.floor(Date.now() / 1000)
        }

        try {
            await saveBlockedContactToDB(contact)
            set({ blockedContacts: [...get().blockedContacts, contact] })

            return contact
        } catch (error) {
            console.error('Failed to save blocked contact:', error)
            set({ error: 'Failed to save blocked contact' })
            return null
        }
    },

    removeBlockedContact: async (pubkey: string) => {
        try {
            await deleteBlockedContactFromDB(pubkey)
            set({ blockedContacts: get().blockedContacts.filter(c => c.pubkey !== pubkey) })
        } catch (error) {
            console.error('Failed to remove contact from ban list:', error)
            set({ error: 'Failed to remove contact from ban list' })
        }
    },

    clearError: () => set({ error: null })
}))
