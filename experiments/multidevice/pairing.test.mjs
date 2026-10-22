import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAccount } from './harness.mjs'
import { createPairingRequest, approvePairing, inspectRequest } from './pairing.mjs'
const device = '12'.repeat(32)

test('pairing binds account, request and device; explicit confirmation and one use', async () => {
  const account = createAccount()
  const pending = createPairingRequest(account.pubkey, device)
  await assert.rejects(() => approvePairing(pending.request, account.signer, {}, ''), /Confirm/)
  const response = await approvePairing(
    pending.request,
    account.signer,
    { welcome: 'encrypted MLS payload' },
    pending.confirmation
  )
  assert(!JSON.stringify(response).includes('encrypted MLS payload'))
  await assert.rejects(() => pending.accept(response, ''), /Confirm/)
  assert.deepEqual(await pending.accept(response, pending.confirmation), { welcome: 'encrypted MLS payload' })
  await assert.rejects(() => pending.accept(response, pending.confirmation), /consumed/)
})

test('reject wrong account, response swap, tampered request and expired session', async () => {
  const account = createAccount()
  const other = createAccount()
  const a = createPairingRequest(account.pubkey, device, 100)
  const b = createPairingRequest(account.pubkey, device, 100)
  await assert.rejects(() => approvePairing(a.request, other.signer, {}, a.confirmation, 101), /Wrong account/)
  const response = await approvePairing(a.request, account.signer, {}, a.confirmation, 101)
  await assert.rejects(() => b.accept(response, b.confirmation, 101), /Untrusted/)
  assert.throws(() => inspectRequest({ ...a.request, content: '{}' }, 101), /Invalid/)
  await assert.rejects(() => a.accept(response, a.confirmation, 401), /expired/)
  b.cancel()
  await assert.rejects(() => b.accept(response, b.confirmation, 101), /consumed/)
})
