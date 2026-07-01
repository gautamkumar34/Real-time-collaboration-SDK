# ⚡ CollabDoc — Real-time Collaboration SDK (v2.1.0)

**Open-source, self-hostable SDK for adding multiplayer editing to any app.**

Built on **Yjs CRDTs** + **Socket.IO** — no conflicts, no vendor lock-in.

## 🆕 What's New in v2.1.0
- **Live Cursor Tracking**: Real-time remote cursor rendering with names and dynamic colors.
- **Document Management**: Added capability to delete documents directly from the glassmorphism Dashboard.
- **Router Stability**: Seamless SPA navigation with optimized React Router configuration.
- **UI Consistency**: Enhanced Dashboard and Editor styling for a cohesive, premium look.


## 🌐 Live Demo

**https://collabdocsdk.vercel.app/**

## ✨ Why CollabDoc?

| Feature | CollabDoc | Liveblocks | Yjs (raw) |
|---------|-----------|------------|-----------|
| CRDT engine | ✅ Yjs | Proprietary | ✅ |
| Self-hostable | ✅ | ❌ | Manual setup |
| React hook | ✅ | ✅ | ❌ |
| Persistence | ✅ Postgres | Cloud only | Manual |
| Auth | ✅ JWT | ✅ | Manual |
| Presence/Cursors | ✅ | ✅ | Manual |
| Open source | ✅ MIT | Freemium | ✅ |
| Setup time | 3 lines | 5 min | Hours |

## 🚀 Quick Start

### 1. Install & Run

```bash
git clone https://github.com/gautamkumar34/Real-time-collaboration-SDK.git
cd sdk-project
npm install

# Terminal 1 — Server
cd server && npm run dev

# Terminal 2 — Demo App
cd demo-app && npm run dev
```

Open `http://localhost:5173` → Landing page with live demo.

### 2. Use in Your App (3 lines)

```typescript
import { CollabDoc } from 'collab-doc';

const doc = new CollabDoc({
  roomId: 'my-document',
  serverUrl: 'ws://localhost:8080',
  user: { name: 'Alice', color: '#7c5cfc' },
});

doc.connect();

// Key-value operations (backed by Yjs CRDT)
doc.set(['title'], 'Hello World');
doc.set(['settings', 'theme'], 'dark');
console.log(doc.get(['title'])); // 'Hello World'
doc.delete(['settings', 'theme']);

// Rich text (Yjs Y.Text)
const text = doc.getText('content');
text.insert(0, 'Hello ');
text.insert(6, 'World');

// Full document snapshot
console.log(doc.getDocumentState()); // { title: 'Hello World' }
```

### 3. React Hook

```tsx
import { useCollabDoc } from 'collab-doc/react';

function Editor() {
  const { doc, docState, isConnected, isSynced, presence, error } = useCollabDoc({
    roomId: 'my-document',
    serverUrl: 'ws://localhost:8080',
    user: { name: 'Alice', color: '#7c5cfc' },
  });

  return (
    <div>
      <p>{isConnected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      <p>{isSynced ? '✅ Synced' : '⏳ Syncing...'}</p>

      {/* Presence: who's online */}
      <div>
        {[...presence.values()].map(user => (
          <span key={user.clientId} style={{ color: user.user?.color }}>
            {user.user?.name}
          </span>
        ))}
      </div>

      {/* Collaborative input */}
      <textarea
        value={docState.content || ''}
        onChange={e => doc?.set(['content'], e.target.value)}
        disabled={!isSynced}
      />

      {error && <p style={{ color: 'red' }}>{error.message}</p>}
    </div>
  );
}
```

## 📦 Project Structure

```
sdk-project/
├── sdk/                          # Core TypeScript SDK
│   ├── src/
│   │   ├── collab-doc.ts         # Main CollabDoc class (Yjs-backed)
│   │   ├── y-provider.ts         # Socket.IO ↔ Yjs sync provider + Awareness
│   │   └── react/useCollabDoc.ts # React hook
│   └── __tests__/                # 17 tests (Jest)
│
├── server/                       # Node.js collaboration server
│   ├── src/
│   │   ├── index.ts              # Socket.IO server with Yjs sync protocol
│   │   ├── crdt/
│   │   │   └── yjs-doc-manager.ts # One Y.Doc per room, in-memory
│   │   ├── auth/
│   │   │   └── jwt.ts            # JWT sign/verify/permissions
│   │   ├── store/
│   │   │   ├── memory-store.ts   # In-memory store (dev)
│   │   │   ├── pg-store.ts       # PostgreSQL store (production)
│   │   │   └── snapshot-manager.ts # Auto-snapshot after N ops
│   │   ├── rate-limiter.ts       # Token bucket rate limiter
│   │   └── config.ts             # Environment-based config
│   └── docker-compose.yml        # Postgres + Redis
│
├── demo-app/                     # React demo application
│   └── src/
│       ├── landing/              # Public pages (Hero, Features, Pricing, Demo)
│       └── app/                  # Workspace (Dashboard, Document Editor)
│
└── package.json                  # Workspace root
```

## 🏗️ Architecture

```
┌─────────────────┐        WebSocket         ┌──────────────────────┐
│   Your App      │◄──────────────────────────►│   CollabDoc Server   │
│   (CollabDoc    │   Yjs binary updates      │   (Socket.IO +       │
│    SDK)         │   + Awareness             │    YjsDocManager)    │
└─────────────────┘                           └──────────┬───────────┘
                                                         │
                                              ┌──────────┴───────────┐
                                              │                      │
                                        ┌─────┴─────┐        ┌──────┴──────┐
                                        │ PostgreSQL │        │    Redis    │
                                        │ (Snapshots │        │  (Pub/Sub   │
                                        │  + Op Log) │        │   Adapter)  │
                                        └───────────┘        └─────────────┘
```

