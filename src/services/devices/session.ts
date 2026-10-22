import type { Event } from 'nostr-tools'
import { createLocalAccountSigner, type AccountSigner, type LocalAccountSigner } from '../accountSigner'
import {
  PROTOCOL,
  inspectRequest,
  newDeviceSecret,
  now,
  openPacket,
  publicKey,
  randomId,
  sealPacket,
  isKey,
  type InspectedRequest,
  type Packet,
} from './protocol'
import type { StateStore } from './storage'

export interface Transport {
  listen(recipient: string, receive: (event: Event) => void): () => void
  publish(event: Event): Promise<void>
  close(): void
}
export type TransportFactory = (relays: string[]) => Transport
export interface LinkedDevice {
  pubkey: string
  name: string
  session: string
  requestId: string
  relays: string[]
  expires: number
  linkedAt: number
  lastSeen: number
  seq: number
  status: 'pending' | 'linked' | 'removed'
}
export interface PrimaryState {
  account: string
  secret: string
  devices: LinkedDevice[]
}
export interface CompanionState {
  account: string
  secret: string
  request: Event
  host?: string
  confirmed: boolean
  seq: number
}
export interface DeviceMessage {
  id: string
  content: string
  createdAt: number
  isOutgoing: boolean
  status: string
  expiration?: number
}
export interface DeviceChat {
  pubkey: string
  name: string
  updatedAt: number
}
export type DeviceCommand =
  | { op: 'chats' }
  | { op: 'history'; peer: string; before?: number }
  | { op: 'send'; peer: string; text: string }
export function parseCommand(op: string, input: unknown): DeviceCommand {
  if (op === 'chats') return { op }
  if (!input || typeof input !== 'object') throw new Error('Invalid command')
  const data = input as Record<string, unknown>
  if (!isKey(data.peer)) throw new Error('Invalid recipient')
  if (op === 'history' && (data.before === undefined || (Number.isSafeInteger(data.before) && Number(data.before) > 0)))
    return { op, peer: data.peer, before: data.before as number | undefined }
  if (op === 'send' && typeof data.text === 'string' && data.text.trim() && data.text.length <= 4000)
    return { op, peer: data.peer, text: data.text }
  throw new Error('Device operation not permitted')
}

