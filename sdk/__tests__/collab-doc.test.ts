// __tests__/collab-doc.test.ts

import CollabDoc, { Operation, Path } from '../src/collab-doc';
import type { Socket as SocketIoClientSocket } from 'socket.io-client';
import type { DefaultEventsMap } from 'socket.io';

// IMPORTANT: Mock 'socket.io-client' BEFORE importing `io` from it.
jest.mock('socket.io-client', () => {
    const EventEmitter = require('events');

    return {
        io: jest.fn(() => {
            const mSocketInstance: SocketIoClientSocket = new (EventEmitter as unknown as { new(): SocketIoClientSocket })();

            let connectedStatus = false;
            let ioInstanceConnected = false; // Track actual socket.io client connection status

            const mockEmit = jest.fn((event: string, ...args: any[]): SocketIoClientSocket => {
                EventEmitter.prototype.emit.call(mSocketInstance, event, ...args);
                return mSocketInstance;
            }) as jest.MockedFunction<SocketIoClientSocket['emit']>;

            mSocketInstance.connect = jest.fn(() => {
                if (!ioInstanceConnected) {
                    ioInstanceConnected = true;
                    // Simulate async connect for more realistic testing
                    setTimeout(() => {
                        if (ioInstanceConnected) { // Check again in case disconnect happened during timeout
                            connectedStatus = true;
                            mSocketInstance.emit('connect');
                        }
                    }, 0); // Simulate microtask or small delay
                }
                return mSocketInstance;
            });

            mSocketInstance.disconnect = jest.fn((reason?: string) => {
                if (ioInstanceConnected) {
                    ioInstanceConnected = false; // Mark as trying to disconnect
                    // Simulate async disconnect
                    setTimeout(() => {
                        if (!ioInstanceConnected) { // Confirm still disconnected after timeout
                            connectedStatus = false;
                            mSocketInstance.emit('disconnect', reason || 'io client disconnect');
                        }
                    }, 0);
                }
                return mSocketInstance;
            });

            // Ensure _simulateX methods are also jest.fn() if you intend to mock/clear them
            // These simulate events coming FROM the server TO the client.
            (mSocketInstance as any)._simulateConnect = jest.fn(() => {
                if (!connectedStatus) {
                    connectedStatus = true;
                    mSocketInstance.emit('connect');
                }
            });
            (mSocketInstance as any)._simulateDisconnect = jest.fn((reason: string = 'io client disconnect') => {
                if (connectedStatus) {
                    connectedStatus = false;
                    mSocketInstance.emit('disconnect', reason);
                }
            });
            (mSocketInstance as any)._simulateOperation = jest.fn((roomId: string, op: Operation) => {
                mSocketInstance.emit('operation', roomId, op);
            });
            (mSocketInstance as any)._simulateInitialState = jest.fn((initialState: any, metadata: { [path: string]: any }) => {
                mSocketInstance.emit('initial_state', initialState, metadata);
            });

            // Add a mock for the connected property
            Object.defineProperty(mSocketInstance, 'connected', {
                get: jest.fn(() => connectedStatus),
                configurable: true // Allow redefining in tests if necessary
            });


            mSocketInstance.emit = mockEmit;

            return mSocketInstance;
        }),
    };
});

// Now import `io` AFTER it's mocked
import { io } from 'socket.io-client';

