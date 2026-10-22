// @vitest-environment node
import { expect, it } from 'vitest'
import { createLocalAccountSigner } from '../accountSigner'
import { createGiftWrap, unwrapGiftWrap } from '../crypto'
import { checkWire, inspectDirectory, DIRECTORY_ID, DIRECTORY_KIND } from './independent'
import { newDeviceSecret, now } from './protocol'
async function fixture() {
  const account = createLocalAccountSigner(newDeviceSecret())
  const device = createLocalAccountSigner(newDeviceSecret())
  const peer = createLocalAccountSigner(newDeviceSecret())
  const roster = await account.signEvent({
    kind: DIRECTORY_KIND,
    created_at: now(),
    tags: [['d', DIRECTORY_ID]],
    content: JSON.stringify({ version: 1, devices: [device.pubkey] }),
  })
  const message = await device.signEvent({
    kind: 14,
    created_at: now(),
    tags: [['p', peer.pubkey]],
    content: JSON.stringify({ recipient: peer.pubkey, text: 'independent message' }),
  })
  return {
    account,
    device,
    peer,
    roster,
    wire: { protocol: DIRECTORY_ID, proof: roster, message },
    close() {
      account.dispose()
      device.dispose()
      peer.dispose()
    },
  }
}
it('authenticates the account while the actual message is signed and encrypted only by its device', async () => {
  const f = await fixture()
  try {
    const accountKey = f.account.pubkey
    f.account.dispose()
    const wrap = await createGiftWrap(JSON.stringify(f.wire), f.peer.pubkey, f.device)
    expect(wrap.content).not.toContain('independent message')
    const plain = await unwrapGiftWrap(wrap, f.peer)
    expect(plain).not.toBeNull()
    const message = checkWire(
      JSON.parse(plain!.content),
      plain!.senderPubkey,
      f.peer.pubkey,
      f.peer.pubkey,
      inspectDirectory(f.roster, accountKey)
    )
    expect(message.sender).toBe(accountKey)
    expect(message.content).toBe('independent message')
  } finally {
    f.close()
  }
})
it('rejects a previously approved device after a signed removal without trusting its old proof', async () => {
  const f = await fixture()
  try {
    const removed = await f.account.signEvent({
      kind: DIRECTORY_KIND,
      created_at: now() + 1,
      tags: [['d', DIRECTORY_ID]],
      content: JSON.stringify({ version: 1, devices: [] }),
    })
    expect(() =>
      checkWire(f.wire, f.device.pubkey, f.peer.pubkey, f.peer.pubkey, inspectDirectory(removed, f.account.pubkey))
    ).toThrow('Unauthorized')
  } finally {
    f.close()
  }
})
it('rejects tampered certificates, an unapproved signer, a changed recipient and account substitution', async () => {
  const f = await fixture()
  try {
    const current = inspectDirectory(f.roster, f.account.pubkey)
    expect(() =>
      inspectDirectory(
        { ...f.roster, content: JSON.stringify({ version: 1, devices: [f.peer.pubkey] }) },
        f.account.pubkey
      )
    ).toThrow()
    expect(() => checkWire(f.wire, f.peer.pubkey, f.peer.pubkey, f.peer.pubkey, current)).toThrow()
    expect(() => checkWire(f.wire, f.device.pubkey, f.device.pubkey, f.device.pubkey, current)).toThrow()
    const attack = await f.peer.signEvent({ ...f.wire.message, content: f.wire.message.content })
    expect(() =>
      checkWire({ ...f.wire, message: attack }, f.peer.pubkey, f.peer.pubkey, f.peer.pubkey, current)
    ).toThrow()
    const forged = {
      ...f.wire,
      message: { ...f.wire.message, content: JSON.stringify({ recipient: f.device.pubkey, text: 'forged' }) },
    }
    expect(() => checkWire(forged, f.device.pubkey, f.peer.pubkey, f.peer.pubkey, current)).toThrow()
  } finally {
    f.close()
  }
})
