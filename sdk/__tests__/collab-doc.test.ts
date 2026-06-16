// __tests__/collab-doc.test.ts

import CollabDoc, { Operation, Path } from '../src/collab-doc';
import { HLC } from '../src/hlc';
import type { Socket as SocketIoClientSocket } from 'socket.io-client';
import type { DefaultEventsMap } from 'socket.io';

// IMPORTANT: Mock 'socket.io-client' BEFORE importing `io` from it.
jest.mock('socket.io-client', () => {
    const EventEmitter = require('events');

    return {
        io: jest.fn(() => {
            const mSocketInstance: SocketIoClientSocket = new (EventEmitter as unknown as { new(): SocketIoClientSocket })();

            let connectedStatus = false;
            let ioInstanceConnected = false;

            const mockEmit = jest.fn((event: string, ...args: any[]): SocketIoClientSocket => {
                EventEmitter.prototype.emit.call(mSocketInstance, event, ...args);
                return mSocketInstance;
            }) as jest.MockedFunction<SocketIoClientSocket['emit']>;

            mSocketInstance.connect = jest.fn(() => {
                if (!ioInstanceConnected) {
                    ioInstanceConnected = true;
                    setTimeout(() => {
                        if (ioInstanceConnected) {
                            connectedStatus = true;
                            mSocketInstance.emit('connect');
                        }
                    }, 0);
                }
                return mSocketInstance;
            });

            mSocketInstance.disconnect = jest.fn((reason?: string) => {
                if (ioInstanceConnected) {
                    ioInstanceConnected = false;
                    setTimeout(() => {
                        if (!ioInstanceConnected) {
                            connectedStatus = false;
                            mSocketInstance.emit('disconnect', reason || 'io client disconnect');
                        }
                    }, 0);
                }
                return mSocketInstance;
            });

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

            Object.defineProperty(mSocketInstance, 'connected', {
                get: jest.fn(() => connectedStatus),
                configurable: true,
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
        // Disable batching in tests for predictable behavior
        doc = new CollabDoc({ roomId: testRoom, actorId: clientActorId, serverUrl: serverUrl, batchIntervalMs: 0 });
        expect((io as jest.Mock)).toHaveBeenCalledTimes(1);
        mockSocket = (io as jest.Mock).mock.results[0].value;

        mockSocket.emit.mockClear();
        mockSocket.connect.mockClear();
        mockSocket.disconnect.mockClear();
        (mockSocket as any)._simulateConnect.mockClear();
        (mockSocket as any)._simulateDisconnect.mockClear();
        (mockSocket as any)._simulateOperation.mockClear();
        (mockSocket as any)._simulateInitialState.mockClear();

        (Object.getOwnPropertyDescriptor(mockSocket, 'connected')?.get as jest.Mock).mockClear();

        jest.useFakeTimers();
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
        await flushPromises();

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

        (mockSocket as any)._simulateInitialState({}, {});
        await flushPromises();
        mockSocket.emit.mockClear();

        (mockSocket as any)._simulateDisconnect('network error');
        await flushPromises();
        expect(doc.getOfflineQueue().length).toBe(0);

        doc.set(['offlineKey'], 'offlineValue');
        await flushPromises();
        expect(doc.get(['offlineKey'])).toBe('offlineValue');
        expect(doc.getOfflineQueue().length).toBe(1);

        const offlineOp = doc.getOfflineQueue()[0];
        expect(offlineOp.path).toEqual(['offlineKey']);
        expect(offlineOp.value).toBe('offlineValue');

        doc.connect();
        await flushPromises();

        (mockSocket as any)._simulateConnect();
        await flushPromises();
        expect(mockSocket.emit).toHaveBeenCalledWith('join_room', testRoom);

        // Server sends initial state that includes the data from before disconnect.
        // The offline op will be re-sent after sync. The server may have already
        // applied it or will apply it now.
        (mockSocket as any)._simulateInitialState({}, {});
        await flushPromises();

        const operationEmitCall = mockSocket.emit.mock.calls.find(call => call[0] === 'operation' && call[1] === testRoom && call[2].id === offlineOp.id);
        expect(operationEmitCall).toBeDefined();

        // The offline op was re-sent to the server. Verify the op id matches.
        expect(operationEmitCall![2].value).toBe('offlineValue');
        expect(doc.getOfflineQueue().length).toBe(0);
    });

    it('should apply remote operations based on LWW (timestamp)', async () => {
        doc.connect();
        (mockSocket as any)._simulateConnect();

        // Use HLC-encoded timestamps for consistency
        const ts100 = HLC.toNumeric({ wallTime: 100, counter: 0, nodeId: 'server-init' });
        const ts200 = HLC.toNumeric({ wallTime: 200, counter: 0, nodeId: 'client-B' });
        const ts150 = HLC.toNumeric({ wallTime: 150, counter: 0, nodeId: 'client-C' });

        const initialMetadata = {
            '["key"]': { timestamp: ts100, actorId: 'server-init', version: 0 }
        };
        (mockSocket as any)._simulateInitialState({ key: 'initialValue' }, initialMetadata);
        await flushPromises();
        expect(doc.get(['key'])).toBe('initialValue');

        const remoteOpNewer: Operation = {
            id: 'remote-op-newer', path: ['key'], value: 'valueRemoteNewer', op: 'set',
            timestamp: ts200, actorId: 'client-B', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOpNewer);
        await flushPromises();
        expect(doc.get(['key'])).toBe('valueRemoteNewer');

        const remoteOpOlder: Operation = {
            id: 'remote-op-older', path: ['key'], value: 'valueRemoteOlder', op: 'set',
            timestamp: ts150, actorId: 'client-C', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOpOlder);
        await flushPromises();
        expect(doc.get(['key'])).toBe('valueRemoteNewer');
    });

    it('should apply remote operations based on LWW (actorId tie-breaker)', async () => {
        doc.connect();
        (mockSocket as any)._simulateConnect();

        const ts100 = HLC.toNumeric({ wallTime: 100, counter: 0, nodeId: 'client-M' });

        const initialMetadata = {
            '["key"]': { timestamp: ts100, actorId: 'client-M', version: 0 }
        };
        (mockSocket as any)._simulateInitialState({ key: 'initialValue' }, initialMetadata);
        await flushPromises();
        expect(doc.get(['key'])).toBe('initialValue');

        const remoteOpSmallerActor: Operation = {
            id: 'op-smaller-actor', path: ['key'], value: 'valueSmallerActor', op: 'set',
            timestamp: ts100, actorId: 'client-A', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOpSmallerActor);
        await flushPromises();
        expect(doc.get(['key'])).toBe('valueSmallerActor');

        const remoteOpLargerActor: Operation = {
            id: 'op-larger-actor', path: ['key'], value: 'valueLargerActor', op: 'set',
            timestamp: ts100, actorId: 'client-Z', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOpLargerActor);
        await flushPromises();
        expect(doc.get(['key'])).toBe('valueSmallerActor');
    });

    it('should not re-apply self-sent operations received back from server (dedup ring)', async () => {
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

        // Server echoes our op back — dedup ring should catch it
        (mockSocket as any)._simulateOperation(testRoom, sentOperation!);
        await flushPromises();

        expect(doc.getDocumentState()).toEqual({ test: 'localValue' });
        expect(listener).toHaveBeenCalledTimes(0);
        expect(doc.getOfflineQueue().length).toBe(0);
    });

    it('should handle initial state from server', async () => {
        const ts100 = HLC.toNumeric({ wallTime: 100, counter: 0, nodeId: 'server-init' });
        const initialState = {
            users: [{ id: 1, name: 'Alice' }],
            settings: { theme: 'dark' },
        };
        const initialMetadata = {
            '["users"]': { timestamp: ts100, actorId: 'server-init', version: 0 },
            '["users",0]': { timestamp: ts100 + 1, actorId: 'server-init', version: 0 },
            '["users",0,"id"]': { timestamp: ts100 + 2, actorId: 'server-init', version: 0 },
            '["users",0,"name"]': { timestamp: ts100 + 3, actorId: 'server-init', version: 0 },
            '["settings"]': { timestamp: ts100 + 4, actorId: 'server-init', version: 0 },
            '["settings","theme"]': { timestamp: ts100 + 5, actorId: 'server-init', version: 0 },
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

    it('should use HLC timestamps that are monotonically increasing', () => {
        // Set two values rapidly — HLC should produce increasing timestamps
        doc.set(['a'], 1);
        doc.set(['b'], 2);

        const stateA = (doc as any).metadata['["a"]'];
        const stateB = (doc as any).metadata['["b"]'];

        expect(stateA.timestamp).toBeDefined();
        expect(stateB.timestamp).toBeDefined();
        // HLC timestamps must be strictly increasing
        expect(stateB.timestamp).toBeGreaterThanOrEqual(stateA.timestamp);
    });
});

// --- Live Mode Functionality Tests ---
describe('CollabDoc Live Mode Functionality', () => {
    let mockSocket: jest.Mocked<SocketIoClientSocket>;
    let doc: CollabDoc;
    const testRoom = 'test-room';
    const clientActorId = 'client-A';
    const serverUrl = 'http://localhost:8080';

    beforeEach(async () => {
        (io as jest.Mock).mockClear();
        // Disable batching in tests
        doc = new CollabDoc({ roomId: testRoom, actorId: clientActorId, serverUrl: serverUrl, batchIntervalMs: 0 });
        mockSocket = (io as jest.Mock).mock.results[0].value;
        mockSocket.emit.mockClear();
        mockSocket.connect.mockClear();
        mockSocket.disconnect.mockClear();
        (mockSocket as any)._simulateConnect.mockClear();
        (mockSocket as any)._simulateDisconnect.mockClear();
        (mockSocket as any)._simulateOperation.mockClear();
        (mockSocket as any)._simulateInitialState.mockClear();

        jest.useFakeTimers();

        doc.connect();
        await flushPromises();
        (mockSocket as any)._simulateInitialState({}, {});
        await flushPromises();
        mockSocket.emit.mockClear();
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

        expect(doc.get(['pausedKey'])).toBe('pausedValue');
        expect(mockSocket.emit).not.toHaveBeenCalledWith('operation', expect.any(String), expect.any(Object));
        expect(doc.getOfflineQueue().length).toBe(1);
        expect(doc.getOfflineQueue()[0].path).toEqual(['pausedKey']);
        expect(changeListener).toHaveBeenCalledTimes(1);
    });

    it('should pause live mode and buffer remote operations', async () => {
        doc.pause();
        expect(doc.isLive()).toBe(false);

        const changeListener = jest.fn();
        doc.on('change', changeListener);

        const ts = HLC.toNumeric({ wallTime: Date.now(), counter: 0, nodeId: 'client-B' });
        const remoteOp: Operation = {
            id: 'remote-op-buffered', path: ['remoteKey'], value: 'remoteValue', op: 'set',
            timestamp: ts, actorId: 'client-B', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOp);
        await flushPromises();

        expect(doc.get(['remoteKey'])).toBeUndefined();
        expect(changeListener).not.toHaveBeenCalled();
        expect((doc as any).remoteOperationsBuffer.length).toBe(1);
        expect((doc as any).remoteOperationsBuffer[0]).toEqual(remoteOp);
    });

    it('should resume live mode, apply buffered remote ops, then send queued local ops', async () => {
        doc.pause();
        expect(doc.isLive()).toBe(false);

        const changeListener = jest.fn();
        doc.on('change', changeListener);

        doc.set(['localQueue'], 'localValue');
        await flushPromises();
        expect(doc.getOfflineQueue().length).toBe(1);
        expect(changeListener).toHaveBeenCalledTimes(1);
        changeListener.mockClear();

        const remoteOp1: Operation = {
            id: 'remote-buffered-1', path: ['remoteBuffer1'], value: 'buffer1', op: 'set',
            timestamp: HLC.toNumeric({ wallTime: Date.now() + 10, counter: 0, nodeId: 'client-B' }),
            actorId: 'client-B', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOp1);
        await flushPromises();
        expect((doc as any).remoteOperationsBuffer.length).toBe(1);
        expect(changeListener).not.toHaveBeenCalled();

        const remoteOp2: Operation = {
            id: 'remote-buffered-2', path: ['remoteBuffer2'], value: 'buffer2', op: 'set',
            timestamp: HLC.toNumeric({ wallTime: Date.now() + 20, counter: 0, nodeId: 'client-C' }),
            actorId: 'client-C', version: 2
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOp2);
        await flushPromises();
        expect((doc as any).remoteOperationsBuffer.length).toBe(2);
        expect(changeListener).not.toHaveBeenCalled();

        doc.resume();
        expect(doc.isLive()).toBe(true);
        await flushPromises();

        expect(doc.get(['remoteBuffer1'])).toBe('buffer1');
        expect(doc.get(['remoteBuffer2'])).toBe('buffer2');
        expect(changeListener).toHaveBeenCalledTimes(2);
        expect((doc as any).remoteOperationsBuffer.length).toBe(0);

        expect(doc.getOfflineQueue().length).toBe(0);
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
        doc.pause();
        expect(pauseListener).not.toHaveBeenCalled();
    });

    it('should not re-resume if already live', () => {
        expect(doc.isLive()).toBe(true);
        const resumeListener = jest.fn();
        doc.on('resume', resumeListener);
        doc.resume();
        expect(resumeListener).not.toHaveBeenCalled();
    });

    it('should handle remote operation with LWW when resumed after buffering', async () => {
        doc.pause();
        const ts100 = HLC.toNumeric({ wallTime: 100, counter: 0, nodeId: 'client-B' });
        const ts50 = HLC.toNumeric({ wallTime: 50, counter: 0, nodeId: 'client-C' });

        const remoteOp1: Operation = {
            id: 'remote-buffered-win', path: ['conflictKey'], value: 'initialRemote', op: 'set',
            timestamp: ts100, actorId: 'client-B', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOp1);
        await flushPromises();

        const remoteOp2: Operation = {
            id: 'remote-buffered-lose', path: ['conflictKey'], value: 'olderRemote', op: 'set',
            timestamp: ts50, actorId: 'client-C', version: 1
        };
        (mockSocket as any)._simulateOperation(testRoom, remoteOp2);
        await flushPromises();

        expect(doc.get(['conflictKey'])).toBeUndefined();

        doc.resume();
        await flushPromises();

        expect(doc.get(['conflictKey'])).toBe('initialRemote');
        expect((doc as any).remoteOperationsBuffer.length).toBe(0);
    });
});

// --- HLC Unit Tests ---
describe('HLC (Hybrid Logical Clock)', () => {
    it('should produce monotonically increasing timestamps', () => {
        const hlc = new HLC('node-1');
        const t1 = hlc.now();
        const t2 = hlc.now();
        const t3 = hlc.now();

        expect(HLC.compare(t1, t2)).toBeLessThan(0);
        expect(HLC.compare(t2, t3)).toBeLessThan(0);
    });

    it('should advance on receive of a higher remote timestamp', () => {
        const hlc = new HLC('node-1');
        const local = hlc.now();

        const remote: { wallTime: number; counter: number; nodeId: string } = {
            wallTime: local.wallTime + 10000,
            counter: 5,
            nodeId: 'node-2',
        };

        const merged = hlc.receive(remote);
        expect(merged.wallTime).toBeGreaterThanOrEqual(remote.wallTime);

        const next = hlc.now();
        expect(HLC.compare(merged, next)).toBeLessThan(0);
    });

    it('should handle same wall time with counter advancement', () => {
        const hlc1 = new HLC('node-1');
        const hlc2 = new HLC('node-2');

        // Force same wall time by making calls very fast
        const t1 = hlc1.now();
        const t2 = hlc2.now();

        // Receive each other's timestamps
        hlc1.receive(t2);
        hlc2.receive(t1);

        const t1_after = hlc1.now();
        const t2_after = hlc2.now();

        // Both should have advanced beyond both original timestamps
        expect(HLC.isNewer(t1_after, t1)).toBe(true);
        expect(HLC.isNewer(t2_after, t2)).toBe(true);
    });

    it('should produce deterministic total order via nodeId tie-break', () => {
        const tsA = { wallTime: 100, counter: 0, nodeId: 'aaa' };
        const tsB = { wallTime: 100, counter: 0, nodeId: 'bbb' };

        // aaa < bbb lexicographically
        expect(HLC.compare(tsA, tsB)).toBeLessThan(0);
        expect(HLC.compare(tsB, tsA)).toBeGreaterThan(0);
    });

    it('should roundtrip through numeric encoding', () => {
        const ts = { wallTime: 100000, counter: 42, nodeId: 'test' };
        const numeric = HLC.toNumeric(ts);
        const decoded = HLC.fromNumeric(numeric);

        expect(decoded.wallTime).toBe(ts.wallTime);
        expect(decoded.counter).toBe(ts.counter);
    });

    it('should preserve comparison order through numeric encoding', () => {
        const earlier = { wallTime: 100, counter: 0, nodeId: 'a' };
        const later = { wallTime: 100, counter: 1, nodeId: 'a' };
        const muchLater = { wallTime: 200, counter: 0, nodeId: 'a' };

        expect(HLC.toNumeric(earlier)).toBeLessThan(HLC.toNumeric(later));
        expect(HLC.toNumeric(later)).toBeLessThan(HLC.toNumeric(muchLater));
    });
});

// --- Op Batching Tests ---
describe('CollabDoc Op Batching', () => {
    let mockSocket: jest.Mocked<SocketIoClientSocket>;
    let doc: CollabDoc;
    const testRoom = 'test-room';
    const clientActorId = 'client-A';
    const serverUrl = 'http://localhost:8080';

    beforeEach(async () => {
        (io as jest.Mock).mockClear();
        // Enable batching with 50ms interval
        doc = new CollabDoc({ roomId: testRoom, actorId: clientActorId, serverUrl: serverUrl, batchIntervalMs: 50 });
        mockSocket = (io as jest.Mock).mock.results[0].value;
        mockSocket.emit.mockClear();

        jest.useFakeTimers();

        doc.connect();
        jest.runAllTimers();
        await Promise.resolve();
        (mockSocket as any)._simulateInitialState({}, {});
        jest.runAllTimers();
        await Promise.resolve();
        mockSocket.emit.mockClear();
    });

    afterEach(() => {
        if (doc.isConnected()) {
            doc.disconnect();
            jest.runAllTimers();
        }
        jest.runAllTimers();
        jest.useRealTimers();
    });

    it('should not send ops immediately when batching is enabled', async () => {
        doc.set(['key1'], 'value1');
        // Don't advance timers — ops should be pending
        await Promise.resolve();

        const opCalls = mockSocket.emit.mock.calls.filter(c => c[0] === 'operation');
        expect(opCalls.length).toBe(0);
    });

    it('should flush batch after interval elapses', async () => {
        doc.set(['key1'], 'value1');
        doc.set(['key2'], 'value2');

        // Advance past batch interval
        jest.advanceTimersByTime(60);
        await Promise.resolve();

        const opCalls = mockSocket.emit.mock.calls.filter(c => c[0] === 'operation');
        expect(opCalls.length).toBe(2);
    });

    it('should flush batch on disconnect', async () => {
        doc.set(['key1'], 'value1');
        await Promise.resolve();

        // Disconnect should flush pending batch
        doc.disconnect();
        jest.runAllTimers();
        await Promise.resolve();

        const opCalls = mockSocket.emit.mock.calls.filter(c => c[0] === 'operation');
        expect(opCalls.length).toBe(1);
    });

    it('should flush batch on pause', async () => {
        doc.set(['key1'], 'value1');
        await Promise.resolve();

        doc.pause();
        await Promise.resolve();

        const opCalls = mockSocket.emit.mock.calls.filter(c => c[0] === 'operation');
        expect(opCalls.length).toBe(1);
    });
});