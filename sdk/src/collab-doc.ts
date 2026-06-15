// sdk/src/collab-doc.ts

import { io, Socket } from 'socket.io-client';
import { HLC, type HLCTimestamp } from './hlc';

// ─── Types ────────────────────────────────────────────────────

interface CollabDocEvents {
    change: [payload: { path: Path; action: 'set' | 'del'; value?: any; isRemote: boolean }];
    connect: [];
    disconnect: [reason: string];
    synced: [];
    error: [err: any];
    pause: [];
    resume: [];
    op_rejected: [payload: { opId: string; reason: string }];
    [key: string]: any[];
}

class BrowserEventEmitter<Events extends Record<string, any[]>> {
    private listeners: { [K in keyof Events]?: ((...args: Events[K]) => void)[] } = {};

    on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        (this.listeners[event] as ((...args: Events[K]) => void)[]).push(listener);
    }

    off<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
        if (!this.listeners[event]) {
            return;
        }
        this.listeners[event] = (this.listeners[event] as ((...args: Events[K]) => void)[]).filter(
            (l) => l !== listener
        ) as ((...args: Events[K]) => void)[];
    }

    emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
        if (!this.listeners[event]) {
            return;
        }
        const currentListeners = [...(this.listeners[event] as ((...args: Events[K]) => void)[])];
        currentListeners.forEach((listener) => {
            try {
                listener(...args);
            } catch (e) {
                console.error(`Error in event listener for ${String(event)}:`, e);
            }
        });
    }
}

export type Path = (string | number)[];
export type Operation = {
    id: string;
    path: Path;
    op: 'set' | 'del';
    value?: any;
    timestamp: number;
    actorId: string;
    version: number;
};

export interface CollabDocConfig {
    roomId: string;
    actorId: string;
    serverUrl: string;
    /** Op batching interval in ms. Default: 50. Set to 0 to disable. */
    batchIntervalMs?: number;
}

// ─── Constants ────────────────────────────────────────────────

const DEFAULT_BATCH_INTERVAL_MS = 50;
const DEDUP_RING_SIZE = 1024;

// ─── Dedup Ring Buffer ────────────────────────────────────────

class DedupRing {
    private buffer: string[];
    private index: number = 0;
    private set: Set<string> = new Set();

    constructor(size: number = DEDUP_RING_SIZE) {
        this.buffer = new Array(size).fill('');
    }

    /** Returns true if the id was already seen. */
    has(id: string): boolean {
        return this.set.has(id);
    }

    /** Record an op id. Evicts the oldest if full. */
    add(id: string): void {
        if (this.set.has(id)) return;

        // Evict oldest entry
        const evicted = this.buffer[this.index];
        if (evicted) {
            this.set.delete(evicted);
        }

        this.buffer[this.index] = id;
        this.set.add(id);
        this.index = (this.index + 1) % this.buffer.length;
    }
}

// ─── CollabDoc ────────────────────────────────────────────────

export default class CollabDoc extends BrowserEventEmitter<CollabDocEvents> {
    private roomId: string;
    private actorId: string;
    private serverUrl: string;
    private socket: Socket;
    private doc: Record<string, any>;
    private metadata: { [path: string]: { timestamp: number; actorId: string; version: number } };
    private offlineQueue: Operation[];
    private connected: boolean;
    private syncedWithServer: boolean;

    private isLiveMode: boolean;
    private remoteOperationsBuffer: Operation[];

    // Phase 1: HLC, batching, dedup
    private hlc: HLC;
    private dedupRing: DedupRing;
    private batchIntervalMs: number;
    private pendingBatch: Operation[];
    private batchTimer: ReturnType<typeof setTimeout> | null;

