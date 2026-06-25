// __tests__/collab-doc.test.ts
// Tests for Yjs-backed CollabDoc

import CollabDoc, { type Path } from '../src/collab-doc';
import type { Socket as SocketIoClientSocket } from 'socket.io-client';

// ─── Mock socket.io-client ───────────────────────────────────

jest.mock('socket.io-client', () => {
    const EventEmitter = require('events');

    return {
        io: jest.fn(() => {
            const mSocket: any = new EventEmitter();
            let connectedStatus = false;

            const originalEmit = EventEmitter.prototype.emit.bind(mSocket);
            mSocket.emit = jest.fn((event: string, ...args: any[]) => {
                originalEmit(event, ...args);
                return mSocket;
            });

            mSocket.connect = jest.fn(() => {
                if (!connectedStatus) {
                    connectedStatus = true;
                    setTimeout(() => {
                        if (connectedStatus) originalEmit('connect');
                    }, 0);
                }
                return mSocket;
            });

            mSocket.disconnect = jest.fn(() => {
                if (connectedStatus) {
                    connectedStatus = false;
                    setTimeout(() => {
                        if (!connectedStatus) originalEmit('disconnect', 'io client disconnect');
                    }, 0);
                }
                return mSocket;
            });

            // Test helpers
            mSocket._simulateConnect = jest.fn(() => {
                if (!connectedStatus) {
                    connectedStatus = true;
                    originalEmit('connect');
                }
            });

            mSocket._simulateDisconnect = jest.fn((reason = 'io client disconnect') => {
                if (connectedStatus) {
                    connectedStatus = false;
                    originalEmit('disconnect', reason);
                }
            });

            mSocket._simulateYjsSyncStep2 = jest.fn((roomId: string, update: number[]) => {
                originalEmit('yjs_sync_step2', roomId, update);
            });

            mSocket._simulateYjsUpdate = jest.fn((roomId: string, update: number[]) => {
                originalEmit('yjs_update', roomId, update);
            });

            mSocket._simulateAwareness = jest.fn((roomId: string, data: any) => {
                originalEmit('awareness_update', roomId, data);
            });

            Object.defineProperty(mSocket, 'connected', {
                get: () => connectedStatus,
                configurable: true,
            });

            return mSocket;
        }),
    };
});

import { io } from 'socket.io-client';
import * as Y from 'yjs';

