// Run against `npm run dev` in another terminal. Requires Playwright + Chromium.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await fetch('http://127.0.0.1:5174/')
        break
      } catch (error) {
        if (attempt === 29) throw error
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }
    await page.goto('http://127.0.0.1:5174/')
    await page.getByLabel('Passwort für den verschlüsselten Browser-Speicher').fill('test password long enough')
    await page.getByRole('button', { name: 'Testgeräte anlegen' }).click()
    await page.getByLabel('Code am Hauptgerät geprüft').check()
    await page.getByLabel('Gleichen Code im Browser geprüft').check()
    await page.getByRole('button', { name: 'Kopplung im Labor bestätigen' }).click()
    await page.getByRole('button', { name: 'Hauptgerät ausschalten' }).click({ timeout: 30000 })
    await page.getByRole('button', { name: 'Senden und Antwort empfangen' }).click()
    await page.getByText('Kontakt → Browser: Antwort: Hallo vom Browser').waitFor()
    if (process.env.SEAL_LAB_SCREENSHOT_DIR)
      await page.screenshot({ path: process.env.SEAL_LAB_SCREENSHOT_DIR + '/seal-lab-desktop.png', fullPage: true })
    await page.getByRole('button', { name: 'Browser sperren', exact: true }).click()
    await page.getByLabel('Browser-Passwort').fill('test password long enough')
    await page.getByRole('button', { name: 'Entsperren und Zustand laden' }).click()
    await page.getByRole('button', { name: 'Senden und Antwort empfangen' }).click()
    await page.getByText('Kontakt → Browser: Antwort: Hallo vom Browser').waitFor()
    await page.getByRole('button', { name: 'Hauptgerät einschalten' }).click()
    await page.getByRole('button', { name: 'Browser entfernen', exact: true }).click()
    await page.getByRole('cell', { name: 'removed', exact: true }).waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile overflow')
    if (process.env.SEAL_LAB_SCREENSHOT_DIR)
      await page.screenshot({ path: process.env.SEAL_LAB_SCREENSHOT_DIR + '/seal-lab-mobile.png', fullPage: true })
    assert.equal(await page.locator('[role="alert"]').count(), 0)
    await page.getByRole('button', { name: 'Testdaten dieses Durchlaufs löschen' }).click()
    await page.getByRole('button', { name: 'Testgeräte anlegen' }).waitFor()
    assert.deepEqual(errors, [])
    console.log('PASS: browser pairing, offline messaging, lock, restore, removal, cleanup')
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