describe('CollabDoc Core Functionality', () => {
    let mockSocket: jest.Mocked<SocketIoClientSocket>;
    let doc: CollabDoc;
    const testRoom = 'test-room';
    const clientActorId = 'client-A';
    const serverUrl = 'http://localhost:8080';

    beforeEach(() => {
        (io as jest.Mock).mockClear();
        doc = new CollabDoc({ roomId: testRoom, actorId: clientActorId, serverUrl: serverUrl });
        expect((io as jest.Mock)).toHaveBeenCalledTimes(1);
        mockSocket = (io as jest.Mock).mock.results[0].value;

        // Clear mocks *on the captured mockSocket* to start each test fresh
        mockSocket.emit.mockClear();
        mockSocket.connect.mockClear();
        mockSocket.disconnect.mockClear();
        (mockSocket as any)._simulateConnect.mockClear();
        (mockSocket as any)._simulateDisconnect.mockClear();
        (mockSocket as any)._simulateOperation.mockClear();
        (mockSocket as any)._simulateInitialState.mockClear();

        // Reset the mock 'connected' getter if it was manipulated
        (Object.getOwnPropertyDescriptor(mockSocket, 'connected')?.get as jest.Mock).mockClear();

        jest.useFakeTimers();
    });

    afterEach(() => {
        // Ensure to disconnect if still connected, to clean up listeners and state
        if (doc.isConnected()) {
            doc.disconnect();
            jest.runAllTimers(); // Ensure disconnect events propagate
        }
        jest.runAllTimers();
        jest.useRealTimers();
    });

    const flushPromises = async () => {
        // runAllTimers will process all pending timers (including setTimeout(..., 0))
        jest.runAllTimers();
        // Allow any microtasks (like promise resolutions from async/await) to complete
        await Promise.resolve();
        jest.runAllTimers(); // Run timers again in case microtasks scheduled new timers
        await Promise.resolve(); // Allow new microtasks to settle
    };

    it('should set and get values correctly', async () => {
        doc.set(['key1'], 'value1');
        await flushPromises();
        expect(doc.get(['key1'])).toBe('value1');
    });

    it('should delete values correctly', async () => {
        doc.set(['keyToDelete'], 'value');
        await flushPromises();
        doc.delete(['keyToDelete']);
        await flushPromises();
        expect(doc.get(['keyToDelete'])).toBeUndefined();
    });

    it('should notify onChange listeners for set operations', async () => {
        const listener = jest.fn();
        doc.on('change', listener);
        doc.set(['newKey'], 'newValue');
        await flushPromises();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({ path: ['newKey'], action: 'set', value: 'newValue', isRemote: false });
        expect(doc.get(['newKey'])).toBe('newValue');
    });

    it('should notify onChange listeners for delete operations', async () => {
        doc.set(['keyToDel'], 'valueToDel');
        await flushPromises();
        const listener = jest.fn();
        doc.on('change', listener);
        doc.delete(['keyToDel']);
        await flushPromises();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({ path: ['keyToDel'], action: 'del', value: undefined, isRemote: false });
        expect(doc.get(['keyToDel'])).toBeUndefined();
    });

    it('should connect to the server and join the room', async () => {
        const connectListener = jest.fn();
        const syncedListener = jest.fn();
        doc.on('connect', connectListener);
        doc.on('synced', syncedListener);

        doc.connect();
        await flushPromises(); // Process connect async and its emit('connect')

        expect(mockSocket.connect).toHaveBeenCalledTimes(1);
        expect(doc.isConnected()).toBe(true);
        expect(connectListener).toHaveBeenCalledTimes(1);
        expect(mockSocket.emit).toHaveBeenCalledWith('join_room', testRoom);

        (mockSocket as any)._simulateInitialState({}, {});
        await flushPromises();

        expect(syncedListener).toHaveBeenCalledTimes(1);
    });

    it('should handle operations when offline and sync on reconnect', async () => {
        doc.connect();
        await flushPromises();

        (mockSocket as any)._simulateInitialState({}, {}); // Simulate immediate sync
        await flushPromises();
        mockSocket.emit.mockClear(); // Clear any initial join_room emits

        (mockSocket as any)._simulateDisconnect('network error');
        await flushPromises();
        // After explicit disconnect, offlineQueue should be empty for ops sent while connected
        // but now it's disconnected, so new ops will be queued.
        expect(doc.getOfflineQueue().length).toBe(0); // Should be empty as we just disconnected

        doc.set(['offlineKey'], 'offlineValue');
        await flushPromises();
        expect(doc.get(['offlineKey'])).toBe('offlineValue');
        expect(doc.getOfflineQueue().length).toBe(1);

        const offlineOp = doc.getOfflineQueue()[0];
        expect(offlineOp.path).toEqual(['offlineKey']);
        expect(offlineOp.value).toBe('offlineValue');

        doc.connect(); // Reconnect
        await flushPromises();

        // Simulate connect and initial state on reconnect
        (mockSocket as any)._simulateConnect(); // Ensures doc.connected is true
        await flushPromises();
        expect(mockSocket.emit).toHaveBeenCalledWith('join_room', testRoom);

        (mockSocket as any)._simulateInitialState({}, {}); // Ensures doc.syncedWithServer is true
        await flushPromises();

        // The offline operation should now be sent
        const operationEmitCall = mockSocket.emit.mock.calls.find(call => call[0] === 'operation' && call[1] === testRoom && call[2].id === offlineOp.id);
        expect(operationEmitCall).toBeDefined();

        // Simulate the server echoing the operation back
        (mockSocket as any)._simulateOperation(testRoom, operationEmitCall![2]);
        await flushPromises();

        // The operation should have been removed from the queue
        expect(doc.getOfflineQueue().length).toBe(0);
        expect(doc.get(['offlineKey'])).toBe('offlineValue');
    });

    it('should apply remote operations based on Last-Write-Wins (timestamp)', async () => {
        doc.connect();
        (mockSocket as any)._simulateConnect();
        const initialMetadata = {
            '["key"]': { timestamp: 100, actorId: 'server-init', version: 0 }
        };
        (mockSocket as any)._simulateInitialState({ key: 'initialValue' }, initialMetadata);
        await flushPromises();
        expect(doc.get(['key'])).toBe('initialValue');

        const remoteOpNewer: Operation = {
            id: 'remote-op-newer', path: ['key'], value: 'valueRemoteNewer', op: 'set',
            timestamp: 200, actorId: 'client-B', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOpNewer);
        await flushPromises();
        expect(doc.get(['key'])).toBe('valueRemoteNewer');

        const remoteOpOlder: Operation = {
            id: 'remote-op-older', path: ['key'], value: 'valueRemoteOlder', op: 'set',
            timestamp: 150, actorId: 'client-C', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOpOlder);
        await flushPromises();
        expect(doc.get(['key'])).toBe('valueRemoteNewer');
    });

    it('should apply remote operations based on Last-Write-Wins (actorId tie-breaker)', async () => {
        doc.connect();
        (mockSocket as any)._simulateConnect();
        const initialMetadata = {
            '["key"]': { timestamp: 100, actorId: 'client-M', version: 0 }
        };
        (mockSocket as any)._simulateInitialState({ key: 'initialValue' }, initialMetadata);
        await flushPromises();
        expect(doc.get(['key'])).toBe('initialValue');

        const remoteOpSmallerActor: Operation = {
            id: 'op-smaller-actor', path: ['key'], value: 'valueSmallerActor', op: 'set',
            timestamp: 100, actorId: 'client-A', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOpSmallerActor);
        await flushPromises();
        expect(doc.get(['key'])).toBe('valueSmallerActor');

        const remoteOpLargerActor: Operation = {
            id: 'op-larger-actor', path: ['key'], value: 'valueLargerActor', op: 'set',
            timestamp: 100, actorId: 'client-Z', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOpLargerActor);
        await flushPromises();
        expect(doc.get(['key'])).toBe('valueSmallerActor');
    });

    it('should apply remote delete after local set with LWW', async () => {
        doc.connect();
        (mockSocket as any)._simulateConnect();
        (mockSocket as any)._simulateInitialState({}, {});
        await flushPromises();
        mockSocket.emit.mockClear();

        doc.set(['data'], 'some-value');
        await flushPromises();
        const localOpSent = mockSocket.emit.mock.calls.find(call => call[0] === 'operation' && call[1] === testRoom)?.[2];
        expect(localOpSent).toBeDefined();

        const remoteDeleteOp: Operation = {
            id: 'remote-delete', path: ['data'], op: 'del',
            timestamp: localOpSent!.timestamp + 10,
            actorId: 'client-B', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteDeleteOp);
        await flushPromises();
        expect(doc.get(['data'])).toBeUndefined();
    });

    it('should apply remote set after local delete with LWW', async () => {
        doc.connect();
        (mockSocket as any)._simulateConnect();
        const initialMetadata = { '["data"]': { timestamp: 50, actorId: 'server-init', version: 0 } };
        (mockSocket as any)._simulateInitialState({ data: 'initial' }, initialMetadata);
        await flushPromises();
        mockSocket.emit.mockClear();

        doc.delete(['data']);
        await flushPromises();
        expect(doc.get(['data'])).toBeUndefined();
        const localOpSent = mockSocket.emit.mock.calls.find(call => call[0] === 'operation' && call[1] === testRoom)?.[2];
        expect(localOpSent).toBeDefined();

        const remoteSetOp: Operation = {
            id: 'remote-set', path: ['data'], value: 'remote-value', op: 'set',
            timestamp: localOpSent!.timestamp + 10,
            actorId: 'client-B', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteSetOp);
        await flushPromises();
        expect(doc.get(['data'])).toBe('remote-value');
    });

    it('should not re-apply self-sent operations received back from server', async () => {
        doc.connect();
        (mockSocket as any)._simulateConnect();
        (mockSocket as any)._simulateInitialState({}, {});
        await flushPromises();
        mockSocket.emit.mockClear();

        const listener = jest.fn();
        doc.on('change', listener);

        doc.set(['test'], 'localValue');
        await flushPromises();

        expect(doc.getDocumentState()).toEqual({ test: 'localValue' });
        expect(listener).toHaveBeenCalledTimes(1);
        listener.mockClear();

        const sentOperation = mockSocket.emit.mock.calls.find(call => call[0] === 'operation' && call[1] === testRoom)?.[2];
        expect(sentOperation).toBeDefined();

        (mockSocket as any)._simulateOperation(testRoom, sentOperation!);
        await flushPromises();

        expect(doc.getDocumentState()).toEqual({ test: 'localValue' });
        expect(listener).toHaveBeenCalledTimes(0);
        expect(doc.getOfflineQueue().length).toBe(0);
    });

    it('should handle initial state from server', async () => {
        const initialState = {
            users: [{ id: 1, name: 'Alice' }],
            settings: { theme: 'dark' },
        };
        const initialMetadata = {
            '["users"]': { timestamp: 100, actorId: 'server-init', version: 0 },
            '["users",0]': { timestamp: 101, actorId: 'server-init', version: 0 },
            '["users",0,"id"]': { timestamp: 102, actorId: 'server-init', version: 0 },
            '["users",0,"name"]': { timestamp: 103, actorId: 'server-init', version: 0 },
            '["settings"]': { timestamp: 104, actorId: 'server-init', version: 0 },
            '["settings","theme"]': { timestamp: 105, actorId: 'server-init', version: 0 },
        };

        doc.connect();
        (mockSocket as any)._simulateConnect();
        await flushPromises();

        (mockSocket as any)._simulateInitialState(initialState, initialMetadata);
        await flushPromises();

        expect(doc.getDocumentState()).toEqual(initialState);
        expect(doc.get(['users', 0, 'name'])).toBe('Alice');
        expect(doc.get(['settings', 'theme'])).toBe('dark');
    });

    it('should emit connect/disconnect events', async () => {
        const connectListener = jest.fn();
        const disconnectListener = jest.fn();
        doc.on('connect', connectListener);
        doc.on('disconnect', disconnectListener);

        doc.connect();
        await flushPromises();

        expect(mockSocket.connect).toHaveBeenCalledTimes(1);
        expect(connectListener).toHaveBeenCalledTimes(1);
        expect(disconnectListener).not.toHaveBeenCalled();

        doc.disconnect();
        await flushPromises();

        expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
        expect(disconnectListener).toHaveBeenCalledTimes(1);
        expect(connectListener).toHaveBeenCalledTimes(1);
    });
});