    constructor({ roomId, actorId, serverUrl, batchIntervalMs }: CollabDocConfig) {
        super();
        this.roomId = roomId;
        this.actorId = actorId;
        this.serverUrl = serverUrl;
        this.doc = {};
        this.metadata = {};
        this.offlineQueue = [];
        this.connected = false;
        this.syncedWithServer = false;
        this.isLiveMode = true;
        this.remoteOperationsBuffer = [];

        // Phase 1 additions
        this.hlc = new HLC(actorId);
        this.dedupRing = new DedupRing();
        this.batchIntervalMs = batchIntervalMs ?? DEFAULT_BATCH_INTERVAL_MS;
        this.pendingBatch = [];
        this.batchTimer = null;

        this.socket = io(this.serverUrl, {
            autoConnect: false,
            transports: ['websocket'],
        });

        this.socket.on('connect', () => {
            this.connected = true;
            this.emit('connect');
            this.socket.emit('join_room', this.roomId);
        });

        this.socket.on('disconnect', (reason: string) => {
            this.connected = false;
            this.emit('disconnect', reason);
        });

        this.socket.on('initial_state', (initialDocState: any, metadata: { [path: string]: any }) => {
            this.doc = JSON.parse(JSON.stringify(initialDocState));
            this.initializeMetadata(metadata);
            this.syncedWithServer = true;
            this.emit('synced');
            this.processOfflineQueue();
        });

        this.socket.on('operation', (roomId: string, op: Operation) => {
            if (roomId === this.roomId) {
                this.applyRemoteOperation(op);
            }
        });

        this.socket.on('op_rejected', (payload: { opId: string; reason: string }) => {
            this.emit('op_rejected', payload);
        });

        this.socket.on('error', (err: any) => {
            this.emit('error', err);
        });
    }

    public connect() {
        if (!this.connected) {
            this.socket.connect();
        }
    }

    public disconnect() {
        // Flush any pending batch before disconnecting
        this.flushBatch();
        if (this.connected) {
            this.socket.disconnect();
        }
    }

    public get(path: Path): any {
        let current: any = this.doc;
        for (const segment of path) {
            if (current === null || typeof current !== 'object' || !current.hasOwnProperty(segment)) {
                return undefined;
            }
            current = current[segment];
        }
        return current;
    }

    public set(path: Path, value: any) {
        const ts = this.hlc.now();
        const op: Operation = {
            id: this.generateOperationId(),
            path,
            op: 'set',
            value,
            timestamp: HLC.toNumeric(ts),
            actorId: this.actorId,
            version: (this.getMetadata(path)?.version || 0) + 1,
        };
        this.dedupRing.add(op.id);
        this.applyOperation(op);
        this.queueOrBatchOperation(op);
    }

    public delete(path: Path) {
        const ts = this.hlc.now();
        const op: Operation = {
            id: this.generateOperationId(),
            path,
            op: 'del',
            timestamp: HLC.toNumeric(ts),
            actorId: this.actorId,
            version: (this.getMetadata(path)?.version || 0) + 1,
        };
        this.dedupRing.add(op.id);
        this.applyOperation(op);
        this.queueOrBatchOperation(op);
    }

    // ─── Batching ─────────────────────────────────────────────

