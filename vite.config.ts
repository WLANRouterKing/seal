import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

// Get version from git tag or fallback
function getVersion(): string {
  try {
    // Try to get the current tag
    const tag = execSync('git describe --tags --abbrev=0 2>/dev/null', { encoding: 'utf-8' }).trim()
    // Check if we're exactly on a tag or have commits after
    const describe = execSync('git describe --tags 2>/dev/null', { encoding: 'utf-8' }).trim()
    if (describe === tag) {
      return tag
    }
    // We have commits after the tag
    return `${tag}+`
  } catch {
    // No tags, use commit hash
    try {
      const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
      return `dev-${hash}`
    } catch {
      return 'dev'
    }
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(getVersion())
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Seal',
        short_name: 'Seal',
        description: 'Private messaging sealed with Nostr',
        theme_color: '#0ea5e9',
        background_color: '#0f0f0f',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