### Sync Protocol

```
Client                              Server
  │                                   │
  ├─── join_room(roomId) ────────────►│  Load Y.Doc from snapshot + replay ops
  ├─── yjs_sync_step1(stateVector) ──►│
  │◄── yjs_sync_step2(diff) ─────────┤  Send missing updates
  │                                   │
  ├─── yjs_update(binary) ──────────►│  Apply → Persist → Broadcast
  │◄── yjs_update(binary) ───────────┤  From other clients
  │                                   │
  ├─── awareness_update(presence) ──►│  Broadcast cursors/selection
  │◄── awareness_update(presence) ───┤
```

## 🔐 Authentication

Auth is **optional** — disabled by default for development. Enable by setting `JWT_SECRET`:

```bash
# .env
JWT_SECRET=your-secret-key-here
```

### Token Flow

```bash
# 1. Request a token from the server
curl -X POST http://localhost:8080/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "alice", "roomId": "my-doc", "permission": "write"}'

# Response: { "token": "eyJhbG..." }

# 2. Pass token when connecting
const doc = new CollabDoc({
  roomId: 'my-doc',
  serverUrl: 'ws://localhost:8080',
  token: 'eyJhbG...',  // JWT token
  user: { name: 'Alice', color: '#7c5cfc' },
});
```

### Token Payload

```json
{
  "sub": "alice",          // User ID
  "room": "my-doc",       // Room scope ("*" for all rooms)
  "perm": "write",        // "read" or "write"
  "exp": 1750000000       // Expiry (24h default)
}
```

**Permissions:**
- `read` — Can join room, receive updates, see presence
- `write` — Everything in `read` + can send updates

## 💾 Persistence

### In-Memory (default, dev)

No setup needed. Data lost on server restart.

### PostgreSQL (production)

```bash
# 1. Start Postgres + Redis
cd server && docker-compose up -d

# 2. Configure
STORE_BACKEND=postgres
DATABASE_URL=postgres://collab:collab@localhost:5432/collabdoc
REDIS_URL=redis://localhost:6379

# 3. Tables are auto-created on startup
```

### How Persistence Works

1. Every `yjs_update` is appended to the **op log** (base64-encoded binary)
2. After N ops (default: 50), a **snapshot** is taken (full Yjs state encoded as binary)
3. On room load: latest snapshot + replay remaining ops → fully reconstructed Y.Doc

## 🧪 Testing

```bash
cd sdk && npm test
```

```
PASS __tests__/collab-doc.test.ts
  CollabDoc (Yjs-backed)
    ✓ should set and get values locally
    ✓ should delete values
    ✓ should handle nested paths
    ✓ should return undefined for non-existent paths
    ✓ should handle object values
    ✓ should overwrite existing values
    ✓ should connect and join room
    ✓ should emit synced after sync_step2
    ✓ should emit disconnect event
    ✓ should return full document state as JSON
    ✓ should emit change events
    ✓ should converge when receiving remote Yjs updates
    ✓ should send local updates to server
    ✓ should provide Y.Text for collaborative text editing
    ✓ should expose the underlying Y.Doc
    ✓ should handle awareness updates from remote clients
    ✓ should set cursor position

Tests: 17 passed, 17 total
```

## 🛠️ Configuration

All configuration via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `CORS_ORIGIN` | `*` | Allowed origins |
| `STORE_BACKEND` | `memory` | `memory` or `postgres` |
| `DATABASE_URL` | — | Postgres connection string |
| `REDIS_URL` | — | Redis URL (enables multi-instance) |
| `JWT_SECRET` | — | Set to enable auth |
| `JWT_EXPIRY_SECONDS` | `86400` | Token TTL (24h) |
| `SNAPSHOT_EVERY_N_OPS` | `50` | Ops between snapshots |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

## 🎨 Demo App

The demo app showcases the SDK with a production-quality UI:

- **Landing pages** — Hero, Features, Pricing, Live Demo playground
- **Workspace** — Dashboard with document grid, collaborative editor
- **Design** — Dark theme, glassmorphism, Inter + JetBrains Mono typography, micro-animations
- **Editor** — Line numbers, cursor tracking, word count, presence avatars, status bar

## 🏗️ Tech Stack

| Component | Technology |
|-----------|------------|
| CRDT Engine | [Yjs](https://yjs.dev/) |
| Transport | [Socket.IO](https://socket.io/) |
| Server | Node.js + TypeScript |
| Persistence | PostgreSQL |
| Pub/Sub | Redis |
| Auth | JWT (HMAC-SHA256) |
| SDK | TypeScript |
| React Hook | React 18+ |
| Demo App | Vite + React + TypeScript |
| Rate Limiting | Token bucket |

## 🛣️ Roadmap

- [x] Core SDK with real-time sync
- [x] Yjs CRDT engine (conflict-free)
- [x] Live presence & cursor tracking (Added in v2.1.0)
- [x] Document Management & Deletion (Added in v2.1.0)
- [x] PostgreSQL persistence with snapshots
- [x] Redis pub/sub for multi-instance
- [x] JWT authentication with room-scoped permissions
- [x] Rate limiting
- [x] React hook
- [x] Demo app with landing pages + collaborative editor
- [ ] Rich text editor integration (Tiptap, Slate)
- [ ] Managed cloud service
- [ ] Webhook notifications
- [ ] Document history & time travel

## 🤝 Contributing

Contributions welcome! 

1. Fork the repository
2. Create a branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License — use it however you want.