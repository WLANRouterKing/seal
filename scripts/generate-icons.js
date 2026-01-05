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
const TAURI_ICONS = join(root, 'src-tauri/icons')

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

async function generateTauriIcons() {
  console.log('Generating Tauri icons...')

  // Tauri PNG icons
  const sizes = [
    { name: '32x32.png', size: 32 },
    { name: '128x128.png', size: 128 },
    { name: '128x128@2x.png', size: 256 },
    { name: 'icon.png', size: 512 }
  ]

  for (const { name, size } of sizes) {
    const icon = await createBaseIcon(size)
    writeFileSync(join(TAURI_ICONS, name), icon)
    console.log(`  ${name}`)
  }

  // Windows ICO (multi-size)
  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const icoBuffers = await Promise.all(
    icoSizes.map(size => createBaseIcon(size))
  )

  // Create ICO file manually (simple format)
  const icoBuffer = createIcoFile(icoBuffers, icoSizes)
  writeFileSync(join(TAURI_ICONS, 'icon.ico'), icoBuffer)
  console.log('  icon.ico')

  // macOS ICNS - use PNG as fallback (Tauri accepts PNG for icon.icns path)
  const icnsIcon = await createBaseIcon(512)
  writeFileSync(join(TAURI_ICONS, 'icon.icns'), icnsIcon)
  console.log('  icon.icns (PNG fallback)')
}

function createIcoFile(pngBuffers, sizes) {
  // ICO header: 6 bytes
  // ICO entry: 16 bytes each
  // Then PNG data

  const numImages = pngBuffers.length
  const headerSize = 6 + (16 * numImages)

  // Calculate total size
  let totalSize = headerSize
  for (const buf of pngBuffers) {
    totalSize += buf.length
  }

  const ico = Buffer.alloc(totalSize)
  let offset = 0

  // ICO header
  ico.writeUInt16LE(0, offset); offset += 2 // Reserved
  ico.writeUInt16LE(1, offset); offset += 2 // Type: 1 = ICO
  ico.writeUInt16LE(numImages, offset); offset += 2 // Number of images

  // ICO entries
  let dataOffset = headerSize
  for (let i = 0; i < numImages; i++) {
    const size = sizes[i]
    const pngBuf = pngBuffers[i]

    ico.writeUInt8(size < 256 ? size : 0, offset); offset += 1 // Width
    ico.writeUInt8(size < 256 ? size : 0, offset); offset += 1 // Height
    ico.writeUInt8(0, offset); offset += 1 // Color palette
    ico.writeUInt8(0, offset); offset += 1 // Reserved
    ico.writeUInt16LE(1, offset); offset += 2 // Color planes
    ico.writeUInt16LE(32, offset); offset += 2 // Bits per pixel
    ico.writeUInt32LE(pngBuf.length, offset); offset += 4 // Size of image data
    ico.writeUInt32LE(dataOffset, offset); offset += 4 // Offset to image data

    dataOffset += pngBuf.length
  }

  // PNG data
  for (const pngBuf of pngBuffers) {
    pngBuf.copy(ico, offset)
    offset += pngBuf.length
  }

  return ico
}

async function main() {
  console.log('\n🎨 Generating Seal icons...\n')

  await generateAndroidIcons()
  await generatePwaIcons()
  await generateFavicon()
  await updateAndroidBackgroundColor()
  await generateTauriIcons()

  console.log('\n✅ All icons generated!\n')
}

main().catch(console.error)