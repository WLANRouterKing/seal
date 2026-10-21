import assert from 'node:assert/strict'
import { test } from 'node:test'
import { unlockGiftWrap } from 'applesauce-common/helpers/gift-wrap'
import {
  copyStores,
  createAccount,
  createDevice,
  MemoryRelay,
  pairingSigner,
  receive,
  RELAYS,
  send,
  wireCopy,
} from './harness.mjs'

// Full same-account control with the explicit pinned experimental library fix.
test('same-account devices: offline messaging, restart, then removal', { timeout: 60000 }, async () => {
  const relay = new MemoryRelay()
  const alice = createAccount()
  const browserAccount = alice
  const bob = createAccount()
  const phone = createDevice(alice.signer, relay)
  const pairing = pairingSigner(browserAccount.pubkey, browserAccount.signer.signEvent)
  let browser = createDevice(pairing.signer, relay)
  const peer = createDevice(bob.signer, relay)

  await browser.client.keyPackages.create({ relays: RELAYS })
  const browserPackage = relay.latest(30443)
  await peer.client.keyPackages.create({ relays: RELAYS })
  const peerPackage = relay.latest(30443)
  const phoneGroup = await phone.client.groups.create('Offline device experiment', {
    relays: RELAYS,
    adminPubkeys: [alice.pubkey],
    invitees: [browserPackage, peerPackage],
  })
  const welcomes = relay.events.filter((e) => e.kind === 1059)
  const forAccount = (pubkey) => wireCopy(welcomes.find((e) => e.tags.some((t) => t[0] === 'p' && t[1] === pubkey)))
  // Main device decrypts the outer account inbox wrapper. Only the MLS Welcome
  // is handed to the browser; it still needs its own private KeyPackage to join.
  // The authenticated pairing transport for this handoff is not implemented.
  const browserWelcome = await unlockGiftWrap(forAccount(browserAccount.pubkey), browserAccount.signer)
  const peerWelcome = await unlockGiftWrap(forAccount(bob.pubkey), bob.signer)
  let { group: browserGroup } = await browser.client.joinGroupFromWelcome({ welcomeRumor: wireCopy(browserWelcome) })
  const { group: peerGroup } = await peer.client.joinGroupFromWelcome({ welcomeRumor: wireCopy(peerWelcome) })
  assert.notEqual(browserGroup.state.privatePath.leafIndex, phoneGroup.state.privatePath.leafIndex)
  assert.notDeepEqual(browserGroup.state.signaturePrivateKey, phoneGroup.state.signaturePrivateKey)

  pairing.finish()
  alice.goOffline()
  browserAccount.goOffline()
  const signingCalls = alice.calls
  const browserSigningCalls = browserAccount.calls
  await send(browser, browserGroup, browserAccount.pubkey, 'Browser sends while phone is off')
  assert.equal((await receive(peerGroup, [relay.latest(445)])).messages[0]?.content, 'Browser sends while phone is off')
  await send(peer, peerGroup, bob.pubkey, 'Reply with phone still off')
  assert.equal((await receive(browserGroup, [relay.latest(445)])).messages[0]?.content, 'Reply with phone still off')
  assert.equal(alice.calls, signingCalls, 'no hidden remote signing/decryption')
  assert.equal(browserAccount.calls, browserSigningCalls)

  // Keep an independently hydrated stale copy that will NEVER see the removal.
  // Revocation must derive new secrets, not just set a cooperative UI flag.
  const groupId = browserGroup.id
  const staleBrowser = createDevice(pairing.signer, relay, await copyStores(browser.stores))
  const staleGroup = await staleBrowser.client.groups.get(groupId)
  assert.equal(pairing.denied, 0)
  assert(!JSON.stringify(relay.events).includes('Browser sends while phone is off'))

  // New client instance, own persisted state only. No state cloned from phone.
  browser = createDevice(pairing.signer, relay, browser.stores)
  browserGroup = await browser.client.groups.get(groupId)
  await send(browser, browserGroup, browserAccount.pubkey, 'Browser after restart')
  assert.equal((await receive(peerGroup, [relay.latest(445)])).messages[0]?.content, 'Browser after restart')
  assert.equal(alice.calls, signingCalls)
  assert.equal(browserAccount.calls, browserSigningCalls)

  // Main returns and removes precisely the browser leaf, preserving its own.
  alice.goOnline()
  const catchup = await receive(
    phoneGroup,
    relay.events.filter((event) => event.kind === 445)
  )
  assert(
    catchup.messages.some((message) => message.content === 'Browser after restart' && message.pubkey === alice.pubkey),
    'Main device must recognize its sibling leaf messages'
  )
  const removedIndex = browserGroup.state.privatePath.leafIndex
  await phone.client.groups.commit(phoneGroup.id, {
    extraProposals: [{ proposalType: 3, remove: { removed: removedIndex } }],
  })
  const removal = relay.latest(445)
  await receive(peerGroup, [removal])
  await receive(browserGroup, [removal])
  assert.equal(browserGroup.status, 'removed')
  await send(phone, phoneGroup, alice.pubkey, 'Only remaining devices can read this')
  const afterRemoval = relay.latest(445)
  assert.equal((await receive(peerGroup, [afterRemoval])).messages[0]?.content, 'Only remaining devices can read this')
  assert.equal((await receive(browserGroup, [afterRemoval])).messages.length, 0)
  assert.equal((await receive(staleGroup, [afterRemoval])).messages.length, 0)
  await assert.rejects(() => send(browser, browserGroup, browserAccount.pubkey, 'Removed browser'), /removed|inactive/i)
})

test('same-account fix still rejects invalid account-to-leaf proofs', async () => {
  const relay = new MemoryRelay()
  const account = createAccount()
  const attacker = createAccount()
  const brokenSigner = {
    getPublicKey: account.signer.getPublicKey,
    signEvent: async (event) =>
      event.kind === 450 ? attacker.signer.signEvent(event) : account.signer.signEvent(event),
  }
  const browser = createDevice(brokenSigner, relay)
  await assert.rejects(() => browser.client.keyPackages.create({ relays: RELAYS }))
})

test('same-account fix still rejects adding the very same leaf twice', async () => {
  const relay = new MemoryRelay()
  const account = createAccount()
  const phone = createDevice(account.signer, relay)
  const browser = createDevice(account.signer, relay)
  await browser.client.keyPackages.create({ relays: RELAYS })
  const keyPackage = relay.latest(30443)
  const group = await phone.client.groups.create('Duplicate guard', { relays: RELAYS, invitees: [keyPackage] })
  const epoch = group.state.groupContext.epoch
  await assert.rejects(() => phone.client.groups.invite(group.id, keyPackage), /already|duplicate/i)
  assert.equal(group.state.groupContext.epoch, epoch)
})
