// Real Seal UI + real relay: fresh synthetic accounts only, no fixtures in app state.
const { chromium } = require('playwright')
const { generateSecretKey, getPublicKey, nip19 } = require('../../node_modules/nostr-tools')
const assert = require('node:assert/strict')
const base = process.env.SEAL_APP_URL || 'http://127.0.0.1:5173'
const password = 'synthetic device test password'
;(async () => {
  const browsers = [],
    errors = [],
    deliveries = []
  const mainSecret = generateSecretKey(),
    peerSecret = generateSecretKey()
  const mainPublic = getPublicKey(mainSecret),
    peerPublic = getPublicKey(peerSecret)
  const text = 'Independent device message ' + Date.now()
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
      page.on('websocket', (socket) =>
        socket.on('framesent', (frame) => {
          try {
            const data = JSON.parse(String(frame.payload))
            if (data[0] === 'EVENT' && data[1]?.kind === 1059)
              deliveries.push({ page, recipient: data[1].tags.find((tag) => tag[0] === 'p')?.[1] })
          } catch {
            /* Ignore non-event frames. */
          }
        })
      )
      return page
    }
    let main = await page()
    const mainContext = main.context()
    const linked = await page(),
      peer = await page()
    async function importAccount(target, secret) {
      await target.goto(base)
      await target.getByRole('button', { name: 'Restore an existing account' }).click()
      await target.getByLabel('Private Key (nsec)').fill(nip19.nsecEncode(secret))
      await target.getByRole('button', { name: 'Import Key', exact: true }).click()
      await target.getByLabel('Password', { exact: true }).fill(password)
      await target.getByLabel('Confirm Password', { exact: true }).fill(password)
      await target.getByRole('button', { name: 'Set Password', exact: true }).click()
    }
    async function openContact(target, pubkey, name) {
      await target.getByRole('link', { name: 'Contacts', exact: true }).click()
      await target.getByRole('button', { name: 'Add Contact', exact: true }).click()
      await target.getByLabel('Contact address or invitation link').fill(nip19.npubEncode(pubkey))
      await target.getByLabel('Name (optional)').fill(name)
      await target.getByRole('button', { name: 'Add Contact', exact: true }).click()
      await target.getByText(name, { exact: true }).click()
      await target.getByRole('dialog').getByRole('button', { name: 'Start Chat', exact: true }).click()
    }
    async function send(target, text) {
      await target.getByLabel('Type a message...', { exact: true }).fill(text)
      await target.getByRole('button', { name: 'Send', exact: true }).click()
      await target.waitForFunction(
        () => document.querySelector('textarea[aria-label="Type a message..."]')?.value === ''
      )
    }
    await importAccount(main, mainSecret)
    await importAccount(peer, peerSecret)
    await openContact(peer, mainPublic, 'Main account')
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
    await linked.locator('.chat-workspace').waitFor()
    // Close the primary page entirely: no signer, bridge or UI remains running there.
    await main.close()
    assert(main.isClosed())
    await openContact(linked, peerPublic, 'Relay test peer')
    await send(linked, text)
    await peer.getByText(text, { exact: true }).last().waitFor({ timeout: 60000 })
    const replyText = 'reply while primary is closed ' + Date.now()
    await send(peer, replyText)
    await linked.getByText(replyText, { exact: true }).last().waitFor({ timeout: 60000 })
    await linked.getByRole('button', { name: 'Lock Now', exact: true }).click()
    assert.equal(await linked.getByText(replyText, { exact: true }).count(), 0)
    const missedText = 'backlog while both receiving devices are locked ' + Date.now()
    await send(peer, missedText)
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
    await linked.locator('.chat-workspace').waitFor()
    await linked.getByText('Relay test peer', { exact: true }).click()
    await linked.getByText(replyText, { exact: true }).last().waitFor()
    await linked.getByText(missedText, { exact: true }).last().waitFor({ timeout: 60000 })
    const afterRestart = 'send after independent restart ' + Date.now()
    await send(linked, afterRestart)
    await peer.getByText(afterRestart, { exact: true }).last().waitFor({ timeout: 60000 })
    assert(main.isClosed())
    await linked.getByRole('link', { name: 'Settings', exact: true }).click()
    await linked.getByText('Open saved device link', { exact: true }).waitFor({ state: 'detached' })
    await linked.getByRole('link', { name: 'Chats', exact: true }).click()
    await linked.setViewportSize({ width: 390, height: 844 })
    assert(
      await linked.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Chat UI has no mobile horizontal overflow'
    )
    main = await mainContext.newPage()
    main.setDefaultTimeout(45000)
    main.on('pageerror', (error) => errors.push(error.message))
    await main.goto(base)
    await main.getByPlaceholder('Enter your password').fill(password)
    await main.getByRole('button', { name: 'Unlock', exact: true }).click()
    await main.getByText(afterRestart, { exact: true }).last().waitFor({ timeout: 60000 })
    await main.getByRole('link', { name: 'Settings', exact: true }).click()
    await main.getByRole('button', { name: /Linked devices Add devices/ }).click()
    await main.getByRole('button', { name: 'Revoke access', exact: true }).click()
    await main.getByRole('dialog').getByRole('button', { name: 'Revoke access', exact: true }).click()
    await linked.getByText('The primary device revoked access. Delete the local link.', { exact: true }).waitFor()
    const beforeRemovalTest = deliveries.length
    const afterRemoval = 'only remaining authorized inboxes ' + Date.now()
    await send(peer, afterRemoval)
    const recipients = deliveries
      .slice(beforeRemovalTest)
      .filter((item) => item.page === peer)
      .map((item) => item.recipient)
    assert(recipients.includes(mainPublic), 'The account inbox still receives messages')
    assert(!recipients.includes(JSON.parse(request).pubkey), 'No new ciphertext is addressed to the revoked device')
    await linked.reload()
    await linked.getByLabel('Device password (at least 12 characters)').fill(password)
    await linked.getByRole('button', { name: 'Unlock', exact: true }).click()
    await linked.getByText('Device access revoked; delete this local link', { exact: true }).waitFor()
    assert.equal(await linked.locator('.chat-workspace').count(), 0)

    await linked.setViewportSize({ width: 390, height: 844 })
    assert(
      await linked.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'No mobile horizontal overflow'
    )
    assert.deepEqual(errors, [])
    console.log(
      'PASS: three real app browsers; QR enrollment; PRIMARY PAGE CLOSED during bidirectional relay chat, locked backlog and restart; account identity preserved; primary catches up; revoked inbox excluded from new fanout; revoked unlock refused'
    )
  } catch (error) {
    // No screenshots/traces: account import and QR screens contain sensitive test material.
    throw error
  } finally {
    mainSecret.fill(0)
    peerSecret.fill(0)
    await Promise.all(browsers.map((browser) => browser.close()))
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
