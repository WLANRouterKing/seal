import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeviceVault } from './device-vault.mjs'
export class Backend {
  data = new Map()
  async get(k) {
    return structuredClone(this.data.get(k))
  }
  async set(k, v) {
    this.data.set(k, structuredClone(v))
  }
  async add(k, v) {
    if (this.data.has(k)) throw new Error('Already exists')
    await this.set(k, v)
  }
  async remove(k) {
    this.data.delete(k)
  }
  async keys() {
    return [...this.data.keys()]
  }
}

test('device vault encrypts, locks, restores and separates devices and records', async () => {
  const backend = new Backend()
  const account = '01'.repeat(32)
  const a = new DeviceVault(backend, account, '02'.repeat(32))
  const b = new DeviceVault(backend, account, '03'.repeat(32))
  await a.create('long test password')
  await b.create('another test password')
  const state = {
    secret: 'sensitive MLS state',
    bytes: new Uint8Array([1, 2, 3]),
    epoch: 3n,
    map: new Map([['x', undefined]]),
  }
  await a.store('groups').setItem('chat', state)
  await b.store('groups').setItem('chat', { secret: 'other device' })
  assert(!JSON.stringify([...backend.data.values()]).includes('sensitive MLS state'))
  assert.deepEqual(await a.store('groups').getItem('chat'), state)
  // Authenticated address prevents moving ciphertext to another store/key/device.
  const encrypted = await backend.get(a.prefix + 'data:groups:chat')
  await backend.set(a.prefix + 'data:groups:swapped', encrypted)
  await assert.rejects(() => a.store('groups').getItem('swapped'))
  await backend.set(b.prefix + 'data:groups:swapped', encrypted)
  await assert.rejects(() => b.store('groups').getItem('swapped'))
  a.lock()
  await assert.rejects(() => a.store('groups').getItem('chat'), /locked/)
  await assert.rejects(() => a.unlock('wrong password'))
  assert(a.locked)
  await a.unlock('long test password')
  assert.deepEqual(await a.store('groups').getItem('chat'), state)
  await a.erase()
  assert.equal((await b.store('groups').getItem('chat')).secret, 'other device')
  assert(!(await backend.keys()).some((k) => k.startsWith(a.prefix)))
})

test('lock during an outstanding unlock does not reopen the vault', async () => {
  const vault = new DeviceVault(new Backend(), '01'.repeat(32), '04'.repeat(32))
  await vault.create('long test password')
  vault.lock()
  const pending = vault.unlock('long test password')
  vault.lock()
  await assert.rejects(() => pending, /locked/)
  assert(vault.locked)
})