// --- NEW: Live Mode Functionality Tests ---
describe('CollabDoc Live Mode Functionality', () => {
    let mockSocket: jest.Mocked<SocketIoClientSocket>;
    let doc: CollabDoc;
    const testRoom = 'test-room';
    const clientActorId = 'client-A';
    const serverUrl = 'http://localhost:8080';

    beforeEach(async () => {
        (io as jest.Mock).mockClear();
        doc = new CollabDoc({ roomId: testRoom, actorId: clientActorId, serverUrl: serverUrl });
        mockSocket = (io as jest.Mock).mock.results[0].value;
        mockSocket.emit.mockClear();
        mockSocket.connect.mockClear();
        mockSocket.disconnect.mockClear();
        (mockSocket as any)._simulateConnect.mockClear();
        (mockSocket as any)._simulateDisconnect.mockClear();
        (mockSocket as any)._simulateOperation.mockClear();
        (mockSocket as any)._simulateInitialState.mockClear();

        jest.useFakeTimers();

        // Establish initial connection and sync for most live mode tests
        doc.connect();
        await flushPromises();
        (mockSocket as any)._simulateInitialState({}, {});
        await flushPromises();
        mockSocket.emit.mockClear(); // Clear initial join_room emit
    });

    afterEach(() => {
        if (doc.isConnected()) {
            doc.disconnect();
            jest.runAllTimers();
        }
        jest.runAllTimers();
        jest.useRealTimers();
    });

    const flushPromises = async () => {
        jest.runAllTimers();
        await Promise.resolve();
        jest.runAllTimers();
        await Promise.resolve();
        jest.runAllTimers();
    };

    it('should start in live mode', () => {
        expect(doc.isLive()).toBe(true);
    });

    it('should pause live mode and queue local operations', async () => {
        const changeListener = jest.fn();
        doc.on('change', changeListener);

        doc.pause();
        expect(doc.isLive()).toBe(false);

        doc.set(['pausedKey'], 'pausedValue');
        await flushPromises();

        expect(doc.get(['pausedKey'])).toBe('pausedValue'); // Applied locally
        expect(mockSocket.emit).not.toHaveBeenCalledWith('operation', expect.any(String), expect.any(Object)); // Not sent to server
        expect(doc.getOfflineQueue().length).toBe(1);
        expect(doc.getOfflineQueue()[0].path).toEqual(['pausedKey']);
        expect(changeListener).toHaveBeenCalledTimes(1); // Local apply still triggers change
    });

    it('should pause live mode and buffer remote operations', async () => {
        doc.pause();
        expect(doc.isLive()).toBe(false);

        const changeListener = jest.fn();
        doc.on('change', changeListener);

        const remoteOp: Operation = {
            id: 'remote-op-buffered', path: ['remoteKey'], value: 'remoteValue', op: 'set',
            timestamp: Date.now(), actorId: 'client-B', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOp);
        await flushPromises();

        expect(doc.get(['remoteKey'])).toBeUndefined(); // Not applied locally
        expect(changeListener).not.toHaveBeenCalled(); // No change event emitted
        expect((doc as any).remoteOperationsBuffer.length).toBe(1); // Access private prop for test
        expect((doc as any).remoteOperationsBuffer[0]).toEqual(remoteOp);
    });

    it('should resume live mode, apply buffered remote ops, then send queued local ops', async () => {
        // Setup: Pause, queue local, buffer remote
        doc.pause();
        expect(doc.isLive()).toBe(false);

        const changeListener = jest.fn();
        doc.on('change', changeListener);

        // Local op while paused
        doc.set(['localQueue'], 'localValue');
        await flushPromises();
        expect(doc.getOfflineQueue().length).toBe(1); // Queued locally
        expect(changeListener).toHaveBeenCalledTimes(1); // Local apply
        changeListener.mockClear();

        // Remote op while paused
        const remoteOp1: Operation = {
            id: 'remote-buffered-1', path: ['remoteBuffer1'], value: 'buffer1', op: 'set',
            timestamp: Date.now() + 10, actorId: 'client-B', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOp1);
        await flushPromises();
        expect((doc as any).remoteOperationsBuffer.length).toBe(1); // Buffered
        expect(changeListener).not.toHaveBeenCalled(); // Not applied yet

        const remoteOp2: Operation = {
            id: 'remote-buffered-2', path: ['remoteBuffer2'], value: 'buffer2', op: 'set',
            timestamp: Date.now() + 20, actorId: 'client-C', version: 2
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOp2);
        await flushPromises();
        expect((doc as any).remoteOperationsBuffer.length).toBe(2); // Buffered
        expect(changeListener).not.toHaveBeenCalled(); // Not applied yet

        // Resume
        doc.resume();
        expect(doc.isLive()).toBe(true);
        await flushPromises();

        // Assert buffered remote ops applied
        expect(doc.get(['remoteBuffer1'])).toBe('buffer1');
        expect(doc.get(['remoteBuffer2'])).toBe('buffer2');
        expect(changeListener).toHaveBeenCalledTimes(2); // Two change events for remote ops
        expect((doc as any).remoteOperationsBuffer.length).toBe(0); // Buffer should be empty

        // Assert queued local ops sent
        expect(doc.getOfflineQueue().length).toBe(0); // Should be sent/cleared
        expect(mockSocket.emit).toHaveBeenCalledWith('operation', testRoom, expect.objectContaining({ path: ['localQueue'] }));
    });

    it('should emit pause and resume events', async () => {
        const pauseListener = jest.fn();
        const resumeListener = jest.fn();
        doc.on('pause', pauseListener);
        doc.on('resume', resumeListener);

        doc.pause();
        await flushPromises();
        expect(pauseListener).toHaveBeenCalledTimes(1);
        expect(resumeListener).not.toHaveBeenCalled();

        doc.resume();
        await flushPromises();
        expect(resumeListener).toHaveBeenCalledTimes(1);
        expect(pauseListener).toHaveBeenCalledTimes(1);
    });

    it('should not re-pause if already paused', () => {
        doc.pause();
        expect(doc.isLive()).toBe(false);
        const pauseListener = jest.fn();
        doc.on('pause', pauseListener);
        doc.pause(); // Call again
        expect(pauseListener).not.toHaveBeenCalled(); // Should not emit again
    });

    it('should not re-resume if already live', () => {
        expect(doc.isLive()).toBe(true);
        const resumeListener = jest.fn();
        doc.on('resume', resumeListener);
        doc.resume(); // Call again
        expect(resumeListener).not.toHaveBeenCalled(); // Should not emit again
    });

    it('should handle remote operation with LWW when resumed after buffering', async () => {
        doc.pause();
        // Simulate a remote op that should win (newer timestamp)
        const remoteOp1: Operation = {
            id: 'remote-buffered-win', path: ['conflictKey'], value: 'initialRemote', op: 'set',
            timestamp: 100, actorId: 'client-B', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOp1);
        await flushPromises();

        // Simulate another remote op that should lose (older timestamp)
        const remoteOp2: Operation = {
            id: 'remote-buffered-lose', path: ['conflictKey'], value: 'olderRemote', op: 'set',
            timestamp: 50, actorId: 'client-C', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOp2);
        await flushPromises();

        expect(doc.get(['conflictKey'])).toBeUndefined(); // Still undefined as paused

        doc.resume();
        await flushPromises();

        // After resume, only the winning operation should be applied
        expect(doc.get(['conflictKey'])).toBe('initialRemote');
        // Check internal buffer is empty (access private property for test)
        expect((doc as any).remoteOperationsBuffer.length).toBe(0);
    });
});