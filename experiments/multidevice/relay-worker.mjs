// One OS process per device. The parent coordinates test actions, not messages.
import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises'
import { serialize, deserialize } from 'node:v8'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { deserializeClientState } from '@internet-privacy/marmot-ts/core'
import { WireSecretGuard } from './wire-secrets.mjs'
import { unlockGiftWrap } from 'applesauce-common/helpers/gift-wrap'
import { createAccount, createDevice, receive, send } from './harness.mjs'
import { RelayNetwork } from './relay-network.mjs'
import { DeviceVault } from './device-vault.mjs'
const hex = (bytes) => Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('')
let network,
  device,
  account,
  signer,
  group,
  vault,
  options,
  watch,
  active = true
let received = [],
  errors = [],
  queue = Promise.resolve()
const signingRequests = new Map()
let serial = 0
const guard = new WireSecretGuard()

async function fileBackend(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const path = (key) => join(directory, createHash('sha256').update(key).digest('hex'))
  return {
    async get(key) {
      try {
        return deserialize(await readFile(path(key))).value
      } catch (e) {
        if (e.code === 'ENOENT') return undefined
        throw e
      }
    },
    async set(key, value) {
      const temp = path(key) + '.' + randomUUID() + '.tmp'
      await writeFile(temp, serialize({ key, value }), { mode: 0o600 })
      await rename(temp, path(key))
    },
    async add(key, value) {
      await writeFile(path(key), serialize({ key, value }), { flag: 'wx', mode: 0o600 })
    },
    async remove(key) {
      await unlink(path(key)).catch((e) => {
        if (e.code !== 'ENOENT') throw e
      })
    },
    async keys() {
      return Promise.all(
        (await readdir(directory))
          .filter((name) => !name.endsWith('.tmp'))
          .map(async (name) => deserialize(await readFile(join(directory, name))).key)
      )
    },
  }
}
function remoteSign(event) {
  if (!active || ![450, 30443].includes(event.kind)) return Promise.reject(new Error('Pairing signing disabled'))
  return new Promise((resolve, reject) => {
    const id = ++serial
    const timer = setTimeout(() => {
      signingRequests.delete(id)
      reject(new Error('Pairing RPC timeout'))
    }, 20000)
    signingRequests.set(id, { resolve, reject, timer })
    process.send({ signRequest: id, event })
  })
}
async function ingest(events) {
  const result = await receive(group, events)
  received.push(...result.messages)
  return result
}
const actions = {
  async init(args) {
    options = args
    network = new RelayNetwork(args.relays)
    network.beforePublish = (event) => {
      if (group) guard.observeState(group.state)
      guard.assertSafe(event)
    }
    if (args.role === 'browser') {
      signer = { getPublicKey: async () => args.account, signEvent: remoteSign }
      vault = new DeviceVault(await fileBackend(args.directory), args.account, args.deviceId)
      if (args.restore) await vault.unlock(args.password)
      else await vault.create(args.password)
      const stores = { clientId: args.deviceId }
      for (const name of [
        'groupStateStore',
        'keyPackageStore',
        'ingestStateStore',
        'lifecycleStore',
        'rewindStore',
        'removedMarkerStore',
        'inviteStore',
      ])
        stores[name] = vault.store(name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()))
      device = createDevice(signer, network, stores)
      if (args.restore) {
        active = false
        group = await device.client.groups.get(args.groupId)
      }
    } else {
      account = createAccount((secret) => guard.add(secret))
      signer = account.signer
      device = createDevice(signer, network)
    }
    for (const name of ['groupStateStore', 'keyPackageStore']) {
      const store = device.stores[name]
      const original = store.setItem.bind(store)
      store.setItem = async (key, value) => {
        if (name === 'keyPackageStore') guard.addTree(value.privatePackage)
        else {
          try {
            guard.observeState(deserializeClientState(value))
          } catch {
            /* non-MLS lifecycle records */
          }
        }
        return original(key, value)
      }
    }
    return { pubkey: await signer.getPublicKey(), pid: process.pid }
  },
  async inbox() {
    return network.publish(
      options.relays,
      await signer.signEvent({
        kind: 10050,
        created_at: Math.floor(Date.now() / 1000),
        tags: options.relays.map((url) => ['relay', url]),
        content: '',
      })
    )
  },
  async authorize({ event }) {
    if (!active || ![450, 30443].includes(event.kind)) throw new Error('Pairing signing disabled')
    return signer.signEvent(event)
  },
  async keyPackage() {
    await device.client.keyPackages.create({ relays: options.relays })
    return network.published.findLast((e) => e.kind === 30443).id
  },
  async createGroup({ ids }) {
    const packages = await network.request(options.relays, { ids })
    if (packages.length !== ids.length) throw new Error('KeyPackages not returned by relay')
    group = await device.client.groups.create('Seal relay integration test', {
      relays: options.relays,
      invitees: packages,
    })
    return { groupId: hex(group.id), route: hex(group.groupData.nostrGroupId) }
  },
  async welcome({ packageId }) {
    const events = await network.request(options.relays, {
      kinds: [1059],
      '#p': [await signer.getPublicKey()],
      limit: 20,
    })
    for (const event of events) {
      const rumor = await unlockGiftWrap(event, signer)
      if (rumor.tags.some((t) => t[0] === 'e' && t[1] === packageId)) return rumor
    }
    throw new Error('Welcome not returned by relay')
  },
  async join({ welcome }) {
    group = (await device.client.joinGroupFromWelcome({ welcomeRumor: welcome })).group
    return { leaf: group.state.privatePath.leafIndex }
  },
  async finishPairing() {
    active = false
    return true
  },
  async offline() {
    active = false
    watch?.unsubscribe()
    network.disconnect()
    account?.goOffline()
    return true
  },
  async online() {
    network.reconnect()
    account?.goOnline()
    return true
  },
  async send({ text }) {
    await send(device, group, await signer.getPublicKey(), text)
    return { eventId: network.published.findLast((event) => event.kind === 445).id }
  },
  async pull({ ids, route }) {
    const events = await network.request(options.relays, ids ? { ids } : { kinds: [445], '#h': [route], limit: 100 })
    return ingest(events)
  },
  async watch({ route }) {
    watch = network.subscription(options.relays, { kinds: [445], '#h': [route] }).subscribe({
      next: (event) => {
        queue = queue.then(() => ingest([event])).catch((e) => errors.push(e.message))
      },
      error: (error) => errors.push(error.message),
    })
    return true
  },
  async status() {
    await queue
    return {
      received,
      errors,
      calls: account?.calls ?? 0,
      status: group?.status,
      wireChecks: guard.checked,
      trackedSecrets: guard.size,
    }
  },
  async remove({ leaf }) {
    await device.client.groups.commit(group.id, { extraProposals: [{ proposalType: 3, remove: { removed: leaf } }] })
    return network.published.findLast((e) => e.kind === 445).id
  },
  async close() {
    network?.disconnect()
    vault?.lock()
    guard.clear()
    return true
  },
}
process.on('message', async (message) => {
  if (message.signResponse) {
    const pending = signingRequests.get(message.signResponse)
    if (!pending) return
    signingRequests.delete(message.signResponse)
    clearTimeout(pending.timer)
    if (message.error) pending.reject(new Error(message.error))
    else pending.resolve(message.event)
    return
  }
  try {
    if (!actions[message.action]) throw new Error('Unknown test action')
    const result = await actions[message.action](message.args || {})
    process.send({ id: message.id, result })
  } catch (error) {
    process.send({ id: message.id, error: error.stack || String(error) })
  }
})
