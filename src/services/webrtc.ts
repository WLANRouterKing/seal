// WebRTC P2P Connection Manager for Device Sync
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

interface SyncPacket {
  type: 'meta' | 'chunk' | 'done' | 'ack' | 'error'
  seq?: number
  total?: number
  data?: string
  error?: string
}

interface QRPayload {
  v: number           // Version
  o: string           // SDP Offer (base64)
  k: string           // AES key (base64)
  f: string           // Fingerprint
}

type ConnectionState = 'idle' | 'offering' | 'answering' | 'connecting' | 'connected' | 'closed' | 'error'

export class WebRTCSync {
  private peerConnection: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private encryptionKey: CryptoKey | null = null
  private keyBytes: Uint8Array | null = null
  private offer: string = ''
  private answer: string = ''
  private state: ConnectionState = 'idle'
  private onStateChange: ((state: ConnectionState) => void) | null = null
  private onDataReceived: ((data: string) => void) | null = null
  private pendingCandidates: RTCIceCandidate[] = []
  private expectedCode: string = ''

  private readonly rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }

  constructor() {}

  setOnStateChange(callback: (state: ConnectionState) => void): void {
    this.onStateChange = callback
  }

  setOnDataReceived(callback: (data: string) => void): void {
    this.onDataReceived = callback
  }

  getState(): ConnectionState {
    return this.state
  }

  private setState(newState: ConnectionState): void {
    this.state = newState
    this.onStateChange?.(newState)
  }

  // Generate a random AES-256 key
  private async generateEncryptionKey(): Promise<void> {
    this.keyBytes = crypto.getRandomValues(new Uint8Array(32))
    this.encryptionKey = await crypto.subtle.importKey(
      'raw',
      this.keyBytes.buffer as ArrayBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    )
  }

  // Import key from base64
  private async importEncryptionKey(keyBase64: string): Promise<void> {
    this.keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0))
    this.encryptionKey = await crypto.subtle.importKey(
      'raw',
      this.keyBytes.buffer as ArrayBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    )
  }

  // Compress SDP by removing unnecessary whitespace and comments
  private compressSDP(sdp: string): string {
    return btoa(sdp
      .split('\r\n')
      .filter(line => line.length > 0)
      .join('\n'))
  }

  // Decompress SDP
  private decompressSDP(compressed: string): string {
    return atob(compressed)
      .split('\n')
      .join('\r\n') + '\r\n'
  }

  // Generate fingerprint from key
  private generateFingerprint(): string {
    if (!this.keyBytes) return ''
    const hash = sha256(this.keyBytes)
    return bytesToHex(hash).slice(0, 8)
  }

  // Generate confirmation code from offer + answer + key
  generateConfirmationCode(): string {
    if (!this.keyBytes || !this.offer || !this.answer) return ''
    const combined = this.offer + this.answer + bytesToHex(this.keyBytes)
    const hash = sha256(new TextEncoder().encode(combined))
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Avoid confusing chars
    let code = ''
    for (let i = 0; i < 6; i++) {
      code += chars[hash[i] % chars.length]
    }
    return code.slice(0, 3) + '-' + code.slice(3)
  }

  // Create offer and return QR payload
  async createOffer(): Promise<string> {
    this.setState('offering')
    await this.generateEncryptionKey()

    this.peerConnection = new RTCPeerConnection(this.rtcConfig)
    this.setupPeerConnectionHandlers()

    // Create data channel (offerer creates it)
    this.dataChannel = this.peerConnection.createDataChannel('sync', {
      ordered: true
    })
    this.setupDataChannelHandlers()

    // Create and set local description
    const offer = await this.peerConnection.createOffer()
    await this.peerConnection.setLocalDescription(offer)

    // Wait for ICE gathering to complete
    await this.waitForICEGathering()

    this.offer = this.peerConnection.localDescription?.sdp || ''

    const payload: QRPayload = {
      v: 1,
      o: this.compressSDP(this.offer),
      k: btoa(String.fromCharCode(...this.keyBytes!)),
      f: this.generateFingerprint()
    }

    return JSON.stringify(payload)
  }

  // Parse QR code and create answer, returns confirmation code
  async processOffer(qrData: string): Promise<{ code: string; answerData: string }> {
    this.setState('answering')

    const payload: QRPayload = JSON.parse(qrData)

    if (payload.v !== 1) {
      throw new Error('Unsupported sync version')
    }

    await this.importEncryptionKey(payload.k)
    this.offer = this.decompressSDP(payload.o)

    this.peerConnection = new RTCPeerConnection(this.rtcConfig)
    this.setupPeerConnectionHandlers()

    // Answerer receives data channel
    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel
      this.setupDataChannelHandlers()
    }

    // Set remote description (the offer)
    await this.peerConnection.setRemoteDescription({
      type: 'offer',
      sdp: this.offer
    })

    // Create and set answer
    const answer = await this.peerConnection.createAnswer()
    await this.peerConnection.setLocalDescription(answer)

    // Wait for ICE gathering
    await this.waitForICEGathering()

    this.answer = this.peerConnection.localDescription?.sdp || ''
    this.expectedCode = this.generateConfirmationCode()

    return {
      code: this.expectedCode,
      answerData: this.compressSDP(this.answer)
    }
  }

  // Complete connection by verifying code (called by offerer)
  async completeConnection(answerData: string, enteredCode: string): Promise<boolean> {
    if (!this.peerConnection) {
      throw new Error('No peer connection')
    }

    this.answer = this.decompressSDP(answerData)
    this.expectedCode = this.generateConfirmationCode()

    // Verify confirmation code
    const normalizedEntered = enteredCode.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const normalizedExpected = this.expectedCode.replace('-', '')

    if (normalizedEntered !== normalizedExpected) {
      this.setState('error')
      return false
    }

    this.setState('connecting')

    // Set remote description (the answer)
    await this.peerConnection.setRemoteDescription({
      type: 'answer',
      sdp: this.answer
    })

    // Wait for connection
    return new Promise((resolve) => {
      const checkConnection = () => {
        if (this.dataChannel?.readyState === 'open') {
          this.setState('connected')
          resolve(true)
        } else if (this.state === 'error' || this.state === 'closed') {
          resolve(false)
        } else {
          setTimeout(checkConnection, 100)
        }
      }
      checkConnection()
    })
  }

  // Wait for connection to be established (called by answerer after showing code)
  async waitForConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.setState('error')
        resolve(false)
      }, 60000) // 60 second timeout

      const checkConnection = () => {
        if (this.dataChannel?.readyState === 'open') {
          clearTimeout(timeout)
          this.setState('connected')
          resolve(true)
        } else if (this.state === 'error' || this.state === 'closed') {
          clearTimeout(timeout)
          resolve(false)
        } else {
          setTimeout(checkConnection, 100)
        }
      }
      checkConnection()
    })
  }

  private waitForICEGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (this.peerConnection?.iceGatheringState === 'complete') {
        resolve()
        return
      }

      const timeout = setTimeout(() => resolve(), 5000) // 5 second max wait

      this.peerConnection?.addEventListener('icegatheringstatechange', () => {
        if (this.peerConnection?.iceGatheringState === 'complete') {
          clearTimeout(timeout)
          resolve()
        }
      })
    })
  }

  private setupPeerConnectionHandlers(): void {
    if (!this.peerConnection) return

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState
      if (state === 'connected') {
        this.setState('connected')
      } else if (state === 'failed' || state === 'disconnected') {
        this.setState('error')
      } else if (state === 'closed') {
        this.setState('closed')
      }
    }

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.pendingCandidates.push(event.candidate)
      }
    }
  }

  private setupDataChannelHandlers(): void {
    if (!this.dataChannel) return

    this.dataChannel.onopen = () => {
      this.setState('connected')
    }

    this.dataChannel.onclose = () => {
      this.setState('closed')
    }

    this.dataChannel.onerror = () => {
      this.setState('error')
    }

    this.dataChannel.onmessage = async (event) => {
      try {
        const decrypted = await this.decryptData(event.data)
        this.onDataReceived?.(decrypted)
      } catch (error) {
        console.error('Failed to decrypt received data:', error)
      }
    }
  }

  // Encrypt data with AES-GCM
  private async encryptData(data: string): Promise<string> {
    if (!this.encryptionKey) throw new Error('No encryption key')

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(data)

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      encoded
    )

    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encrypted), iv.length)

    return btoa(String.fromCharCode(...combined))
  }

  // Decrypt data
  private async decryptData(encryptedBase64: string): Promise<string> {
    if (!this.encryptionKey) throw new Error('No encryption key')

    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const encrypted = combined.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      encrypted
    )

    return new TextDecoder().decode(decrypted)
  }

  // Send data over the data channel
  async sendData(data: string): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel not open')
    }

    const encrypted = await this.encryptData(data)
    this.dataChannel.send(encrypted)
  }

  // Send sync data in chunks
  async sendSyncData(
    jsonData: string,
    onProgress?: (sent: number, total: number) => void
  ): Promise<void> {
    const CHUNK_SIZE = 16000 // 16KB chunks (WebRTC limit is ~16KB)
    const chunks: string[] = []

    // Split data into chunks
    for (let i = 0; i < jsonData.length; i += CHUNK_SIZE) {
      chunks.push(jsonData.slice(i, i + CHUNK_SIZE))
    }

    // Send metadata
    const metaPacket: SyncPacket = {
      type: 'meta',
      total: chunks.length
    }
    await this.sendData(JSON.stringify(metaPacket))

    // Send chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunkPacket: SyncPacket = {
        type: 'chunk',
        seq: i,
        data: chunks[i]
      }
      await this.sendData(JSON.stringify(chunkPacket))
      onProgress?.(i + 1, chunks.length)

      // Small delay to prevent overwhelming the channel
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    // Send done
    const donePacket: SyncPacket = { type: 'done' }
    await this.sendData(JSON.stringify(donePacket))
  }

  // Receive sync data and reassemble
  receiveSyncData(
    onProgress?: (received: number, total: number) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Map<number, string> = new Map()
      let totalChunks = 0

      const originalHandler = this.onDataReceived

      this.onDataReceived = (data: string) => {
        try {
          const packet: SyncPacket = JSON.parse(data)

          switch (packet.type) {
            case 'meta':
              totalChunks = packet.total || 0
              break

            case 'chunk':
              if (packet.seq !== undefined && packet.data) {
                chunks.set(packet.seq, packet.data)
                onProgress?.(chunks.size, totalChunks)
              }
              break

            case 'done': {
              // Reassemble data
              let result = ''
              for (let i = 0; i < totalChunks; i++) {
                const chunk = chunks.get(i)
                if (chunk === undefined) {
                  reject(new Error(`Missing chunk ${i}`))
                  return
                }
                result += chunk
              }
              this.onDataReceived = originalHandler
              resolve(result)
              break
            }

            case 'error':
              this.onDataReceived = originalHandler
              reject(new Error(packet.error || 'Unknown error'))
              break
          }
        } catch (error) {
          console.error('Failed to parse sync packet:', error)
        }
      }
    })
  }

  // Close the connection
  close(): void {
    this.dataChannel?.close()
    this.peerConnection?.close()
    this.dataChannel = null
    this.peerConnection = null
    this.encryptionKey = null
    this.keyBytes = null
    this.offer = ''
    this.answer = ''
    this.expectedCode = ''
    this.pendingCandidates = []
    this.setState('closed')
  }
}

// Singleton instance
export const webrtcSync = new WebRTCSync()
