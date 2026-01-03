/**
 * Development utilities for testing and debugging
 * These are exposed on window.devTools in development mode
 */

import { openDB } from 'idb'
import { DB_NAME, DB_VERSION, STORES } from './constants'
import type { Contact } from '../types'
import type { StoredMessage } from '../services/db'

// Generate a random hex string
function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Generate a fake npub (bech32-like but not valid)
function fakeNpub(): string {
  return 'npub1' + randomHex(58).slice(0, 58)
}

// Random names for contacts
const FIRST_NAMES = [
  'Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Henry',
  'Ivy', 'Jack', 'Kate', 'Leo', 'Mia', 'Nick', 'Olivia', 'Paul',
  'Quinn', 'Rose', 'Sam', 'Tina', 'Uma', 'Victor', 'Wendy', 'Xander'
]

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Moore'
]

// Sample message templates
const MESSAGE_TEMPLATES = [
  'Hey, how are you?',
  'Did you see the latest news?',
  'I was thinking about our conversation yesterday...',
  'Can we meet up later?',
  'Thanks for the info!',
  'That sounds great!',
  'I\'ll check it out',
  'What do you think about this?',
  'Have you tried the new feature?',
  'Let me know when you\'re free',
  'Sure, no problem!',
  'I agree with you on that',
  'Interesting perspective',
  'Could you explain more?',
  'I\'ll get back to you on that',
  'Perfect, thanks!',
  'That makes sense',
  'I had the same thought',
  'Let\'s discuss this later',
  'Good point!',
  'I\'m not sure about that',
  'We should definitely try that',
  'What\'s your take on this?',
  'I appreciate your help',
  'Looking forward to it!',
  'Sounds like a plan',
  'I\'ll send you the details',
  'Can you send me the link?',
  'Just saw your message',
  'Sorry for the late reply',
  'No worries at all',
  'That\'s exactly what I was thinking',
  'Great idea!',
  'I\'ll think about it',
  'Let me check my schedule',
]

const LONG_MESSAGES = [
  'I\'ve been thinking about this for a while now, and I think we should definitely explore this option further. There are a lot of potential benefits that we haven\'t fully considered yet.',
  'Just finished reading that article you sent me. It was really insightful and made me reconsider some of my previous assumptions. Thanks for sharing!',
  'I wanted to follow up on our previous conversation about the project. I\'ve done some research and found some interesting information that might be relevant to what we discussed.',
  'Hope you\'re having a great day! I just wanted to check in and see how things are going on your end. Let me know if there\'s anything I can help with.',
  'I came across something really interesting today that I thought you might appreciate. It\'s related to what we were talking about last week, and I think it could be useful.',
]

interface GenerateOptions {
  contactCount?: number
  messagesPerContact?: number
  timeSpanDays?: number
}

/**
 * Generate dummy contacts and messages for performance testing
 */
export async function generateDummyData(options: GenerateOptions = {}): Promise<void> {
  const {
    contactCount = 10,
    messagesPerContact = 100,
    timeSpanDays = 30
  } = options

  console.log(`Generating ${contactCount} contacts with ~${messagesPerContact} messages each...`)

  const db = await openDB(DB_NAME, DB_VERSION)
  const now = Date.now()
  const timeSpanMs = timeSpanDays * 24 * 60 * 60 * 1000

  // Generate contacts
  const contacts: Contact[] = []
  for (let i = 0; i < contactCount; i++) {
    const pubkey = randomHex(64)
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]

    const contact: Contact = {
      pubkey,
      npub: fakeNpub(),
      name: `${firstName} ${lastName}`,
      picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${pubkey.slice(0, 8)}`,
      about: `Test contact ${i + 1}`,
      createdAt: now - Math.floor(Math.random() * timeSpanMs),
    }

    contacts.push(contact)
    await db.put(STORES.CONTACTS, contact)
  }

  console.log(`Created ${contacts.length} contacts`)

  // Generate messages for each contact
  let totalMessages = 0
  for (const contact of contacts) {
    // Randomize message count per contact (50% to 150% of target)
    const messageCount = Math.floor(messagesPerContact * (0.5 + Math.random()))
    const messages: StoredMessage[] = []

    for (let i = 0; i < messageCount; i++) {
      const isOutgoing = Math.random() > 0.5
      const createdAt = now - Math.floor(Math.random() * timeSpanMs)

      // Pick a message template
      let content: string
      if (Math.random() > 0.9) {
        content = LONG_MESSAGES[Math.floor(Math.random() * LONG_MESSAGES.length)]
      } else {
        content = MESSAGE_TEMPLATES[Math.floor(Math.random() * MESSAGE_TEMPLATES.length)]
      }

      const message: StoredMessage = {
        id: randomHex(64),
        pubkey: contact.pubkey,
        recipientPubkey: isOutgoing ? contact.pubkey : 'self',
        encryptedEvent: JSON.stringify({ dummy: true, content }),
        createdAt,
        status: 'delivered',
        isOutgoing,
      }

      messages.push(message)
    }

    // Batch insert messages
    const tx = db.transaction(STORES.MESSAGES, 'readwrite')
    for (const msg of messages) {
      await tx.store.put(msg)
    }
    await tx.done

    totalMessages += messages.length
    console.log(`  ${contact.name}: ${messages.length} messages`)
  }

  console.log(`\nDone! Generated ${totalMessages} total messages across ${contactCount} contacts`)
  console.log('Reload the app to see the data (note: data is unencrypted, won\'t work with password)')
}

/**
 * Clear all dummy data (and real data!)
 */
export async function clearAllData(): Promise<void> {
  const db = await openDB(DB_NAME, DB_VERSION)

  const stores = [
    STORES.MESSAGES,
    STORES.CONTACTS,
    STORES.SETTINGS,
    STORES.RELAYS,
    STORES.DELETED_MESSAGES
  ]

  for (const store of stores) {
    const tx = db.transaction(store, 'readwrite')
    await tx.store.clear()
    await tx.done
    console.log(`Cleared ${store}`)
  }

  console.log('All data cleared (keys preserved)')
}

/**
 * Get database statistics
 */
export async function getDbStats(): Promise<void> {
  const db = await openDB(DB_NAME, DB_VERSION)

  const messageCount = await db.count(STORES.MESSAGES)
  const contactCount = await db.count(STORES.CONTACTS)
  const relayCount = await db.count(STORES.RELAYS)
  const deletedCount = await db.count(STORES.DELETED_MESSAGES)

  console.log('Database Statistics:')
  console.log(`  Messages: ${messageCount}`)
  console.log(`  Contacts: ${contactCount}`)
  console.log(`  Relays: ${relayCount}`)
  console.log(`  Deleted message IDs: ${deletedCount}`)
}

// Expose to window in development
if (import.meta.env.DEV) {
  (window as unknown as { devTools: typeof devTools }).devTools = {
    generateDummyData,
    clearAllData,
    getDbStats,
  }

  console.log('%c🔧 Dev tools available: window.devTools', 'color: #22d3ee; font-weight: bold')
  console.log('  devTools.generateDummyData({ contactCount: 10, messagesPerContact: 100 })')
  console.log('  devTools.clearAllData()')
  console.log('  devTools.getDbStats()')
}

const devTools = {
  generateDummyData,
  clearAllData,
  getDbStats,
}

export default devTools
