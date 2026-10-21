// Experimental device-scoped encrypted persistence. No account nsec is stored.
import { scryptAsync } from '@noble/hashes/scrypt.js'
const enc = new TextEncoder()
const dec = new TextDecoder()
const hex = (x) => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x)
function pack(value) {
  if (value === undefined) return ['undefined']
  if (value === null || ['boolean', 'string', 'number'].includes(typeof value)) return ['scalar', value]
  if (typeof value === 'bigint') return ['bigint', String(value)]
  if (value instanceof Uint8Array) return ['bytes', [...value]]
  if (Array.isArray(value)) return ['array', value.map(pack)]
  if (value instanceof Map) return ['map', [...value].map(([k, v]) => [pack(k), pack(v)])]
  if (Object.getPrototypeOf(value) === Object.prototype)
    return ['object', Object.entries(value).map(([k, v]) => [k, pack(v)])]
  throw new Error('Unsupported stored value')
}
function unpack([type, value]) {
  switch (type) {
    case 'undefined':
      return undefined
    case 'scalar':
      return value
    case 'bigint':
      return BigInt(value)
    case 'bytes':
      return Uint8Array.from(value)
    case 'array':
      return value.map(unpack)
    case 'map':
      return new Map(value.map(([k, v]) => [unpack(k), unpack(v)]))
    case 'object':
      return Object.fromEntries(value.map(([k, v]) => [k, unpack(v)]))
    default:
      throw new Error('Invalid stored value')
  }
}
async function derive(password, salt) {
  const raw = await scryptAsync(password, salt, { N: 32768, r: 8, p: 3, dkLen: 32, maxmem: 64 * 1024 * 1024 })
  try {
    return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  } finally {
    raw.fill(0)
  }
}

export class DeviceVault {
  #key
  #generation = 0
  #listeners = new Set()
  constructor(backend, account, deviceId) {
    if (!hex(account) || !hex(deviceId)) throw new Error('Invalid device scope')
    this.backend = backend
    this.prefix = `seal-mls-v1:${account}:${deviceId}:`
  }
  onLock(fn) {
    this.#listeners.add(fn)
    return () => this.#listeners.delete(fn)
  }
  lock() {
    this.#generation++
    this.#key = undefined
    for (const fn of this.#listeners) fn()
  }
  get locked() {
    return !this.#key
  }
  async create(password) {
    if (password.length < 12) throw new Error('Password requires at least 12 characters')
    this.lock()
    const generation = this.#generation
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await derive(password, salt)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const check = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: enc.encode(this.prefix) },
        key,
        enc.encode('seal-device-v1')
      )
    )
    if (generation !== this.#generation) throw new Error('Vault locked')
    // add must be atomic and reject if this device vault already exists.
    await this.backend.add(this.prefix + 'meta', { v: 1, salt, iv, check })
    if (generation !== this.#generation) throw new Error('Vault locked')
    this.#key = key
  }
  async unlock(password) {
    this.lock()
    const generation = this.#generation
    const meta = await this.backend.get(this.prefix + 'meta')
    if (!meta || meta.v !== 1 || meta.salt?.length !== 16 || meta.iv?.length !== 12) throw new Error('Invalid vault')
    const key = await derive(password, meta.salt)
    const check = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: meta.iv, additionalData: enc.encode(this.prefix) },
      key,
      meta.check
    )
    if (dec.decode(check) !== 'seal-device-v1' || generation !== this.#generation) throw new Error('Vault locked')
    this.#key = key
  }
  #session() {
    if (!this.#key) throw new Error('Vault locked')
    const key = this.#key,
      generation = this.#generation
    return {
      key,
      check: () => {
        if (generation !== this.#generation || this.#key !== key) throw new Error('Vault locked')
      },
    }
  }
  store(name) {
    if (!/^[a-z-]+$/.test(name)) throw new Error('Invalid store')
    const prefix = this.prefix + 'data:' + name + ':'
    return {
      getItem: async (id) => {
        const session = this.#session()
        const address = prefix + id
        const record = await this.backend.get(address)
        session.check()
        if (!record) return null
        if (record.v !== 1) throw new Error('Invalid record')
        const bytes = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: record.iv, additionalData: enc.encode(address) },
          session.key,
          record.data
        )
        session.check()
        return unpack(JSON.parse(dec.decode(bytes)))
      },
      setItem: async (id, value) => {
        const session = this.#session()
        const address = prefix + id
        const iv = crypto.getRandomValues(new Uint8Array(12))
        const data = new Uint8Array(
          await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv, additionalData: enc.encode(address) },
            session.key,
            enc.encode(JSON.stringify(pack(value)))
          )
        )
        session.check()
        await this.backend.set(address, { v: 1, iv, data })
        session.check()
        return value
      },
      removeItem: async (id) => {
        const session = this.#session()
        await this.backend.remove(prefix + id)
        session.check()
      },
      keys: async () => {
        const session = this.#session()
        const keys = await this.backend.keys()
        session.check()
        return keys.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))
      },
      clear: async () => {
        const session = this.#session()
        for (const id of await this.backend.keys()) {
          session.check()
          if (id.startsWith(prefix)) await this.backend.remove(id)
        }
      },
    }
  }
  async erase() {
    this.lock()
    for (const key of await this.backend.keys()) if (key.startsWith(this.prefix)) await this.backend.remove(key)
  }
}

export async function openDeviceDatabase() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('seal-mls-experiment-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('records')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  function run(mode, operation) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', mode)
      const request = operation(tx.objectStore('records'))
      tx.oncomplete = () => resolve(request.result)
      tx.onabort = () => reject(tx.error || new Error('Storage aborted'))
      tx.onerror = () => reject(tx.error || new Error('Storage failed'))
    })
  }
  return {
    get: (key) => run('readonly', (store) => store.get(key)),
    set: (key, value) => run('readwrite', (store) => store.put(value, key)),
    add: (key, value) => run('readwrite', (store) => store.add(value, key)),
    remove: (key) => run('readwrite', (store) => store.delete(key)),
    keys: () => run('readonly', (store) => store.getAllKeys()),
    close: () => db.close(),
  }
}
