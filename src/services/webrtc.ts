// WebRTC P2P Connection Manager for Device Sync
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import pako from 'pako'

interface SyncPacket {
  type: 'meta' | 'chunk' | 'done' | 'ack' | 'error'
  seq?: number
  total?: number
  data?: string
  error?: string
}

// Minimal QR payload - using short keys to save bytes
interface QRPayload {
  v: number           // Version
  o: string           // SDP Offer (compressed)
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

  // Filter SDP to keep only essential lines for data channel connection
  private filterSDP(sdp: string): string {
    const lines = sdp.split('\r\n')
    let iceCandidateCount = 0
    const maxCandidates = 3  // Keep only first 3 ICE candidates

    const essential = lines.filter(line => {
      // Always keep these essential lines
      if (line.startsWith('v=')) return true
      if (line.startsWith('o=')) return true
      if (line.startsWith('s=')) return true
      if (line.startsWith('t=')) return true
      if (line.startsWith('m=')) return true
      if (line.startsWith('c=')) return true
      if (line.startsWith('a=ice-ufrag:')) return true
      if (line.startsWith('a=ice-pwd:')) return true
      if (line.startsWith('a=fingerprint:')) return true
      if (line.startsWith('a=setup:')) return true
      if (line.startsWith('a=mid:')) return true
      if (line.startsWith('a=sctp-port:')) return true
      if (line.startsWith('a=max-message-size:')) return true

      // Keep limited ICE candidates (prefer host and srflx)
      if (line.startsWith('a=candidate:')) {
        // Skip relay candidates (typ relay) as they need TURN
        if (line.includes(' typ relay ')) return false
        iceCandidateCount++
        return iceCandidateCount <= maxCandidates
      }

      // Skip everything else (extensions, rtcp, etc.)
      return false
    })

    return essential.join('\r\n') + '\r\n'
  }

  // Compress SDP using gzip + base64
  private compressSDP(sdp: string): string {
    const filtered = this.filterSDP(sdp)
    const compressed = pako.deflate(new TextEncoder().encode(filtered))
    // Convert to base64
    let binary = ''
    for (let i = 0; i < compressed.length; i++) {
      binary += String.fromCharCode(compressed[i])
    }
    return btoa(binary)
  }

  // Decompress SDP
  private decompressSDP(compressed: string): string {
    const binary = atob(compressed)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const decompressed = pako.inflate(bytes)
    return new TextDecoder().decode(decompressed)
  }

  // Extract key parts for confirmation code (deterministic across devices)
  private extractSDPKey(sdp: string): string {
    const lines = sdp.split('\r\n')
    let ufrag = '', pwd = '', fingerprint = ''
    for (const line of lines) {
      if (line.startsWith('a=ice-ufrag:')) ufrag = line.slice(12)
      else if (line.startsWith('a=ice-pwd:')) pwd = line.slice(10)
      else if (line.startsWith('a=fingerprint:')) fingerprint = line.slice(14)
    }
    return `${ufrag}|${pwd}|${fingerprint}`
  }

  // Generate fingerprint from key
  private generateFingerprint(): string {
    if (!this.keyBytes) return ''
    const hash = sha256(this.keyBytes)
    return bytesToHex(hash).slice(0, 8)
  }

  // Generate confirmation code from key SDP parts + encryption key
  // Uses extracted key parts to ensure deterministic hashing across devices
  generateConfirmationCode(): string {
    if (!this.keyBytes || !this.offer || !this.answer) return ''
    // Use deterministic parts (ufrag|pwd|fingerprint) for consistent hashing
    const offerKey = this.extractSDPKey(this.offer)
    const answerKey = this.extractSDPKey(this.answer)
    const combined = offerKey + answerKey + bytesToHex(this.keyBytes)
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

    // Wait for ICE gathering to get some candidates
    await this.waitForICECandidates(2000)

    this.offer = this.peerConnection.localDescription?.sdp || ''
    const compressedOffer = this.compressSDP(this.offer)

    const payload: QRPayload = {
      v: 3, // Version 3: gzip compressed SDP
      o: compressedOffer,
      k: btoa(String.fromCharCode(...this.keyBytes!)),
      f: this.generateFingerprint()
    }

    console.log('[WebRTC] Original SDP size:', this.offer.length, 'bytes')
    console.log('[WebRTC] Filtered SDP:', this.filterSDP(this.offer))
    console.log('[WebRTC] Compressed offer size:', compressedOffer.length, 'bytes')
    console.log('[WebRTC] Total payload size:', JSON.stringify(payload).length, 'bytes')
    return JSON.stringify(payload)
  }

  // Wait for some ICE candidates to be gathered
  private waitForICECandidates(timeout: number): Promise<void> {
    return new Promise(resolve => {
      const timer = setTimeout(resolve, timeout)

      // Also resolve early if we get enough candidates
      let candidateCount = 0
      const handler = () => {
        candidateCount++
        if (candidateCount >= 3) {
          clearTimeout(timer)
          this.peerConnection?.removeEventListener('icecandidate', handler)
          setTimeout(resolve, 100) // Small delay for SDP to update
        }
      }
      this.peerConnection?.addEventListener('icecandidate', handler)
    })
  }

  // Parse QR code and create answer, returns confirmation code
  async processOffer(qrData: string): Promise<{ code: string; answerData: string }> {
    this.setState('answering')

    const payload: QRPayload = JSON.parse(qrData)

    if (payload.v !== 3) {
      throw new Error('Unsupported sync version. Please update both devices.')
    }

    await this.importEncryptionKey(payload.k)

    // Decompress and restore offer SDP
    this.offer = this.decompressSDP(payload.o)
    console.log('[WebRTC] Decompressed offer SDP:', this.offer)

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

    // Wait for ICE gathering to get some candidates
    await this.waitForICECandidates(2000)

    this.answer = this.peerConnection.localDescription?.sdp || ''
    this.expectedCode = this.generateConfirmationCode()
    const compressedAnswer = this.compressSDP(this.answer)

    console.log('[WebRTC] Answer SDP size:', this.answer.length, 'bytes')
    console.log('[WebRTC] Compressed answer size:', compressedAnswer.length, 'bytes')

    return {
      code: this.expectedCode,
      answerData: compressedAnswer
    }
  }

  // Complete connection by verifying code (called by offerer)
  async completeConnection(answerData: string, enteredCode: string): Promise<boolean> {
    if (!this.peerConnection) {
      throw new Error('No peer connection')
    }

    // Decompress answer SDP
    this.answer = this.decompressSDP(answerData)
    console.log('[WebRTC] Decompressed answer SDP:', this.answer)
    this.expectedCode = this.generateConfirmationCode()

    // Verify confirmation code
    const normalizedEntered = enteredCode.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const normalizedExpected = this.expectedCode.replace('-', '')

    console.log('[WebRTC] Code verification:', normalizedEntered, 'vs', normalizedExpected)

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