export class PrimarySession {
  private signer: LocalAccountSigner
  private transports = new Map<string, Transport>()
  private queue = Promise.resolve()
  private active = true
  readonly state: PrimaryState
  private store: StateStore<PrimaryState>
  private account: AccountSigner
  private factory: TransportFactory
  private execute: (command: DeviceCommand) => Promise<unknown>
  private changed: () => void
  constructor(
    state: PrimaryState,
    store: StateStore<PrimaryState>,
    account: AccountSigner,
    factory: TransportFactory,
    execute: (command: DeviceCommand) => Promise<unknown>,
    changed: () => void = () => {}
  ) {
    this.state = state
    this.store = store
    this.account = account
    this.factory = factory
    this.execute = execute
    this.changed = changed
    if (state.account !== account.pubkey) throw new Error('Wrong primary account')
    this.signer = createLocalAccountSigner(state.secret)
    for (const device of state.devices) if (device.status !== 'removed') this.transport(device.relays)
  }
  static async create(
    store: StateStore<PrimaryState>,
    account: AccountSigner,
    factory: TransportFactory,
    execute: (command: DeviceCommand) => Promise<unknown>,
    changed?: () => void
  ) {
    let state = await store.load()
    if (!state) {
      state = { account: account.pubkey, secret: newDeviceSecret(), devices: [] }
      await store.save(state)
    }
    return new PrimarySession(state, store, account, factory, execute, changed)
  }
  private check() {
    if (!this.active) throw new Error('Primary session closed')
    this.store.assertActive()
    this.account.assertActive()
  }
  private transport(relays: string[]) {
    const key = JSON.stringify(relays)
    let transport = this.transports.get(key)
    if (!transport) {
      transport = this.factory(relays)
      transport.listen(this.signer.pubkey, (event) => {
        // One serial queue for authorization changes and message requests.
        this.enqueue(() => this.receive(event)).catch(() => {})
      })
      this.transports.set(key, transport)
    }
    return transport
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => {
      this.check()
      return operation()
    })
    this.queue = result.then(
      () => {},
      () => {}
    )
    return result
  }
  list() {
    return this.state.devices.map((device) => ({ ...device }))
  }
  approve(request: InspectedRequest, code: string): Promise<void> {
    return this.enqueue(async () => {
      const verified = inspectRequest(JSON.stringify(request.event))
      if (verified.account !== this.account.pubkey || verified.code !== code)
        throw new Error('Wrong account or confirmation code')
      if (
        this.state.devices.some(
          (device) => device.session === verified.session || device.pubkey === verified.event.pubkey
        )
      )
        throw new Error('Request already used; create a new request')
      if (this.state.devices.filter((device) => device.status !== 'removed').length >= 10)
        throw new Error('Maximum 10 linked devices')
      const device: LinkedDevice = {
        pubkey: verified.event.pubkey,
        name: verified.name,
        session: verified.session,
        requestId: verified.event.id,
        relays: verified.relays,
        expires: verified.expires,
        linkedAt: now(),
        lastSeen: 0,
        seq: 0,
        status: 'pending',
      }
      this.state.devices.push(device)
      // Persist authorization before any grant can leave this process.
      await this.store.save(this.state)
      this.check()
      this.changed()
      await this.deliverGrant(device)
    })
  }
  resend(pubkey: string) {
    return this.enqueue(async () => {
      const device = this.state.devices.find((device) => device.pubkey === pubkey)
      if (!device || device.status !== 'pending' || device.expires <= now())
        throw new Error('Pairing expired or already confirmed')
      await this.deliverGrant(device)
    })
  }
  private async deliverGrant(device: LinkedDevice) {
    const event = await sealPacket(this.account, device.pubkey, {
      protocol: PROTOCOL,
      session: device.session,
      id: device.requestId,
      seq: 0,
      op: 'grant',
      data: { account: this.account.pubkey, host: this.signer.pubkey },
    })
    this.check()
    await this.transport(device.relays).publish(event)
  }
  remove(pubkey: string) {
    return this.enqueue(async () => {
      const device = this.state.devices.find((device) => device.pubkey === pubkey)
      if (!device) throw new Error('Unknown device')
      // This is the authority: relay delivery of the courtesy notice is not required.
      device.status = 'removed'
      await this.store.save(this.state)
      this.check()
      this.changed()
      const packet: Packet = {
        protocol: PROTOCOL,
        session: device.session,
        id: randomId(),
        seq: device.seq,
        op: 'removed',
        data: null,
      }
      await this.transport(device.relays)
        .publish(await sealPacket(this.signer, device.pubkey, packet))
        .catch(() => {})
    })
  }
  private async receive(event: Event) {
    this.check()
    const device = this.state.devices.find((device) => device.pubkey === event.pubkey && device.status !== 'removed')
    if (!device) return
    const packet = await openPacket(this.signer, device.pubkey, event, device.session)
    if (packet.seq <= device.seq || packet.seq > device.seq + 1000) return
    if (packet.op === 'confirm' && packet.data !== device.requestId) return
    if (
      device.status === 'pending' &&
      (device.expires <= now() || packet.op !== 'confirm' || packet.data !== device.requestId)
    )
      return
    let command: DeviceCommand | undefined
    if (packet.op !== 'confirm') command = parseCommand(packet.op, packet.data)
    // Durable high-water mark before effects: replay cannot cause a second send.
    device.seq = packet.seq
    device.lastSeen = now()
    if (packet.op === 'confirm') device.status = 'linked'
    await this.store.save(this.state)
    this.check()
    this.changed()
    let response: unknown
    let op = 'result'
    try {
      response = command ? await this.execute(command) : { linked: true }
    } catch {
      op = 'error'
      response = 'Request failed on the primary device'
    }
    this.check()
    const reply = await sealPacket(this.signer, device.pubkey, { ...packet, op, data: response })
    this.check()
    await this.transport(device.relays).publish(reply)
  }
  close() {
    this.active = false
    this.signer.dispose()
    this.state.secret = ''
    for (const transport of this.transports.values()) transport.close()
    this.transports.clear()
  }
}

