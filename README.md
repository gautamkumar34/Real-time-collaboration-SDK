**`# CollabDoc SDK: Real-time Document Collaboration**

---

**## ✨ Introduction**

Welcome to `CollabDoc SDK`, a lightweight and highly efficient Software Development Kit designed for building real-time, collaborative document applications. This SDK provides the core infrastructure to enable multiple users to edit a shared document simultaneously, with changes instantly synchronized across all connected clients.

Whether you're building a simple collaborative note-taking app, a shared code editor, or a complex document management system, `CollabDoc SDK` offers a robust foundation for real-time data synchronization.

**## 💡 Why CollabDoc SDK? (Uniqueness)**

In a world of complex collaborative solutions, `CollabDoc SDK` stands out by offering:

* **Simplicity & Focus:** It provides the essential real-time collaboration primitives without unnecessary bloat, making it easy to understand, integrate, and extend.
* **Transparent Conflict Resolution:** The LWW strategy is straightforward and effective for many document types, ensuring predictable outcomes for concurrent edits based on timestamp and actor ID.
* **Developer-Friendly API:** The `CollabDoc` class and `useCollabDoc` React hook are designed for ease of use, reducing the boilerplate typically associated with real-time systems.
* **Full-Stack Example:** The project includes a complete server and a demo React app, demonstrating a fully functional collaborative environment from end-to-end. This jumpstarts your development process.
* **Self-Contained Ecosystem:** Everything you need to get started with a basic collaborative document is within this single repository.

**## 📦 Project Structure**

This project is organized as a monorepo using npm workspaces, containing three main packages:`

sdk-project/
├── server/          # Node.js Socket.IO server for real-time communication and document state management.
│   └── index.ts
├── sdk/             # The core CollabDoc SDK, a TypeScript library.
│   ├── src/
│   │   ├── collab-doc.ts      # Core CollabDoc class with connection, state, and operation logic.
│   │   └── react/useCollabDoc.ts # React hook for easy integration.
│   └── package.json
└── demo-app/        # A simple React application demonstrating the SDK's usage.
├── src/
│   └── App.tsx          # The main demo component.
└── package.json

## 🚀 Features

