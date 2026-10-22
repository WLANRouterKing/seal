import { openDB } from 'idb'
import { getEncryptionKey, getVaultGeneration } from '../encryptionKeyManager'
import {
  createPasswordSlot,
  unlockWithPasswordSlot,
  deriveDatabaseKey,
  generateMasterKey,
  type KeySlot,
} from '../masterKey'

let connection: ReturnType<typeof openDB> | undefined
const database = () =>
  (connection ??= openDB('seal-linked-devices-v1', 1, {
    upgrade(db) {
      db.createObjectStore('records')
    },
  }))
const encoder = new TextEncoder()
type Envelope = { iv: Uint8Array; ciphertext: ArrayBuffer }
async function encrypt(key: CryptoKey, scope: string, value: unknown): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  return {
    iv,
    ciphertext: await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(scope) },
      key,
      encoder.encode(JSON.stringify(value))
    ),
  }
}
async function decrypt<T>(key: CryptoKey, scope: string, record: Envelope): Promise<T> {
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(record.iv), additionalData: encoder.encode(scope) },
        key,
        record.ciphertext
      )
    )
  )
}
export interface StateStore<T> {
  load(): Promise<T | undefined>
  save(state: T): Promise<void>
  assertActive(): void
}
export function primaryStore<T>(account: string, namespace = 'primary'): StateStore<T> {
  const generation = getVaultGeneration()
  const key = getEncryptionKey()?.key
  if (!key) throw new Error('Unlock the primary device first')
  const scope = namespace + ':' + account
  const check = () => {
    if (getVaultGeneration() !== generation || getEncryptionKey()?.key !== key) throw new Error('Primary device locked')
  }
  return {
    assertActive: check,
    async load() {
      check()
      const record = await (await database()).get('records', scope)
      const state = record ? await decrypt<T>(key, scope, record) : undefined
      check()
      return state
    },
    async save(state) {
      check()
      const record = await encrypt(key, scope, state)
      const db = await database()
      check()
      await db.put('records', record, scope)
      check()
    },
  }
}
export async function hasLinkedVault() {
  return !!(await (await database()).get('records', 'linked'))
}
export async function deleteLinkedVault() {
  await (await database()).delete('records', 'linked')
}
interface VaultRecord {
  slot: KeySlot
  salt: Uint8Array
  data: Envelope
}
export class LinkedVault<T> implements StateStore<T> {
  private key?: CryptoKey
  private meta?: Omit<VaultRecord, 'data'>
  private generation = 0
  assertActive() {
    if (!this.key) throw new Error('Device locked')
  }
  lock() {
    this.generation++
    this.key = undefined
    this.meta = undefined
  }
  async create(password: string, state: T) {
    if (password.length < 12) throw new Error('Password requires at least 12 characters')
    this.lock()
    const generation = this.generation
    const master = generateMasterKey()
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const slot = await createPasswordSlot(master, password)
      const key = await deriveDatabaseKey(master, salt)
      const data = await encrypt(key, 'linked', state)
      const db = await database()
      if (generation !== this.generation) throw new Error('Device locked')
      await db.add('records', { slot, salt, data }, 'linked')
      if (generation !== this.generation) throw new Error('Device locked')
      this.key = key
      this.meta = { slot, salt }
    } finally {
      master.fill(0)
    }
  }
  async unlock(password: string): Promise<T> {
    this.lock()
    const generation = this.generation
    const record: VaultRecord = await (await database()).get('records', 'linked')
    if (!record) throw new Error('No linked device found')
    const master = await unlockWithPasswordSlot(record.slot, password)
    if (!master) throw new Error('Incorrect password')
    try {
      const key = await deriveDatabaseKey(master, record.salt)
      const state = await decrypt<T>(key, 'linked', record.data)
      if (generation !== this.generation) throw new Error('Device locked')
      this.key = key
      this.meta = { slot: record.slot, salt: record.salt }
      return state
    } finally {
      master.fill(0)
    }
  }
  async load(): Promise<T> {
    this.assertActive()
    const key = this.key!,
      generation = this.generation
    const record: VaultRecord = await (await database()).get('records', 'linked')
    const state = await decrypt<T>(key, 'linked', record.data)
    if (generation !== this.generation) throw new Error('Device locked')
    return state
  }
  async save(state: T) {
    this.assertActive()
    const generation = this.generation
    const data = await encrypt(this.key!, 'linked', state)
    const db = await database()
    if (generation !== this.generation) throw new Error('Device locked')
    await db.put('records', { ...this.meta, data }, 'linked')
    if (generation !== this.generation) throw new Error('Device locked')
  }
}

export async function clearDeviceStorage() {
  await (await database()).clear('records')
}
