// @vitest-environment node
import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { openDB } from 'idb'
import { LinkedVault, deleteLinkedVault, primaryStore } from './storage'
import { clearEncryptionKey, setEncryptionKey } from '../encryptionKeyManager'

it('requires a password and encrypts independent device state; lock and wrong passwords fail closed', async () => {
  await deleteLinkedVault()
  const vault = new LinkedVault<{ secret: string }>()
  await expect(vault.create('short', { secret: 'private-device-material' })).rejects.toThrow()
  await vault.create('a long device password', { secret: 'private-device-material' })
  const db = await openDB('seal-linked-devices-v1', 1)
  const record = await db.get('records', 'linked')
  expect(JSON.stringify(record)).not.toContain('private-device-material')
  expect(new TextDecoder().decode(record.data.ciphertext)).not.toContain('private-device-material')
  vault.lock()
  await expect(vault.load()).rejects.toThrow('locked')
  await expect(vault.unlock('wrong password')).rejects.toThrow()
  expect(await vault.unlock('a long device password')).toEqual({ secret: 'private-device-material' })
  await vault.save({ secret: 'updated' })
  vault.lock()
  expect(await vault.unlock('a long device password')).toEqual({ secret: 'updated' })
  vault.lock()
  db.close()
  await deleteLinkedVault()
})
it('binds primary records to account and revokes store capabilities on vault lock', async () => {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  setEncryptionKey(key, new Uint8Array(16))
  const first = primaryStore<{ secret: string }>('a')
  await first.save({ secret: 'primary-device-key' })
  const db = await openDB('seal-linked-devices-v1', 1)
  await db.put('records', await db.get('records', 'primary:a'), 'primary:b')
  await expect(primaryStore('b').load()).rejects.toThrow()
  clearEncryptionKey()
  await expect(first.load()).rejects.toThrow('locked')
  await expect(first.save({ secret: 'bad' })).rejects.toThrow('locked')
  db.close()
})
