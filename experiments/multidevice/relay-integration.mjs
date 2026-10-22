import { fork } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'

const relays = process.argv.slice(2)
if (!relays.length) throw new Error('Usage: npm run test:relays -- wss://YOUR-RELAY (publishes encrypted test events)')
const workers = []
function spawn(name, authorize) {
  const child = fork(new URL('./relay-worker.mjs', import.meta.url), [], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })
  let serial = 0
  const pending = new Map()
  child.on('message', async (message) => {
    if (message.signRequest) {
      try {
        const event = await authorize(message.event)
        child.send({ signResponse: message.signRequest, event })
      } catch (error) {
        child.send({ signResponse: message.signRequest, error: error.message })
      }
      return
    }
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    if (message.error) request.reject(new Error(name + ': ' + message.error))
    else request.resolve(message.result)
  })
  child.on('exit', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(new Error(name + ' exited'))
    }
    pending.clear()
  })
  const worker = {
    child,
    call(action, args = {}) {
      return new Promise((resolve, reject) => {
        const id = ++serial
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(name + '/' + action + ' timeout'))
        }, 40000)
        pending.set(id, { resolve, reject, timer })
        child.send({ id, action, args })
      })
    },
    async stop() {
      if (!child.connected) return
      await worker.call('close')
      child.disconnect()
      child.kill()
    },
  }
  workers.push(worker)
  return worker
}
async function waitFor(worker, text) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const status = await worker.call('status')
    if (status.errors.length) throw new Error(status.errors.join('; '))
    if (status.received.some((m) => m.content === text)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Live subscription did not deliver expected message')
}
const directory = await mkdtemp(join(tmpdir(), 'seal-real-relay-'))
const report = { relays, startedAt: new Date().toISOString(), checks: [] }
const passed = (name) => {
  report.checks.push(name)
  console.log('PASS:', name)
}
try {
  const phone = spawn('phone')
  const peer = spawn('peer')
  const phoneInfo = await phone.call('init', { role: 'phone', relays })
  const peerInfo = await peer.call('init', { role: 'peer', relays })
  const browserArgs = {
    role: 'browser',
    relays,
    account: phoneInfo.pubkey,
    deviceId: randomBytes(32).toString('hex'),
    directory,
    password: randomBytes(32).toString('hex'),
  }
  let browser = spawn('browser', (event) => phone.call('authorize', { event }))
  const browserInfo = await browser.call('init', browserArgs)
  assert.equal(new Set([phoneInfo.pid, peerInfo.pid, browserInfo.pid]).size, 3)
  assert.equal(browserInfo.pubkey, phoneInfo.pubkey)
  await phone.call('inbox')
  await peer.call('inbox')
  const browserPackage = await browser.call('keyPackage')
  const peerPackage = await peer.call('keyPackage')
  const group = await phone.call('createGroup', { ids: [browserPackage, peerPackage] })
  // Setup fixture only: primary unwraps the account inbox Welcome. No account
  // private key is transferred. User-facing QR enrollment is a separate task.
  const browserWelcome = await phone.call('welcome', { packageId: browserPackage })
  const peerWelcome = await peer.call('welcome', { packageId: peerPackage })
  const browserLeaf = await browser.call('join', { welcome: browserWelcome })
  await peer.call('join', { welcome: peerWelcome })
  await browser.call('finishPairing')
  await phone.call('finishPairing')
  passed('three processes; signed KeyPackages and encrypted Welcomes fetched from real relay')
  await phone.call('offline')
  const before = (await phone.call('status')).calls
  await peer.call('watch', { route: group.route })
  const first = 'seal relay test ' + randomBytes(8).toString('hex')
  await browser.call('send', { text: first })
  await waitFor(peer, first)
  passed('browser -> peer via live relay subscription, primary disconnected')
  await browser.call('watch', { route: group.route })
  const reply = 'reply ' + randomBytes(8).toString('hex')
  await peer.call('send', { text: reply })
  await waitFor(browser, reply)
  assert.equal((await phone.call('status')).calls, before)
  passed('peer -> browser; no account signer calls while primary offline')
  await browser.stop()
  const missed = 'offline delivery ' + randomBytes(8).toString('hex')
  await peer.call('send', { text: missed })
  browser = spawn('restarted-browser', () => {
    throw new Error('Pairing is closed')
  })
  await browser.call('init', { ...browserArgs, restore: true, groupId: group.groupId })
  const catchup = await browser.call('pull', { route: group.route })
  assert(catchup.messages.some((m) => m.content === missed))
  passed('browser process restart; encrypted state restored and missed message fetched from relay')
  const afterRestart = 'restart send ' + randomBytes(8).toString('hex')
  await browser.call('send', { text: afterRestart })
  await waitFor(peer, afterRestart)
  await phone.call('online')
  const phoneCatchup = await phone.call('pull', { route: group.route })
  assert(phoneCatchup.messages.some((m) => m.content === afterRestart && m.pubkey === phoneInfo.pubkey))
  passed('primary reconnects and receives sibling-device messages from relay')
  // Close the live peer subscription before the explicit sequential commit pull.
  await peer.call('offline')
  await peer.call('online')
  const removalId = await phone.call('remove', { leaf: browserLeaf.leaf })
  await peer.call('pull', { ids: [removalId] })
  // Removed browser deliberately does NOT receive its removal first.
  const secret = 'post-removal ' + randomBytes(8).toString('hex')
  const final = await phone.call('send', { text: secret })
  assert((await peer.call('pull', { ids: [final.eventId] })).messages.some((m) => m.content === secret))
  assert.equal((await browser.call('pull', { ids: [final.eventId] })).messages.length, 0)
  await browser.call('pull', { ids: [removalId] })
  assert.equal((await browser.call('status')).status, 'removed')
  await assert.rejects(() => browser.call('send', { text: 'must fail' }), /removed|inactive/i)
  passed('real relay removal commit; stale removed browser cannot decrypt new epoch or send after removal')
  report.wireChecks = await Promise.all(
    [phone, peer, browser].map((worker) =>
      worker.call('status').then(({ wireChecks, trackedSecrets }) => ({ wireChecks, trackedSecrets }))
    )
  )
  assert(report.wireChecks.every((result) => result.wireChecks > 0 && result.trackedSecrets > 0))
  passed('outgoing events checked for raw/hex/base64/JSON leakage of tracked private and group keys')
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  report.error = error.message
  console.error(error)
  process.exitCode = 1
} finally {
  for (const worker of workers) await worker.stop().catch(() => worker.child.kill())
  await rm(directory, { recursive: true, force: true })
  report.finishedAt = new Date().toISOString()
  if (process.env.SEAL_RELAY_REPORT)
    await writeFile(process.env.SEAL_RELAY_REPORT, JSON.stringify(report, null, 2) + '\n')
}
