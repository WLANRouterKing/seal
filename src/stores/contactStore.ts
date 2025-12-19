import { create } from 'zustand'
import type { Contact } from '../types'
import {
  saveContact as saveContactToDB,
  getAllContacts,
  deleteContact as deleteContactFromDB
} from '../services/db'
import { npubToPubkey, pubkeyToNpub, isValidNpub } from '../services/keys'
import { relayPool } from '../services/relay'

interface ContactState {
  contacts: Contact[]
  isLoading: boolean
  error: string | null

  // Actions
  initialize: () => Promise<void>
  addContact: (npubOrPubkey: string, name?: string) => Promise<Contact | null>
  removeContact: (pubkey: string) => Promise<void>
  updateContact: (pubkey: string, updates: Partial<Contact>) => Promise<void>
  fetchProfile: (pubkey: string) => Promise<void>
  clearError: () => void
}

export const useContactStore = create<ContactState>((set, get) => ({
  contacts: [],
  isLoading: false,
  error: null,

  initialize: async () => {
    set({ isLoading: true })
    try {
      const contacts = await getAllContacts()
      set({ contacts, isLoading: false })
    } catch (error) {
      console.error('Failed to load contacts:', error)
      set({ isLoading: false, error: 'Failed to load contacts' })
    }
  },

  addContact: async (npubOrPubkey: string, name?: string) => {
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
    const existing = get().contacts.find(c => c.pubkey === pubkey)
    if (existing) {
      set({ error: 'Contact already exists' })
      return existing
    }

    const contact: Contact = {
      pubkey,
      npub,
      name,
      createdAt: Math.floor(Date.now() / 1000)
    }

    try {
      await saveContactToDB(contact)
      set({ contacts: [...get().contacts, contact] })

      // Fetch profile in background
      get().fetchProfile(pubkey)

      return contact
    } catch (error) {
      console.error('Failed to save contact:', error)
      set({ error: 'Failed to save contact' })
      return null
    }
  },

  removeContact: async (pubkey: string) => {
    try {
      await deleteContactFromDB(pubkey)
      set({ contacts: get().contacts.filter(c => c.pubkey !== pubkey) })
    } catch (error) {
      console.error('Failed to remove contact:', error)
      set({ error: 'Failed to remove contact' })
    }
  },

  updateContact: async (pubkey: string, updates: Partial<Contact>) => {
    const contact = get().contacts.find(c => c.pubkey === pubkey)
    if (!contact) return

    const updatedContact = { ...contact, ...updates }
    try {
      await saveContactToDB(updatedContact)
      set({
        contacts: get().contacts.map(c =>
          c.pubkey === pubkey ? updatedContact : c
        )
      })
    } catch (error) {
      console.error('Failed to update contact:', error)
    }
  },

  fetchProfile: async (pubkey: string) => {
    const connectedRelays = relayPool.getConnectedUrls()
    if (connectedRelays.length === 0) return

    relayPool.subscribe(
      connectedRelays,
      [{ kinds: [0], authors: [pubkey], limit: 1 }],
      (event) => {
        try {
          const profile = JSON.parse(event.content)
          get().updateContact(pubkey, {
            name: profile.name || profile.display_name,
            picture: profile.picture,
            about: profile.about,
            nip05: profile.nip05
          })
        } catch {
          // Invalid profile JSON
        }
      }
    )
  },

  clearError: () => set({ error: null })
}))
