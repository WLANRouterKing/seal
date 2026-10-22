import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent, type Event } from 'nostr-tools'
import { bytesToHex } from '@noble/hashes/utils'
import { type AccountSigner } from '../accountSigner'

// Seal-specific device control protocol, not NIP-46 remote signing.
// Ephemeral encrypted events: reconnecting clients explicitly request fresh data.
export const DEVICE_KIND = 24134
export const PROTOCOL = 'seal-device-link-v1'
export const now = () => Math.floor(Date.now() / 1000)
export const randomId = () => bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
export const isKey = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export type LinkRequest = { account: string; name: string; relays: string[]; expires: number; session: string }
export type InspectedRequest = LinkRequest & { event: Event; code: string }
export interface Packet {
  protocol: typeof PROTOCOL
  session: string
  id: string
  seq: number
  op: string
  data: unknown
}

export function relayURLs(input: unknown): string[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 3) throw new Error('Select 1–3 secure relays')
  return [
    ...new Set(
      input.map((value) => {
        if (typeof value !== 'string' || value.length > 256) throw new Error('Invalid relay')
        const url = new URL(value)
        if (url.protocol !== 'wss:' || url.username || url.password || url.hash || url.search)
          throw new Error('Invalid secure relay')
        return url.href.replace(/\/$/, '')
      })
    ),
  ]
}
export function newDeviceSecret() {
  const bytes = generateSecretKey()
  try {
    return bytesToHex(bytes)
  } finally {
    bytes.fill(0)
  }
}
export function makeRequest(secret: string, input: LinkRequest): Event {
  // Request stays in QR/text; it is never published as a plaintext relay event.
  const bytes = Uint8Array.from(secret.match(/../g)!, (h) => parseInt(h, 16))
  try {
    return finalizeEvent(
      { kind: DEVICE_KIND, created_at: input.expires - 300, tags: [['d', PROTOCOL]], content: JSON.stringify(input) },
      bytes
    )
  } finally {
    bytes.fill(0)
  }
}
export function inspectRequest(text: string, clock = now()): InspectedRequest {
  if (text.length > 4096) throw new Error('Pairing request too large')
  const event: Event = JSON.parse(text)
  if (
    !verifyEvent(event) ||
    event.kind !== DEVICE_KIND ||
    JSON.stringify(event.tags) !== JSON.stringify([['d', PROTOCOL]])
  )
    throw new Error('Invalid pairing signature')
  const body: LinkRequest = JSON.parse(event.content)
  if (
    Object.keys(body).sort().join() !== 'account,expires,name,relays,session' ||
    !isKey(body.account) ||
    !isKey(body.session) ||
    typeof body.name !== 'string' ||
    !body.name.trim() ||
    body.name.length > 60
  )
    throw new Error('Invalid device identity')
  if (
    !Number.isInteger(body.expires) ||
    body.expires !== event.created_at + 300 ||
    event.created_at > clock + 30 ||
    body.expires <= clock
  )
    throw new Error('Pairing expired')
  return { ...body, relays: relayURLs(body.relays), event, code: event.id.slice(0, 24).match(/.{4}/g)!.join('-') }
}
export async function sealPacket(signer: AccountSigner, recipient: string, packet: Packet): Promise<Event> {
  signer.assertActive()
  if (!isKey(recipient) || !isKey(packet.session) || !isKey(packet.id)) throw new Error('Invalid packet scope')
  const json = JSON.stringify(packet)
  if (new TextEncoder().encode(json).length > 48000) throw new Error('Device response too large')
  const event = await signer.signEvent({
    kind: DEVICE_KIND,
    created_at: now(),
    tags: [['p', recipient]],
    content: await signer.encrypt(recipient, json),
  })
  signer.assertActive()
  return event
}
export async function openPacket(
  signer: AccountSigner,
  sender: string,
  event: Event,
  session: string,
  clock = now()
): Promise<Packet> {
  // Verify fresh copies: never rely on a caller-provided signature cache.
  event = JSON.parse(JSON.stringify(event))
  if (
    event.content.length > 70000 ||
    !verifyEvent(event) ||
    event.kind !== DEVICE_KIND ||
    event.pubkey !== sender ||
    Math.abs(event.created_at - clock) > 90 ||
    JSON.stringify(event.tags) !== JSON.stringify([['p', signer.pubkey]])
  )
    throw new Error('Untrusted device event')
  const packet: Packet = JSON.parse(await signer.decrypt(sender, event.content))
  signer.assertActive()
  if (
    packet.protocol !== PROTOCOL ||
    packet.session !== session ||
    !isKey(packet.id) ||
    !Number.isSafeInteger(packet.seq) ||
    packet.seq < 0 ||
    typeof packet.op !== 'string'
  )
    throw new Error('Invalid device packet')
  return packet
}
export function publicKey(secret: string) {
  const bytes = Uint8Array.from(secret.match(/../g)!, (h) => parseInt(h, 16))
  try {
    return getPublicKey(bytes)
  } finally {
    bytes.fill(0)
  }
}
