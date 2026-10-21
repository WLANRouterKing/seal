import { getCredentialPubkey } from '@internet-privacy/marmot-ts/core'
import { getOwnLeafNode } from '@internet-privacy/marmot-ts/mls'
const toHex = (bytes) => Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('')

export function membershipOf(group) {
  return {
    groupId: toHex(group.id),
    signatureKey: toHex(getOwnLeafNode(group.state).signaturePublicKey),
    status: 'linked',
  }
}

// Local encrypted registry. It does not claim to be a synchronized roster.
export class DeviceRegistry {
  #queue = Promise.resolve()
  constructor(store, account, client) {
    this.store = store
    this.account = account
    this.client = client
  }
  async list() {
    return Promise.all((await this.store.keys()).map((id) => this.store.getItem(id)))
  }
  async register(id, label, group) {
    if (getCredentialPubkey(getOwnLeafNode(group.state).credential) !== this.account)
      throw new Error('Device belongs to another account')
    if (await this.store.getItem(id)) throw new Error('Device already registered')
    await this.store.setItem(id, { id, label: label.slice(0, 80), account: this.account, chats: [membershipOf(group)] })
  }
  remove(id) {
    const operation = this.#queue.then(() => this.#remove(id))
    this.#queue = operation.catch(() => {})
    return operation
  }
  async #remove(id) {
    const device = await this.store.getItem(id)
    if (!device || device.account !== this.account) throw new Error('Unknown device')
    for (const chat of device.chats) {
      if (chat.status === 'removed') continue
      chat.status = 'removing'
      delete chat.error
      await this.store.setItem(id, device)
      try {
        const group = await this.client.groups.get(chat.groupId)
        // Build against the actual commit context, not an earlier leaf index.
        await this.client.groups.commit(group.id, {
          extraProposals: [
            async ({ state }) => {
              const nodeIndex = state.ratchetTree.findIndex(
                (node) =>
                  node?.leaf &&
                  toHex(node.leaf.signaturePublicKey) === chat.signatureKey &&
                  getCredentialPubkey(node.leaf.credential) === this.account
              )
              if (nodeIndex < 0) throw new Error('Device leaf missing; membership must be reconciled')
              const leafIndex = nodeIndex / 2
              if (leafIndex === state.privatePath.leafIndex)
                throw new Error('Cannot remove this device through remote removal')
              return { proposalType: 3, remove: { removed: leafIndex } }
            },
          ],
        })
        // Local selected MLS state after acknowledged publication only.
        const remains = group.state.ratchetTree.some(
          (node) => node?.leaf && toHex(node.leaf.signaturePublicKey) === chat.signatureKey
        )
        if (remains) throw new Error('Removal is not committed')
        chat.status = 'removed'
      } catch (error) {
        chat.status = 'failed'
        chat.error = String(error.message || error)
      }
      await this.store.setItem(id, device)
    }
    return device
  }
}
