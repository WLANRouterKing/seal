# Seal

[![pipeline status](https://gitlab.web-art.dev/open-source/seal/badges/master/pipeline.svg)](https://gitlab.web-art.dev/open-source/seal/-/commits/master)

[![coverage report](https://gitlab.web-art.dev/open-source/seal/badges/master/coverage.svg)](https://gitlab.web-art.dev/open-source/seal/-/commits/master)

**Private messaging sealed with Nostr**

Seal is a privacy-focused messaging app built on the [Nostr](https://nostr.com) protocol. Messages are end-to-end encrypted using NIP-17 https://github.com/nostr-protocol/nips/blob/master/17.md (Gift Wraps), ensuring that even metadata like sender identity is protected.

## Features

- **End-to-End Encryption** - All messages are encrypted using NIP-17 Gift Wraps with NIP-44 encryption
- **No Account Required** - Your cryptographic keys are your identity. No email, phone number, or registration
- **Decentralized** - Messages are relayed through multiple Nostr relays. No single point of failure
- **Local-First** - All data stored locally with optional password protection (AES-256)
- **Device Sync** - Transfer chats between devices via P2P WebRTC connection
- **QR Code Import** - Easily import your private key by scanning a QR code
- **PWA** - Install as a Progressive Web App on any device
- **Multi-Language** - English and German support

## How It Works

### NIP-17 Gift Wraps

Messages are wrapped in multiple layers of encryption:

```
┌─────────────────────────────────────┐
│           Gift Wrap (1059)          │  ← Encrypted to recipient
│  ┌───────────────────────────────┐  │
│  │         Seal (13)             │  │  ← Encrypted content
│  │  ┌─────────────────────────┐  │  │
│  │  │      Rumor (14)         │  │  │  ← Actual message
│  │  │  - sender pubkey        │  │  │
│  │  │  - content              │  │  │
│  │  │  - timestamp            │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

This ensures:
- Relays cannot see message content
- Relays cannot see who sent the message
- Only the recipient can decrypt the message

### Local Encryption

When you set a password, all local data is encrypted:
- Private keys encrypted with PBKDF2-derived AES-256 key
- Messages, contacts, and settings encrypted at rest
- Automatic migration between encrypted/unencrypted states

## Getting Started

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build
```

### Deployment

The app builds to the `dist/` folder and can be hosted on any static file server.

```bash
npm run build
```

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Vitest** - Unit testing
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **IndexedDB** - Local storage
- **nostr-tools** - Nostr protocol implementation
- **WebRTC** - P2P device sync

## Project Structure

```
src/
├── components/       # React components
│   ├── chat/         # Chat UI components
│   ├── onboarding/   # Setup flow
│   ├── settings/     # Settings screens
│   └── sync/         # Device sync UI
├── i18n/             # Translations
├── pages/            # Main app pages
├── services/         # Core services
│   ├── crypto.ts     # NIP-17 implementation
│   ├── db.ts         # IndexedDB operations
│   ├── encryption.ts # Local encryption
│   ├── relay.ts      # Nostr relay management
│   ├── syncService.ts # Data export/import
│   └── webrtc.ts     # P2P connection
├── stores/           # Zustand stores
├── types/            # TypeScript types
└── utils/            # Helper functions
```

## Security

- Private keys never leave your device
- No analytics or tracking
- No server-side storage
- Open source and auditable

## License

MIT