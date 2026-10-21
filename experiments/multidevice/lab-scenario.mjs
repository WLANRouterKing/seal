// Local test-account simulator, not a remote-device enrollment service.
import { unlockGiftWrap } from 'applesauce-common/helpers/gift-wrap'
import { createAccount, createDevice, MemoryRelay, pairingSigner, receive, RELAYS, send, wireCopy } from './harness.mjs'
import { DeviceVault } from './device-vault.mjs'
import { createPairingRequest, approvePairing } from './pairing.mjs'
import { DeviceRegistry } from './device-registry.mjs'
const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, '0')).join('')

export class LabScenario {
  #browser
  #browserGroup
  #phone
  #phoneGroup
  #peer
  #peerGroup
  #account
  #peerAccount
  #pending
  #pairing
  #stores
  #relay = new MemoryRelay()
  #registry
  #phase = 'new'
  #offline = false
  #vault
  get phase() {
    return this.#phase
  }
  get offline() {
    return this.#offline
  }
  get locked() {
    return this.#vault?.locked ?? true
  }
  get request() {
    return wireCopy(this.#pending.request)
  }
  get confirmation() {
    return this.#pending.confirmation
  }
  async prepare(backend, password) {
    if (this.#phase !== 'new') throw new Error('Already initialized')
    this.#phase = 'preparing'
    this.#account = createAccount()
    this.#peerAccount = createAccount()
    this.#phone = createDevice(this.#account.signer, this.#relay)
    this.#peer = createDevice(this.#peerAccount.signer, this.#relay)
    const deviceId = randomId()
    this.#vault = new DeviceVault(backend, this.#account.pubkey, deviceId)
    await this.#vault.create(password)
    this.#stores = { clientId: deviceId }
    for (const name of [
      'groupStateStore',
      'keyPackageStore',
      'ingestStateStore',
      'lifecycleStore',
      'rewindStore',
      'removedMarkerStore',
      'inviteStore',
    ]) {
      this.#stores[name] = this.#vault.store(name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()))
    }
    // Main-device roster is RAM-only in this lab; the browser vault persists
    // only this browser's secrets. Production needs its own main-device vault.
    const rows = new Map()
    const store = {
      getItem: async (k) => structuredClone(rows.get(k)),
      setItem: async (k, v) => rows.set(k, structuredClone(v)),
      keys: async () => [...rows.keys()],
    }
    this.#registry = new DeviceRegistry(store, this.#account.pubkey, this.#phone.client)
    this.#pending = createPairingRequest(this.#account.pubkey, deviceId)
    this.#phase = 'pending'
  }
  async pair(phoneCode, browserCode) {
    if (this.#phase !== 'pending' || this.locked) throw new Error('No pending unlocked device')
    if (phoneCode !== this.confirmation || browserCode !== this.confirmation) throw new Error('Confirm on both devices')
    this.#phase = 'pairing'
    try {
      this.#pairing = pairingSigner(this.#account.pubkey, this.#account.signer.signEvent)
      this.#browser = createDevice(this.#pairing.signer, this.#relay, this.#stores)
      await this.#browser.client.keyPackages.create({ relays: RELAYS })
      const browserPackage = this.#relay.latest(30443)
      await this.#peer.client.keyPackages.create({ relays: RELAYS })
      const peerPackage = this.#relay.latest(30443)
      this.#phoneGroup = await this.#phone.client.groups.create('Seal device lab', {
        relays: RELAYS,
        invitees: [browserPackage, peerPackage],
      })
      const welcomes = this.#relay.events.filter((e) => e.kind === 1059)
      const forAccount = (pubkey) => wireCopy(welcomes.find((e) => e.tags.some((t) => t[0] === 'p' && t[1] === pubkey)))
      const welcome = await unlockGiftWrap(forAccount(this.#account.pubkey), this.#account.signer)
      const response = await approvePairing(
        this.request,
        this.#account.signer,
        { welcome: wireCopy(welcome) },
        phoneCode
      )
      const bundle = await this.#pending.accept(response, browserCode)
      this.#browserGroup = (await this.#browser.client.joinGroupFromWelcome({ welcomeRumor: bundle.welcome })).group
      const peerWelcome = await unlockGiftWrap(forAccount(this.#peerAccount.pubkey), this.#peerAccount.signer)
      this.#peerGroup = (await this.#peer.client.joinGroupFromWelcome({ welcomeRumor: peerWelcome })).group
      await this.#registry.register(this.#stores.clientId, 'Test-Browser', this.#browserGroup)
      this.#phase = 'linked'
    } catch (error) {
      this.#phase = 'failed'
      throw error
    } finally {
      this.#pairing?.finish()
    }
  }
  setPhoneOffline(offline) {
    this.#offline = offline
    if (offline) this.#account.goOffline()
    else this.#account.goOnline()
  }
  async exchange(text) {
    if (this.#phase !== 'linked' || this.locked) throw new Error('Browser not active')
    const before = this.#account.calls
    await send(this.#browser, this.#browserGroup, this.#account.pubkey, text)
    const sent = await receive(this.#peerGroup, [this.#relay.latest(445)])
    await send(this.#peer, this.#peerGroup, this.#peerAccount.pubkey, 'Antwort: ' + text)
    const received = await receive(this.#browserGroup, [this.#relay.latest(445)])
    if (this.#offline && before !== this.#account.calls) throw new Error('Unexpected account-signer call')
    return { sent: sent.messages[0]?.content, received: received.messages[0]?.content }
  }
  async lock() {
    this.#vault.lock()
    // Drop client instances, including in-memory MLS state. This does not
    // promise physical JS heap zeroization.
    this.#browser = undefined
    this.#browserGroup = undefined
  }
  async unlock(password) {
    if (this.#phase !== 'linked') throw new Error('Device is not linked')
    await this.#vault.unlock(password)
    this.#browser = createDevice(this.#pairing.signer, this.#relay, this.#stores)
    this.#browserGroup = await this.#browser.client.groups.get(this.#phoneGroup.id)
  }
  async devices() {
    return this.#registry.list()
  }
  async remove() {
    if (this.#offline) throw new Error('Bring the removing device online first')
    if (this.#phase !== 'linked') throw new Error('Device is not linked')
    const record = await this.#registry.remove(this.#stores.clientId)
    if (!record.chats.every((chat) => chat.status === 'removed'))
      throw new Error(record.chats.find((c) => c.error)?.error || 'Removal pending')
    const removal = this.#relay.latest(445)
    await receive(this.#peerGroup, [removal])
    if (this.#browserGroup) await receive(this.#browserGroup, [removal])
    this.#phase = 'removed'
    await this.lock()
    return record
  }
  async erase() {
    this.#pending?.cancel()
    await this.lock()
    await this.#vault.erase()
    this.#phase = 'erased'
  }
}