    private queueOrBatchOperation(op: Operation) {
        if (!this.isLiveMode) {
            this.offlineQueue.push(op);
            return;
        }

        if (!this.connected || !this.syncedWithServer) {
            this.offlineQueue.push(op);
            return;
        }

        if (this.batchIntervalMs <= 0) {
            // Batching disabled — send immediately
            this.socket.emit('operation', this.roomId, op);
            return;
        }

        // Add to pending batch
        this.pendingBatch.push(op);

        // Start batch timer if not already running
        if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                this.flushBatch();
            }, this.batchIntervalMs);
        }
    }

    private flushBatch() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        if (this.pendingBatch.length === 0) return;

        if (this.connected && this.syncedWithServer) {
            // Send each op individually (server expects 'operation' events)
            // In Phase 3 this becomes a single binary Yjs update
            for (const op of this.pendingBatch) {
                this.socket.emit('operation', this.roomId, op);
            }
        } else {
            // Went offline during batch window — move to offline queue
            this.offlineQueue.push(...this.pendingBatch);
        }

        this.pendingBatch = [];
    }

    // ─── Internal ─────────────────────────────────────────────

    private getMetadata(path: Path): { timestamp: number; actorId: string; version: number } | undefined {
        const pathKey = JSON.stringify(path);
        return this.metadata[pathKey];
    }

    private generateOperationId(): string {
        return `${this.actorId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private processOfflineQueue() {
        if (this.connected && this.syncedWithServer && this.offlineQueue.length > 0) {
            const opsToSend = [...this.offlineQueue];
            this.offlineQueue = [];
            opsToSend.forEach(op => {
                this.socket.emit('operation', this.roomId, op);
            });
        }
    }

    private applyRemoteOperation(op: Operation) {
        // ── Dedup: skip if we already applied this op locally ──
        if (this.dedupRing.has(op.id)) {
            // This is our own op echoed back — remove from offline queue if present
            const indexInQueue = this.offlineQueue.findIndex(queuedOp => queuedOp.id === op.id);
            if (indexInQueue !== -1) {
                this.offlineQueue.splice(indexInQueue, 1);
            }
            return;
        }

        // Record this remote op id so we don't re-apply if we see it again
        this.dedupRing.add(op.id);

        // Advance our HLC from the remote timestamp
        const remoteHlc: HLCTimestamp = {
            ...HLC.fromNumeric(op.timestamp),
            nodeId: op.actorId,
        };
        this.hlc.receive(remoteHlc);

        if (!this.isLiveMode) {
            this.remoteOperationsBuffer.push(op);
            return;
        }
        this.applyOperation(op, true);
    }

    private applyOperation(op: Operation, isRemote: boolean = false) {
        const pathKey = JSON.stringify(op.path);
        const existingMetadata = this.metadata[pathKey];
        let apply = true;

        if (isRemote && existingMetadata) {
            const incomingWinsByTimestamp = op.timestamp > existingMetadata.timestamp;
            const timestampsAreEqual = op.timestamp === existingMetadata.timestamp;
            const incomingWinsByActorId = timestampsAreEqual && op.actorId < existingMetadata.actorId;
            const incomingWins = incomingWinsByTimestamp || incomingWinsByActorId;

            if (!incomingWins) {
                apply = false;
            }
        }

        if (apply) {
            const pathToModify = op.path;
            const targetValue = op.value;
            const action = op.op;

            let current: any = this.doc;
            for (let i = 0; i < pathToModify.length - 1; i++) {
                const segment = pathToModify[i];
                if (typeof current !== 'object' || current === null) {
                    return;
                }
                if (!current.hasOwnProperty(segment) || current[segment] === null || typeof current[segment] !== 'object' || (Array.isArray(current[segment]) !== (typeof pathToModify[i + 1] === 'number'))) {
                    if (action === 'set') {
                        current[segment] = typeof pathToModify[i + 1] === 'number' ? [] : {};
                    } else if (action === 'del') {
                        return;
                    }
                }
                current = current[segment];
            }

            const lastSegment = pathToModify[pathToModify.length - 1];

            if (action === 'set') {
                current[lastSegment] = targetValue;
            } else if (action === 'del') {
                if (Array.isArray(current) && typeof lastSegment === 'number') {
                    if (lastSegment >= 0 && lastSegment < current.length) {
                        current.splice(lastSegment, 1);
                    }
                } else if (typeof current === 'object' && current !== null && current.hasOwnProperty(lastSegment)) {
                    delete current[lastSegment];
                }
            }

            if (op.op === 'del') {
                delete this.metadata[pathKey];
            } else {
                this.metadata[pathKey] = {
                    timestamp: op.timestamp,
                    actorId: op.actorId,
                    version: op.version,
                };
            }
            this.emit('change', { path: op.path, action: op.op, value: op.value, isRemote });
        }
    }

    private initializeMetadata(initialMetadata: { [path: string]: { timestamp: number; actorId: string; version: number } }) {
        this.metadata = JSON.parse(JSON.stringify(initialMetadata));
    }

    // ─── Public API ───────────────────────────────────────────

    public getDocumentState(): Record<string, any> {
        return JSON.parse(JSON.stringify(this.doc));
    }

    public getOfflineQueue(): Operation[] {
        return JSON.parse(JSON.stringify(this.offlineQueue));
    }

    public isConnected(): boolean {
        return this.connected;
    }

    public pause(): void {
        if (this.isLiveMode) {
            this.flushBatch(); // Send any pending ops before pausing
            this.isLiveMode = false;
            this.emit('pause');
        }
    }

    public resume(): void {
        if (!this.isLiveMode) {
            this.isLiveMode = true;
            while (this.remoteOperationsBuffer.length > 0) {
                const op = this.remoteOperationsBuffer.shift();
                if (op) {
                    this.applyOperation(op, true);
                }
            }
            this.remoteOperationsBuffer = [];
            this.processOfflineQueue();
            this.emit('resume');
        }
    }

    public isLive(): boolean {
        return this.isLiveMode;
    }
}