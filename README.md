# Seal

https://sealchat.app

[![CI](https://github.com/WLANRouterKing/seal/actions/workflows/ci.yml/badge.svg)](https://github.com/WLANRouterKing/seal/actions/workflows/ci.yml)
[![Security](https://github.com/WLANRouterKing/seal/actions/workflows/security.yml/badge.svg)](https://github.com/WLANRouterKing/seal/actions/workflows/security.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Private messaging sealed with Nostr**

Seal is a privacy-focused messaging app built on the [Nostr](https://nostr.com) protocol. Messages are end-to-end encrypted using NIP-17 Gift Wraps, ensuring that even metadata like sender identity is protected.

## Features

### Privacy & Security
- **End-to-End Encryption** - All messages encrypted using [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md) Gift Wraps with NIP-44 encryption
- **Encrypted Media** - Images and voice messages encrypted with AES-256-GCM before upload
- **Disappearing Messages** - Self-destructing messages with [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) expiration
- **Account Deletion** - Request data removal from relays with [NIP-62](https://github.com/nostr-protocol/nips/blob/master/62.md) Vanish Request
- **Local Encryption** - Optional password protection with AES-256 for all local data
- **No Analytics** - Zero tracking, no telemetry, no server-side storage

### Communication
- **Text Messages** - Rich text messaging with emoji support
- **Voice Messages** - Record and send encrypted voice messages (up to 60s)
- **Image Sharing** - Send encrypted images with automatic compression
- **Real-time Delivery** - Instant message delivery via Nostr relays

### Identity
- **No Account Required** - Your cryptographic keys are your identity
- **QR Code Import/Export** - Easily transfer your identity between devices
- **Key Backup** - Secure backup of your private key (nsec)

### Sync & Access
- **Device Sync** - Transfer chats between devices via P2P WebRTC connection
- **PWA** - Install as a Progressive Web App on any device
- **Multi-Language** - English and German support
- **Dark/Light Theme** - System-aware theme with manual override

## Importing vs. Device Sync

There are two ways to access your account on a new device:

### Private Key Import (nsec)

When you import your private key on a new device:
- ✅ Your identity is restored (same npub/nsec)
- ✅ Messages stored on relays are fetched
- ❌ **Contacts are NOT imported** (stored locally only)
- ❌ **Relay settings are NOT imported**
- ❌ **App settings are NOT imported**

This is because Nostr is a decentralized protocol - only encrypted messages are stored on relays. Contacts and settings are stored locally on your device.

### Device Sync (Recommended)

Device Sync transfers **all your data** directly between devices via encrypted P2P connection:
- ✅ Your identity (keys)
- ✅ All messages (including those no longer on relays)
- ✅ **All contacts**
- ✅ **Relay settings**
- ✅ **App settings**

**How to use Device Sync:**
1. On your old device: Settings → Device Sync → "Send Data"
2. A QR code and connection info will be shown
3. On your new device: Settings → Device Sync → "Receive Data"
4. Scan the QR code with the new device
5. Confirm the security code matches on both devices
6. Data transfers directly via encrypted WebRTC connection

## How It Works

### NIP-17 Gift Wraps

Messages are wrapped in multiple layers of encryption:

```
┌─────────────────────────────────────┐
│         Gift Wrap (kind 1059)       │  ← Signed with random key
│  ┌───────────────────────────────┐  │     Encrypted to recipient
│  │       Seal (kind 13)          │  │
│  │  ┌─────────────────────────┐  │  │  ← Signed by sender
│  │  │    Rumor (kind 14)      │  │  │     Encrypted content
│  │  │  - sender pubkey        │  │  │
│  │  │  - message content      │  │  │  ← Actual message
│  │  │  - timestamp            │  │  │
│  │  │  - expiration (NIP-40)  │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

This ensures:
- Relays cannot read message content
- Relays cannot identify the sender
- Only the intended recipient can decrypt
- Messages can auto-expire

### Encrypted File Upload

Media files are encrypted client-side before upload:

1. Generate random AES-256 key
2. Encrypt file with AES-GCM
3. Encrypt AES key with NIP-44 (recipient's pubkey)
4. Upload encrypted blob to Blossom/NIP-96 server
5. Send URL + encrypted key in message

## Getting Started

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm run test

# Build for production
npm run build
```

### Android Build (Capacitor)

```bash
# Sync with Capacitor
npx cap sync android

# Build APK
cd android && ./gradlew assembleRelease
```

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server
- **Mantine 7** - UI component library
- **Zustand** - State management
- **IndexedDB** - Encrypted local storage
- **nostr-tools** - Nostr protocol implementation
- **Capacitor** - Native mobile builds
- **WebRTC** - P2P device sync
- **Vitest** - Unit testing

## Supported NIPs

| NIP | Description | Status |
|-----|-------------|--------|
| [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) | Basic protocol | ✅ |
| [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md) | Private Direct Messages | ✅ |
| [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) | Expiration Timestamp | ✅ |
| [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) | Encrypted Payloads | ✅ |
| [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md) | Gift Wrap | ✅ |
| [NIP-62](https://github.com/nostr-protocol/nips/blob/master/62.md) | Request to Vanish | ✅ |
| [NIP-96](https://github.com/nostr-protocol/nips/blob/master/96.md) | HTTP File Storage | ✅ |
| [NIP-98](https://github.com/nostr-protocol/nips/blob/master/98.md) | HTTP Auth | ✅ |

## Project Structure

```
src/
├── components/          # React components
│   ├── chat/            # Chat UI (MessageBubble, MessageInput)
│   ├── onboarding/      # Account setup flow
│   ├── settings/        # Settings screens
│   └── sync/            # Device sync UI
├── hooks/               # Custom React hooks
│   └── useAudioRecorder # Voice message recording
├── i18n/                # Translations (en, de)
├── pages/               # Main app pages
├── services/            # Core services
│   ├── crypto.ts        # NIP-17/44/59/62 implementation
│   ├── db.ts            # IndexedDB with encryption
│   ├── fileUpload.ts    # Encrypted file upload
│   ├── relay.ts         # Nostr relay pool
│   └── webrtc.ts        # P2P sync connection
├── stores/              # Zustand state stores
└── utils/               # Helper functions
```

## Security Considerations

- Private keys are stored locally and never transmitted
- All network traffic uses encrypted Nostr events
- Media files are encrypted before leaving the device
- Optional password protection encrypts all local data
- No server-side components or data collection
- Open source and auditable

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

### Third-Party Licenses

- **[Tabler Icons](https://tabler.io/icons)** - MIT License
