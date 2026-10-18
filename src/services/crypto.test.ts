// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { generateSecretKey, getPublicKey, finalizeEvent, nip44 } from 'nostr-tools'
import { bytesToHex } from '@noble/hashes/utils'
import { createGiftWrap, createSelfGiftWrap, unwrapGiftWrap } from './crypto'

const sender = generateSecretKey()
const receiver = generateSecretKey()
const receiverPubkey = getPublicKey(receiver)
const receiverHex = bytesToHex(receiver)

describe('gift-wrap authentication', () => {
  it('round-trips messages and unmarked sender archive copies', async () => {
    const wrap = await createGiftWrap('hello', receiverPubkey, bytesToHex(sender))
    expect((await unwrapGiftWrap(wrap, receiverHex))?.content).toBe('hello')
    const self = await createSelfGiftWrap('archive', receiverPubkey, bytesToHex(sender))
    expect(self.tags.some((tag) => tag[0] === 'self')).toBe(false)
    expect((await unwrapGiftWrap(self, bytesToHex(sender)))?.content).toBe('archive')
  })

  it('rejects an invalid outer signature even for stored events', async () => {
    const wrap = await createGiftWrap('hello', receiverPubkey, bytesToHex(sender))
    const tampered = JSON.parse(JSON.stringify(wrap))
    tampered.sig = '00'.repeat(64)
    expect(await unwrapGiftWrap(tampered, receiverHex)).toBeNull()
  })

  // Build valid encryption and an authentic outer wrap around a malicious inner event.
  async function incoming(change: (seal: Record<string, unknown>, rumor: Record<string, unknown>) => void) {
    const rumor = {
      kind: 14,
      pubkey: getPublicKey(sender),
      content: 'hello',
      created_at: 1,
      tags: [['p', receiverPubkey]],
    }
    const fields: Record<string, unknown> = {}
    change(fields, rumor)
    const seal = {
      ...finalizeEvent(
        {
          kind: 13,
          created_at: 1,
          tags: [],
          content: nip44.v2.encrypt(JSON.stringify(rumor), nip44.v2.utils.getConversationKey(sender, receiverPubkey)),
        },
        sender
      ),
      ...fields,
    }
    const wrapper = generateSecretKey()
    return finalizeEvent(
      {
        kind: 1059,
        created_at: 1,
        tags: [['p', receiverPubkey]],
        content: nip44.v2.encrypt(JSON.stringify(seal), nip44.v2.utils.getConversationKey(wrapper, receiverPubkey)),
      },
      wrapper
    )
  }

  it('rejects an invalid inner signature inside a valid outer wrap', async () => {
    const wrap = await incoming((seal) => {
      seal.sig = '00'.repeat(64)
    })
    expect(await unwrapGiftWrap(wrap, receiverHex)).toBeNull()
  })

  it('rejects a rumor addressed to another recipient', async () => {
    const wrap = await incoming((_seal, rumor) => {
      rumor.tags = [['p', getPublicKey(generateSecretKey())]]
    })
    expect(await unwrapGiftWrap(wrap, receiverHex)).toBeNull()
  })

  it('rejects unsupported rumor kinds', async () => {
    const wrap = await incoming((_seal, rumor) => {
      rumor.kind = 1
    })
    expect(await unwrapGiftWrap(wrap, receiverHex)).toBeNull()
  })

  it('rejects malformed rumor tags', async () => {
    const wrap = await incoming((_seal, rumor) => {
      rumor.tags = 'invalid'
    })
    expect(await unwrapGiftWrap(wrap, receiverHex)).toBeNull()
  })

  it('rejects sender substitution', async () => {
    const wrap = await incoming((_seal, rumor) => {
      rumor.pubkey = getPublicKey(generateSecretKey())
    })
    expect(await unwrapGiftWrap(wrap, receiverHex)).toBeNull()
  })
})
