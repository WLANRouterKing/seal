import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { finalizeEvent, generateSecretKey } from 'nostr-tools'
import { WireSecretGuard } from './wire-secrets.mjs'
import { RelayNetwork } from './relay-network.mjs'

test('blocks private keys in raw, hex, base64 and nested JSON before relay publication', async () => {
  const guard = new WireSecretGuard()
  const secret = randomBytes(32)
  guard.add(secret)
  for (const content of [secret.toString('hex'), secret.toString('base64'), JSON.stringify({ key: [...secret] })]) {
    assert.throws(() => guard.assertSafe({ kind: 445, content }), /Secret material/)
  }
  const network = new RelayNetwork(['wss://must-not-be-contacted.invalid'])
  network.beforePublish = (event) => guard.assertSafe(event)
  const leaking = finalizeEvent(
    { kind: 445, created_at: 1, content: secret.toString('base64'), tags: [] },
    generateSecretKey()
  )
  await assert.rejects(() => network.publish(network.relays, leaking), /Secret material/)
  assert.equal(network.published.length, 0)
  network.disconnect()
  guard.clear()
})