describe('CollabDoc (Yjs-backed)', () => {
    let mockSocket: any;
    let doc: CollabDoc;
    const testRoom = 'test-room';
    const serverUrl = 'http://localhost:8080';

    beforeEach(() => {
        (io as jest.Mock).mockClear();
        doc = new CollabDoc({
            roomId: testRoom,
            serverUrl,
            user: { name: 'Test User', color: '#FF6B6B' },
        });
        mockSocket = (io as jest.Mock).mock.results[0].value;
        mockSocket.emit.mockClear();
        jest.useFakeTimers();
    });

    afterEach(() => {
        doc.disconnect();
        jest.runAllTimers();
        jest.useRealTimers();
    });

    const flush = async () => {
        jest.runAllTimers();
        await Promise.resolve();
        jest.runAllTimers();
        await Promise.resolve();
    };

    // ─── Helper: simulate full sync ─────────────────────

    /**
     * Simulate a server sync response.
     * Creates a Y.Doc on the "server side", applies initial data,
     * encodes the state, and sends it as sync_step2.
     */
    const simulateSync = async (initialData?: Record<string, any>) => {
        // Server creates a Y.Doc with initial data
        const serverDoc = new Y.Doc();
        if (initialData) {
            const root = serverDoc.getMap('root');
            for (const [k, v] of Object.entries(initialData)) {
                root.set(k, v);
            }
        }
        // Encode full state as update
        const update = Y.encodeStateAsUpdate(serverDoc);

        // Client should have sent yjs_sync_step1 on connect
        mockSocket._simulateYjsSyncStep2(testRoom, Array.from(update));
        serverDoc.destroy();
        await flush();
    };

    // ─── Core CRUD ──────────────────────────────────────

    it('should set and get values locally (before sync)', async () => {
        doc.set(['title'], 'Hello');
        expect(doc.get(['title'])).toBe('Hello');
    });

    it('should delete values', async () => {
        doc.set(['toDelete'], 'value');
        expect(doc.get(['toDelete'])).toBe('value');
        doc.delete(['toDelete']);
        expect(doc.get(['toDelete'])).toBeUndefined();
    });

    it('should handle nested paths', async () => {
        doc.set(['settings', 'theme'], 'dark');
        expect(doc.get(['settings', 'theme'])).toBe('dark');
        expect(doc.get(['settings'])).toEqual({ theme: 'dark' });
    });

    it('should return undefined for non-existent paths', () => {
        expect(doc.get(['nonexistent'])).toBeUndefined();
        expect(doc.get(['deep', 'path'])).toBeUndefined();
    });

    it('should handle object values', () => {
        doc.set(['user'], { name: 'Alice', age: 30 });
        expect(doc.get(['user'])).toEqual({ name: 'Alice', age: 30 });
        expect(doc.get(['user', 'name'])).toBe('Alice');
    });

    it('should overwrite existing values', () => {
        doc.set(['key'], 'first');
        expect(doc.get(['key'])).toBe('first');
        doc.set(['key'], 'second');
        expect(doc.get(['key'])).toBe('second');
    });

    // ─── Connection ─────────────────────────────────────

    it('should connect and join room', async () => {
        const connectListener = jest.fn();
        doc.on('connect', connectListener);

        doc.connect();
        await flush();

        expect(mockSocket.connect).toHaveBeenCalledTimes(1);
        expect(connectListener).toHaveBeenCalledTimes(1);
        expect(mockSocket.emit).toHaveBeenCalledWith('join_room', testRoom);
    });

    it('should emit synced after sync_step2', async () => {
        const syncedListener = jest.fn();
        doc.on('synced', syncedListener);

        doc.connect();
        await flush();
        await simulateSync({ existing: 'data' });

        expect(syncedListener).toHaveBeenCalledTimes(1);
        expect(doc.isSynced()).toBe(true);
        expect(doc.get(['existing'])).toBe('data');
    });

    it('should emit disconnect event', async () => {
        const disconnectListener = jest.fn();
        doc.on('disconnect', disconnectListener);

        doc.connect();
        await flush();

        mockSocket._simulateDisconnect('network error');
        await flush();

        expect(disconnectListener).toHaveBeenCalledTimes(1);
        expect(doc.isConnected()).toBe(false);
    });

    // ─── Document State ─────────────────────────────────

    it('should return full document state as JSON', async () => {
        doc.set(['title'], 'My Doc');
        doc.set(['content'], 'Hello world');

        const state = doc.getDocumentState();
        expect(state).toEqual({ title: 'My Doc', content: 'Hello world' });
    });

    it('should emit change events', async () => {
        const changeListener = jest.fn();
        doc.on('change', changeListener);

        doc.set(['key'], 'value');
        expect(changeListener).toHaveBeenCalledTimes(1);
        expect(changeListener).toHaveBeenCalledWith({ origin: 'local' });
    });

    // ─── CRDT Convergence ───────────────────────────────

    it('should converge when receiving remote Yjs updates', async () => {
        doc.connect();
        await flush();
        await simulateSync();

        // Simulate a remote client making a change
        const remoteDoc = new Y.Doc();
        const remoteRoot = remoteDoc.getMap('root');

        // Capture the update
        let capturedUpdate: Uint8Array | null = null;
        remoteDoc.on('update', (update: Uint8Array) => {
            capturedUpdate = update;
        });

        remoteRoot.set('remoteKey', 'remoteValue');

        // Send the remote update to our client
        mockSocket._simulateYjsUpdate(testRoom, Array.from(capturedUpdate!));
        await flush();

        expect(doc.get(['remoteKey'])).toBe('remoteValue');
        remoteDoc.destroy();
    });

    it('should send local updates to server', async () => {
        doc.connect();
        await flush();
        await simulateSync();
        mockSocket.emit.mockClear();

        doc.set(['localKey'], 'localValue');

        // Should have emitted a yjs_update event
        const updateCalls = mockSocket.emit.mock.calls.filter((c: any[]) => c[0] === 'yjs_update');
        expect(updateCalls.length).toBe(1);
        expect(updateCalls[0][1]).toBe(testRoom);
        // The update should be a number array
        expect(Array.isArray(updateCalls[0][2])).toBe(true);
    });

    // ─── Y.Text (Rich Text) ────────────────────────────

    it('should provide Y.Text for collaborative text editing', () => {
        const text = doc.getText('myText');
        expect(text).toBeInstanceOf(Y.Text);

        text.insert(0, 'Hello ');
        text.insert(6, 'World');

        expect(text.toString()).toBe('Hello World');
    });

    it('should expose the underlying Y.Doc', () => {
        const ydoc = doc.getYDoc();
        expect(ydoc).toBeInstanceOf(Y.Doc);
    });

    // ─── Presence / Awareness ───────────────────────────

    it('should handle awareness updates from remote clients', async () => {
        const awarenessListener = jest.fn();
        doc.on('awareness', awarenessListener);

        doc.connect();
        await flush();

        // Simulate remote awareness
        mockSocket._simulateAwareness(testRoom, {
            clientId: 999,
            state: { user: { name: 'Bob', color: '#4ECDC4' } },
        });
        await flush();

        expect(awarenessListener).toHaveBeenCalled();
        const states = awarenessListener.mock.calls[awarenessListener.mock.calls.length - 1][0];
        expect(states.get(999)).toBeDefined();
        expect(states.get(999).user.name).toBe('Bob');
    });

    it('should set cursor position', async () => {
        doc.connect();
        await flush();
        await simulateSync();
        mockSocket.emit.mockClear();

        doc.setCursor({ path: 'content', offset: 5 });

        // Should broadcast awareness
        const awarenessCalls = mockSocket.emit.mock.calls.filter((c: any[]) => c[0] === 'awareness_update');
        expect(awarenessCalls.length).toBeGreaterThan(0);
    });
});