// Real Seal UI + real relay: fresh synthetic accounts only, no fixtures in app state.
const { chromium } = require('playwright')
const { generateSecretKey, getPublicKey, nip19, SimplePool, nip59 } = require('../../node_modules/nostr-tools')
const assert = require('node:assert/strict')
const base = process.env.SEAL_APP_URL || 'http://127.0.0.1:5173'
const relay = 'wss://nos.lol'
const password = 'synthetic device test password'
;(async () => {
  const browsers = [],
    errors = []
  const pool = new SimplePool()
  const mainSecret = generateSecretKey(),
    peerSecret = generateSecretKey()
  const mainPublic = getPublicKey(mainSecret),
    peerPublic = getPublicKey(peerSecret)
  const text = 'Seal linked-device UI test ' + Date.now()
  let received = false
  const sub = pool.subscribeMany(
    [relay],
    { kinds: [1059], '#p': [peerPublic] },
    {
      onevent(event) {
        try {
          const rumor = nip59.unwrapEvent(event, peerSecret)
          if (rumor.pubkey === mainPublic && rumor.content === text) received = true
        } catch {}
      },
    }
  )
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await fetch(base)
        break
      } catch (error) {
        if (attempt === 59) throw error
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
    async function page() {
      const browser = await chromium.launch({ headless: true })
      browsers.push(browser)
      const context = await browser.newContext({ locale: 'en-US' })
      const page = await context.newPage()
      page.setDefaultTimeout(45000)
      page.on('pageerror', (error) => errors.push(error.message))
      return page
    }
    const main = await page(),
      linked = await page()
    await main.goto(base)
    await main.getByRole('button', { name: 'Restore an existing account' }).click()
    await main.getByLabel('Private Key (nsec)').fill(nip19.nsecEncode(mainSecret))
    await main.getByRole('button', { name: 'Import Key', exact: true }).click()
    await main.getByLabel('Password', { exact: true }).fill(password)
    await main.getByLabel('Confirm Password', { exact: true }).fill(password)
    await main.getByRole('button', { name: 'Set Password', exact: true }).click()
    await main.getByRole('link', { name: 'Settings', exact: true }).click()
    await main.getByRole('button', { name: /Linked devices Add devices/ }).click()
    await main.getByRole('button', { name: 'Add device', exact: true }).waitFor()

    await linked.goto(base)
    await linked.getByRole('link', { name: 'Link to an existing account' }).click()
    await linked.getByLabel('Device name', { exact: true }).fill('Browser integration test')
    await linked.getByLabel('Public npub of your primary device').fill(nip19.npubEncode(mainPublic))
    await linked.getByLabel('Device password (at least 12 characters)').fill(password)
    await linked.getByLabel('Repeat password', { exact: true }).fill(password)
    await linked.getByRole('button', { name: 'Set device password and create QR code' }).click()
    const request = await linked.getByLabel('Pairing text to copy').inputValue()
    assert.equal(JSON.parse(request).content.includes(nip19.nsecEncode(mainSecret)), false)
    await main.getByRole('button', { name: 'Add device', exact: true }).click()
    await main.getByLabel('Alternatively: paste pairing text').fill(request)
    await main.getByRole('button', { name: 'Inspect request' }).click()
    await main.getByLabel('The codes match on both devices.').check()
    await main.getByRole('button', { name: 'Approve this device' }).click()
    await linked.getByLabel('The codes match on both devices.').check()
    await linked.getByRole('button', { name: 'Confirm link', exact: true }).click()
    await linked.getByLabel('Open chat with public npub').fill(nip19.npubEncode(peerPublic))
    await linked.getByRole('button', { name: 'Open chat', exact: true }).click()
    await linked.getByLabel('Message', { exact: true }).fill(text)
    await linked.getByRole('button', { name: 'Send', exact: true }).click()
    for (let i = 0; i < 150 && !received; i++) await new Promise((resolve) => setTimeout(resolve, 200))
    assert(received, 'Peer actually decrypted the NIP-17 message from the account through nos.lol')
    const replyText = 'real peer reply ' + Date.now()
    const reply = nip59.wrapEvent(
      {
        kind: 14,
        pubkey: peerPublic,
        content: replyText,
        tags: [['p', mainPublic]],
        created_at: Math.floor(Date.now() / 1000),
      },
      peerSecret,
      mainPublic
    )
    await Promise.any(pool.publish([relay], reply))
    await linked.getByText(replyText, { exact: true }).waitFor({ timeout: 60000 })
    await linked.getByRole('button', { name: 'Lock', exact: true }).click()
    assert.equal(await linked.getByText(replyText, { exact: true }).count(), 0)
    // A saved device link offers a choice; only an explicit click enters its unlock flow.
    await linked.goto(base)
    await linked.getByRole('button', { name: 'Open saved device link', exact: true }).click()
    await linked.getByRole('button', { name: 'Unlock', exact: true }).waitFor()
    assert.equal(await linked.getByRole('button', { name: 'Create New Account' }).count(), 0)
    await linked.goto(base + '/onboarding')
    await linked.getByRole('button', { name: 'Use a standalone account', exact: true }).click()
    await linked.getByRole('button', { name: 'Create New Account', exact: true }).waitFor()
    await linked.goto(base)
    await linked.getByRole('button', { name: 'Open saved device link', exact: true }).click()
    await linked.getByRole('button', { name: 'Unlock', exact: true }).waitFor()
    assert.equal(await linked.getByRole('button', { name: 'Create New Account' }).count(), 0)
    await linked.reload()
    await linked.getByLabel('Device password (at least 12 characters)').fill(password)
    await linked.getByRole('button', { name: 'Unlock', exact: true }).click()
    await linked.getByLabel('Open chat with public npub').waitFor()
    await main.getByRole('button', { name: 'Revoke access', exact: true }).click()
    await main.getByRole('dialog').getByRole('button', { name: 'Revoke access', exact: true }).click()
    await linked.getByText('The primary device revoked access. Delete the local link.', { exact: true }).waitFor()
    await linked.setViewportSize({ width: 390, height: 844 })
    assert(
      await linked.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'No mobile horizontal overflow'
    )
    assert.deepEqual(errors, [])
    console.log(
      'PASS: real app menu, two separate browsers, QR-text enrollment, NIP-17 send/decrypt/reply over nos.lol, password lock/reload and revocation'
    )
  } catch (error) {
    // No screenshots/traces: account import and QR screens contain sensitive test material.
    throw error
  } finally {
    sub.close()
    pool.destroy()
    mainSecret.fill(0)
    peerSecret.fill(0)
    await Promise.all(browsers.map((browser) => browser.close()))
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
