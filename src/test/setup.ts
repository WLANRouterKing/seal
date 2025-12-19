import '@testing-library/jest-dom'

// Mock IndexedDB
const indexedDB = {
  open: () => ({
    result: {
      createObjectStore: () => ({}),
      transaction: () => ({
        objectStore: () => ({
          get: () => ({ result: null }),
          put: () => ({}),
          delete: () => ({})
        })
      })
    },
    onsuccess: null,
    onerror: null
  })
}

Object.defineProperty(window, 'indexedDB', {
  value: indexedDB,
  writable: true
})

// Extend File prototype with arrayBuffer if not present
if (!File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = function(): Promise<ArrayBuffer> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.readAsArrayBuffer(this)
    })
  }
}

// Mock crypto.subtle for tests
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...globalThis.crypto,
      subtle: {
        digest: async (_algorithm: string, data: ArrayBuffer) => {
          // Simple mock hash
          const arr = new Uint8Array(32)
          const view = new Uint8Array(data)
          for (let i = 0; i < view.length; i++) {
            arr[i % 32] ^= view[i]
          }
          return arr.buffer
        }
      },
      randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9),
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256)
        }
        return arr
      }
    }
  })
}

// Mock URL.createObjectURL
URL.createObjectURL = () => 'blob:test'
URL.revokeObjectURL = () => {}

// Mock Image for getImageDimensions
class MockImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  src = ''
  naturalWidth = 100
  naturalHeight = 100

  constructor() {
    setTimeout(() => {
      if (this.onload) this.onload()
    }, 0)
  }
}

Object.defineProperty(globalThis, 'Image', {
  value: MockImage,
  writable: true
})