export class CompanionSession {
  private signer: LocalAccountSigner
  private transport: Transport
  private active = true
  private pending = new Map<
    string,
    { seq: number; resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
  >()
  private queue = Promise.resolve()
  grant?: { host: string }
  readonly state: CompanionState
  private store: StateStore<CompanionState>
  private changed: (status: 'grant' | 'removed') => void
  constructor(
    state: CompanionState,
    store: StateStore<CompanionState>,
    factory: TransportFactory,
    changed: (status: 'grant' | 'removed') => void
  ) {
    this.state = state
    this.store = store
    this.changed = changed
    if (state.host && !state.confirmed) this.grant = { host: state.host }
    if (state.request.pubkey !== publicKey(state.secret)) throw new Error('Device key does not match enrollment')
    this.signer = createLocalAccountSigner(state.secret)
    this.transport = factory(JSON.parse(state.request.content).relays)
    this.transport.listen(this.signer.pubkey, (event) => {
      this.receive(event).catch(() => {})
    })
  }
  private check() {
    if (!this.active) throw new Error('Device session closed')
    this.store.assertActive()
  }
  private async receive(event: Event) {
    this.check()
    const info = JSON.parse(this.state.request.content)
    if (!this.state.confirmed && event.pubkey === this.state.account) {
      inspectRequest(JSON.stringify(this.state.request))
      const packet = await openPacket(this.signer, this.state.account, event, info.session)
      const grant = packet.data as { account: string; host: string }
      if (
        packet.op !== 'grant' ||
        packet.id !== this.state.request.id ||
        packet.seq !== 0 ||
        grant.account !== this.state.account ||
        !isKey(grant.host)
      )
        return
      this.grant = { host: grant.host }
      this.changed('grant')
      return
    }
    const host = this.state.host ?? this.grant?.host
    if (!host) return
    const packet = await openPacket(this.signer, host, event, info.session)
    if (packet.op === 'removed') {
      this.changed('removed')
      this.close()
      return
    }
    const request = this.pending.get(packet.id)
    if (!request || request.seq !== packet.seq || !['result', 'error'].includes(packet.op)) return
    clearTimeout(request.timer)
    this.pending.delete(packet.id)
    if (packet.op === 'error') request.reject(new Error('Request failed on the primary device'))
    else request.resolve(packet.data)
  }
  async confirm(code: string) {
    this.check()
    const request = inspectRequest(
      JSON.stringify(this.state.request),
      this.state.host ? this.state.request.created_at : now()
    )
    if (request.code !== code || !this.grant) throw new Error('Compare both device codes first')
    this.state.host = this.grant.host
    await this.request('confirm', this.state.request.id)
    this.check()
    this.state.confirmed = true
    await this.store.save(this.state)
  }
  request(op: string, data: unknown): Promise<unknown> {
    // Persist each sequence before send; only allow one outstanding user request.
    const operation = this.queue.then(async () => {
      this.check()
      if (!this.state.host) throw new Error('Device is not linked')
      const packet: Packet = {
        protocol: PROTOCOL,
        session: JSON.parse(this.state.request.content).session,
        id: randomId(),
        seq: ++this.state.seq,
        op,
        data,
      }
      await this.store.save(this.state)
      this.check()
      const event = await sealPacket(this.signer, this.state.host, packet)
      this.check()
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(packet.id)
          reject(
            new Error(
              'Primary device unavailable. Open and unlock Seal there. A timed-out send may have arrived; check the chat before retrying.'
            )
          )
        }, 20000)
        this.pending.set(packet.id, { seq: packet.seq, resolve, reject, timer })
        this.transport.publish(event).catch(() => {
          clearTimeout(timer)
          this.pending.delete(packet.id)
          reject(new Error('No relay acknowledged the request'))
        })
      })
    })
    this.queue = operation.then(
      () => {},
      () => {}
    )
    return operation
  }
  close() {
    this.active = false
    this.signer.dispose()
    this.state.secret = ''
    this.grant = undefined
    this.transport.close()
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.reject(new Error('Device locked'))
    }
    this.pending.clear()
  }
}
