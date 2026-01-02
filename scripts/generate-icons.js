#!/usr/bin/env node

import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const ICON_COLOR = '#22d3ee' // Cyan-400
const ANDROID_RES = join(root, 'android/app/src/main/res')
const PUBLIC_DIR = join(root, 'public')

// Lock icon SVG with white stroke
const lockSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z"></path>
  <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"></path>
  <path d="M8 11v-4a4 4 0 1 1 8 0v4"></path>
</svg>
`

// Android icon sizes (dp to px multipliers)
const ANDROID_SIZES = {
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4
}

async function createBaseIcon(size) {
  // Create the lock icon
  const lockBuffer = await sharp(Buffer.from(lockSvg))
    .resize(Math.round(size * 0.6), Math.round(size * 0.6))
    .toBuffer()

  // Create cyan background with lock
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: ICON_COLOR
    }
  })
    .composite([{
      input: lockBuffer,
      gravity: 'center'
    }])
    .png()
    .toBuffer()
}

async function createRoundIcon(size) {
  const baseIcon = await createBaseIcon(size)

  // Create circular mask
  const circle = Buffer.from(`
    <svg width="${size}" height="${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/>
    </svg>
  `)

  return sharp(baseIcon)
    .composite([{
      input: circle,
      blend: 'dest-in'
    }])
    .png()
    .toBuffer()
}

async function createAdaptiveForeground(size) {
  // Adaptive icons need the content to be ~66% of the canvas (safe zone)
  const iconSize = Math.round(size * 0.5)

  const lockBuffer = await sharp(Buffer.from(lockSvg))
    .resize(iconSize, iconSize)
    .toBuffer()

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{
      input: lockBuffer,
      gravity: 'center'
    }])
    .png()
    .toBuffer()
}

async function generateAndroidIcons() {
  console.log('Generating Android icons...')

  for (const [density, multiplier] of Object.entries(ANDROID_SIZES)) {
    const baseSize = Math.round(48 * multiplier)
    const foregroundSize = Math.round(108 * multiplier)
    const dir = join(ANDROID_RES, `mipmap-${density}`)

    // Square icon
    const squareIcon = await createBaseIcon(baseSize)
    writeFileSync(join(dir, 'ic_launcher.png'), squareIcon)

    // Round icon
    const roundIcon = await createRoundIcon(baseSize)
    writeFileSync(join(dir, 'ic_launcher_round.png'), roundIcon)

    // Adaptive foreground (white lock on transparent)
    const foreground = await createAdaptiveForeground(foregroundSize)
    writeFileSync(join(dir, 'ic_launcher_foreground.png'), foreground)

    console.log(`  ${density}: ${baseSize}x${baseSize}px`)
  }
}

async function generatePwaIcons() {
  console.log('Generating PWA icons...')

  // PWA icons
  const pwa192 = await createBaseIcon(192)
  writeFileSync(join(PUBLIC_DIR, 'pwa-192x192.png'), pwa192)
  console.log('  pwa-192x192.png')

  const pwa512 = await createBaseIcon(512)
  writeFileSync(join(PUBLIC_DIR, 'pwa-512x512.png'), pwa512)
  console.log('  pwa-512x512.png')

  // Apple touch icon (180x180)
  const apple = await createBaseIcon(180)
  writeFileSync(join(PUBLIC_DIR, 'apple-touch-icon.png'), apple)
  console.log('  apple-touch-icon.png')
}

async function generateFavicon() {
  console.log('Generating favicon...')

  // Update favicon.svg to match the icon style
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect width="24" height="24" fill="${ICON_COLOR}" rx="4"/>
  <g transform="translate(0, 0)">
    <path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z"></path>
    <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"></path>
    <path d="M8 11v-4a4 4 0 1 1 8 0v4"></path>
  </g>
</svg>`

  writeFileSync(join(PUBLIC_DIR, 'favicon.svg'), faviconSvg)
  console.log('  favicon.svg')
}

async function updateAndroidBackgroundColor() {
  const colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${ICON_COLOR}</color>
</resources>`

  writeFileSync(join(ANDROID_RES, 'values/ic_launcher_background.xml'), colorsXml)
  console.log('Updated ic_launcher_background.xml')
}

async function main() {
  console.log('\n🎨 Generating Seal icons...\n')

  await generateAndroidIcons()
  await generatePwaIcons()
  await generateFavicon()
  await updateAndroidBackgroundColor()

  console.log('\n✅ All icons generated!\n')
}

main().catch(console.error)