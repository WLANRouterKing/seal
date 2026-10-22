import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LabScenario } from './lab-scenario.mjs'

class MemoryBackend {
  data = new Map()
  async get(k) {
    return structuredClone(this.data.get(k))
  }
  async set(k, v) {
    this.data.set(k, structuredClone(v))
  }
  async add(k, v) {
    if (this.data.has(k)) throw new Error('Exists')
    await this.set(k, v)
  }
  async remove(k) {
    this.data.delete(k)
  }
  async keys() {
    return [...this.data.keys()]
  }
}

test('full lab flow: approval, encrypted persistence, offline main, lock, restore, removal', async () => {
  const backend = new MemoryBackend()
  const lab = new LabScenario()
  await lab.prepare(backend, 'local test password')
  assert.equal(lab.phase, 'pending')
  await assert.rejects(() => lab.pair(lab.confirmation, ''), /both devices/)
  await lab.pair(lab.confirmation, lab.confirmation)
  assert.equal(lab.phase, 'linked')
  lab.setPhoneOffline(true)
  assert.deepEqual(await lab.exchange('Testnachricht'), { sent: 'Testnachricht', received: 'Antwort: Testnachricht' })
  await lab.lock()
  await assert.rejects(() => lab.exchange('locked'), /not active/)
  await assert.rejects(() => lab.unlock('wrong password'))
  await lab.unlock('local test password')
  assert.equal((await lab.exchange('Nach Entsperren')).received, 'Antwort: Nach Entsperren')
  assert(!JSON.stringify([...backend.data.values()]).includes('Testnachricht'))
  await assert.rejects(() => lab.remove(), /online/)
  lab.setPhoneOffline(false)
  const removed = await lab.remove()
  assert.equal(removed.chats[0].status, 'removed')
  await assert.rejects(() => lab.exchange('removed'), /not active/)
  assert.equal((await lab.devices())[0].chats[0].status, 'removed')
  await lab.erase()
  assert.equal(backend.data.size, 0)
})
