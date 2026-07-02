# collabdoc-sdk

> Real-time collaborative document editing SDK powered by **Yjs CRDTs** and **Socket.IO**.  
> Add Google Docs-style collaboration to any React app in minutes.

[![npm version](https://img.shields.io/npm/v/collabdoc-sdk.svg)](https://www.npmjs.com/package/collabdoc-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

- **Conflict-Free Merging** — Yjs CRDTs guarantee zero data loss, even with simultaneous edits
- **Real-Time Sync** — Sub-50ms latency over Socket.IO WebSockets
- **Presence & Cursors** — See who's online and where they're typing
- **Offline Support** — Keep editing offline; changes merge seamlessly on reconnect
- **JWT Authentication** — Secure room-based access with any auth provider
- **Zero Config** — All dependencies bundled; just `npm install` and go

## Quick Start

### 1. Install

```bash
npm install collabdoc-sdk
```

### 2. Use the React Hook

```tsx
import { useCollabDoc } from 'collabdoc-sdk/react';

function CollaborativeEditor() {
  const { doc, isConnected, isSynced, presence, error } = useCollabDoc({
    roomId: 'my-document-123',
    serverUrl: 'https://your-collab-server.com',
    user: { name: 'Alice', color: '#0070f3' },
    token: 'your-jwt-token', // optional
  });

  // Get the collaborative text
  const yText = doc?.getText('content');
  const text = yText?.toString() || '';

  // Write to the document
  const handleChange = (e) => {
    doc?.getYDoc().transact(() => {
      yText?.delete(0, yText.length);
      yText?.insert(0, e.target.value);
    });
  };

  return (
    <div>
      <p>{isConnected ? 'Connected' : 'Connecting...'}</p>
      <p>{presence.size} users online</p>
      <textarea value={text} onChange={handleChange} />
    </div>
  );
}
```

### 3. Use Without React

```typescript
import { CollabDoc } from 'collabdoc-sdk';

const doc = new CollabDoc({
  roomId: 'my-document-123',
  serverUrl: 'https://your-collab-server.com',
  user: { name: 'Bob', color: '#34d399' },
});

doc.on('connect', () => console.log('Connected!'));
doc.on('synced', () => console.log('Document synced!'));
doc.on('change', ({ origin }) => console.log(`Change from ${origin}`));

doc.connect();

// Key-Value API
doc.set(['settings', 'theme'], 'dark');
console.log(doc.get(['settings', 'theme'])); // 'dark'

// Rich Text API
const yText = doc.getText('content');
yText.insert(0, 'Hello, World!');
```

## API Reference

### `useCollabDoc(options)` — React Hook

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `roomId` | `string` | ✅ | Unique document/room identifier |
| `serverUrl` | `string` | ✅ | CollabDoc WebSocket server URL |
| `user` | `{ name, color }` | ❌ | User info for presence |
| `token` | `string` | ❌ | JWT token for authentication |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `doc` | `CollabDoc \| null` | The CollabDoc instance |
| `isConnected` | `boolean` | WebSocket connection status |
| `isSynced` | `boolean` | Initial sync complete |
| `presence` | `Map<number, AwarenessUser>` | Online users and cursors |
| `error` | `Error \| null` | Connection/auth errors |

### `CollabDoc` — Core Class

#### Key-Value API
```typescript
doc.set(['path', 'to', 'key'], value)   // Set nested value
doc.get(['path', 'to', 'key'])          // Read value
doc.delete(['path', 'to', 'key'])       // Delete key
doc.getDocumentState()                  // Full document as JSON
```

#### Rich Text API
```typescript
const yText = doc.getText('fieldName')  // Get Y.Text instance
yText.insert(0, 'Hello')               // Insert text
yText.delete(0, 5)                     // Delete text
yText.toString()                       // Read full text
```

#### Presence API
```typescript
doc.setCursor({ path: 'content', offset: 42 })  // Broadcast cursor
doc.getPresence()                                 // Get all users
doc.getAwareness()                                // Raw Awareness instance
```

#### Events
```typescript
doc.on('connect', () => {})             // WebSocket connected
doc.on('disconnect', (reason) => {})    // WebSocket disconnected
doc.on('synced', () => {})              // Initial sync complete
doc.on('change', ({ origin }) => {})    // Document changed
doc.on('awareness', (states) => {})     // Presence updated
doc.on('error', (err) => {})            // Error occurred
```

## Server Setup

The SDK requires a CollabDoc-compatible WebSocket server. See the [server documentation](https://github.com/gautamkumar34/Real-time-collaboration-SDK/tree/v2/server) for setup instructions.

```bash
# Clone and run the server
git clone https://github.com/gautamkumar34/Real-time-collaboration-SDK.git
cd Real-time-collaboration-SDK/server
npm install
npm run dev
```

## License

MIT © Gautam Kumar