- **Real-time Synchronization:** Instantly propagate changes to all connected clients.
- **Powered by [Socket.IO](http://socket.io/):** Utilizes [Socket.IO](http://socket.io/) for robust, bidirectional, and low-latency communication between clients and the server.
- **Last-Writer-Wins (LWW) Conflict Resolution:** Built-in server-side and client-side logic to intelligently resolve concurrent edits, ensuring data consistency.
- **Operational Transformation (OT) Inspired:** While not a full OT implementation, it leverages operational concepts for efficient updates.
- **Offline Support with Operation Queueing:** Users can continue making changes even when disconnected; operations are queued and sent when the connection is re-established.
- **React Hook Integration:** A convenient `useCollabDoc` React hook simplifies integration into React applications, managing state and lifecycle automatically.
- **Live Mode Toggle:** Clients can pause/resume live updates from the server, allowing for focused individual work or controlled broadcasting of changes.
- **Modular & Extensible:** Built as a monorepo, separating the core SDK, server, and demo app for clear development and easy extension.

`## 🚀 Getting Started

Follow these steps to get the `CollabDoc SDK` server and demo application up and running on your local machine.

### Prerequisites

* Node.js (LTS version recommended)
* npm (comes with Node.js)

### 1. Clone the Repository`

```bash
git clone [https://github.com/gautamkumar34/Real-time-collaboration-SDK.git]
cd sdk-project
```

### 2. Install Dependencies

Navigate to the root of the `sdk-project` and install dependencies for all workspaces:

```bash
npm install
```

### 3. Build the SDK

The SDK is a TypeScript library and needs to be compiled before use.

```bash
cd sdk
npm run build
cd .. # Go back to sdk-project root
```

### 4. Start the Server

Navigate to the `server` directory and start the real-time server:

```bash
cd server
npm start
# Server will typically run on http://localhost:8080
cd .. # Go back to sdk-project root
```

Keep this terminal window open, as the server needs to be running.

### 5. Start the Demo Application

Open a **new terminal window**, navigate to the `demo-app` directory, and start the React development server:

```bash
cd demo-app
npm start
```

This will usually open the application in your browser at `http://localhost:5173`.

### 6. Interact with the Demo

- Open `http://localhost:5173` in your browser.
- Try typing in the "Document Content" textarea.
- Open another tab or browser window to the same URL (`http://localhost:5173`). You'll see changes synchronize in real-time!
- Experiment with the "Pause Live Updates" button to see how client-side buffering works.
- Observe the "Raw Document State (JSON)" section to see the underlying data structure update.

## 🛠️ SDK Usage (API)

The core of the SDK is the `CollabDoc` class and its React hook wrapper, `useCollabDoc`.

### `CollabDoc` Class (Core SDK)

```tsx

import CollabDoc, { Path, CollabDocOptions } from 'collabdoc-sdk'; // Assuming 'collabdoc-sdk' is your package name

// Options for initializing CollabDoc
interface CollabDocOptions {
    roomId: string;    // Unique ID for the collaborative document
    actorId: string;   // Unique ID for the current user/client
    serverUrl: string; // URL of your Socket.IO server (e.g., 'http://localhost:8080')
}

const doc = new CollabDoc({
    roomId: 'my-shared-doc',
    actorId: 'user-abc',
    serverUrl: 'http://localhost:8080'
});

// Connect to the server
doc.connect();

// Set a value at a specific path
// Path is an array of strings/numbers, e.g., ['content'], ['users', 0, 'name']
doc.set(['content'], 'Hello, world!');

// Delete a value at a specific path
doc.delete(['oldData']);

// Get the current document state (returns a deep copy)
const currentState = doc.getDocumentState(); // { content: 'Hello, world!' }

// Event listeners
doc.on('change', (newDocState: Record<string, any>) => {
    console.log('Document updated:', newDocState);
});
doc.on('connect', () => console.log('Connected to server.'));
doc.on('disconnect', (reason: string) => console.log('Disconnected:', reason));
doc.on('synced', () => console.log('Document synced with server.'));
doc.on('error', (err: Error) => console.error('SDK Error:', err.message));
doc.on('pause', () => console.log('Live updates paused.'));
doc.on('resume', () => console.log('Live updates resumed.'));

// Control live updates
doc.pause();   // Stop sending/receiving real-time updates immediately
doc.resume();  // Resume real-time updates and process any queued operations

// Disconnect from the server
doc.disconnect();
```

### `useCollabDoc` React Hook

This hook simplifies using `CollabDoc` in React components, managing state, connection, and event listeners.

```tsx

import React from 'react';
import { useCollabDoc } from './path/to/useCollabDoc'; // Adjust path based on your project structure

function MyCollaborativeEditor() {
    const {
        docState,    // The current document state (React state)
        doc,         // The underlying CollabDoc instance
        isConnected, // Boolean: true if connected to server
        isSynced,    // Boolean: true if initial state received and synced
        isLive,      // Boolean: true if live updates are active
        pause,       // Function to pause live updates
        resume,      // Function to resume live updates
        error        // Error object if any connection/SDK error occurs
    } = useCollabDoc({
        roomId: 'my-first-collab-document',
        actorId: `client-${Math.random().toString(36).substring(2, 9)}`,
        serverUrl: 'http://localhost:8080'
    });

    // Example of using docState and doc instance
    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (doc) {
            doc.set(['content'], e.target.value);
        }
    };

    return (
        <div>
            <p>Connection: {isConnected ? 'Online' : 'Offline'}</p>
            <p>Sync: {isSynced ? 'Synced' : 'Not Synced'}</p>
            <p>Live Mode: {isLive ? 'ON' : 'OFF'}</p>
            <button onClick={isLive ? pause : resume}>
                {isLive ? 'Pause Live Updates' : 'Resume Live Updates'}
            </button>
            <textarea
                value={docState.content || ''}
                onChange={handleTextChange}
                disabled={!isConnected || !isSynced}
            />
            <pre>{JSON.stringify(docState, null, 2)}</pre>
            {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}
        </div>
    );
}
```

## ⚙️ How It Works (Brief Technical Overview)

The `CollabDoc SDK` leverages `Socket.IO` for its real-time communication.

1. **Connection:** Clients connect to the `Node.js` server via Socket.IO and join a specific `roomId`.
2. **Initial Sync:** Upon joining, the server sends the current full document state and its associated metadata (last updated timestamp, actor ID, version for each path) to the new client.
3. **Operations:** Changes to the document (e.g., `set`, `delete`) are encapsulated as "operations" with a `path`, `value`, `timestamp`, `actorId`, and `version`.
4. **Local Application:** Operations are applied locally immediately for instant UI feedback.
5. **Server Broadcast:** Operations are sent to the server, which applies them to its authoritative state after LWW conflict resolution, then broadcasts the operation to all other clients in the same room.
6. **Remote Application:** Clients receive operations from the server and apply them to their local document state, again using LWW to handle potential conflicts (e.g., if an offline client made a change that conflicts with a server-received change).

### Conflict Resolution: Last-Writer-Wins (LWW)

Both the client and server use a Last-Writer-Wins strategy. When an operation is received, it's compared to the existing value's metadata at that path:

- The operation with the **most recent `timestamp`** wins.
- If timestamps are identical, the operation with the **lexicographically smallest `actorId`** wins (as a tie-breaker).
This ensures deterministic conflict resolution across all clients and the server.

## 🛣️ Future Enhancements (Roadmap)

- **Rich Text Editor Integration:** Native support or examples for popular rich text libraries (e.g., Quill, Slate).
- **Access Control:** Implement authentication and authorization for rooms and document paths.
- **History & Undo/Redo:** Store a history of operations to enable advanced collaboration features.
- **Presence (Cursors/Selections):** Show other users' cursors and selections in real-time.
- **Diffing & Patching:** More granular operations to send only the differences, reducing bandwidth.
- **Database Persistence:** Integration with databases (e.g., MongoDB, PostgreSQL) for durable storage of document states.
- **Horizontal Scaling:** Strategies for scaling the server for a large number of concurrent users and documents.
- **Optimistic Locking/Versioning:** More advanced conflict resolution strategies.

## 🤝 Contributing

Contributions are welcome! If you have suggestions for improvements, new features, or bug fixes, please feel free to:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature-name`).
3. Make your changes.
4. Commit your changes (`git commit -m 'Add new feature'`).
5. Push to the branch (`git push origin feature/your-feature-name`).
6. Open a Pull Request.

Please ensure your code adheres to the existing coding style and includes relevant tests if applicable.

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for more details.
