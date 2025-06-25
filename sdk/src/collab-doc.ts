// // sdk/src/collab-doc.ts 

import { io, Socket } from 'socket.io-client';

interface CollabDocEvents {
    change: [payload: { path: Path; action: 'set' | 'del'; value?: any; isRemote: boolean }];
    connect: []; 
    disconnect: [reason: string];
    synced: []; 
    error: [err: any];
    pause: [];   
    resume: [];  
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
}

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

    constructor({ roomId, actorId, serverUrl }: CollabDocConfig) {
        super();
        console.log(`[CollabDoc ${actorId}] Constructor: Initializing for room: ${roomId}...`);
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
        this.socket = io(this.serverUrl, {
            autoConnect: false,
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
        const op: Operation = {
            id: this.generateOperationId(),
            path,
            op: 'set',
            value,
            timestamp: Date.now(),
            actorId: this.actorId,
            version: (this.getMetadata(path)?.version || 0) + 1
        };
        this.applyOperation(op);
        this.queueOrSendOperation(op);
    }

    public delete(path: Path) {
        const op: Operation = {
            id: this.generateOperationId(),
            path,
            op: 'del',
            timestamp: Date.now(),
            actorId: this.actorId,
            version: (this.getMetadata(path)?.version || 0) + 1
        };
        this.applyOperation(op);
        this.queueOrSendOperation(op);
    }

    private getMetadata(path: Path): { timestamp: number; actorId: string; version: number } | undefined {
        const pathKey = JSON.stringify(path);
        return this.metadata[pathKey];
    }

    private generateOperationId(): string {
        return `${this.actorId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private queueOrSendOperation(op: Operation) {
        if (!this.isLiveMode) {
            this.offlineQueue.push(op);
            return;
        }

        if (this.connected && this.syncedWithServer) {
            this.socket.emit('operation', this.roomId, op);
        } else {
            this.offlineQueue.push(op);
        }
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
        const indexInQueue = this.offlineQueue.findIndex(queuedOp => queuedOp.id === op.id);
        if (indexInQueue !== -1) {
            this.offlineQueue.splice(indexInQueue, 1);
            return;
        }

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
                    console.warn(`[CollabDoc ${this.actorId}] Invalid path for operation: ${JSON.stringify(pathToModify)}. Current path segment: ${segment}, current value:`, current);
                    return;
                }
                if (!current.hasOwnProperty(segment) || current[segment] === null || typeof current[segment] !== 'object' || (Array.isArray(current[segment]) !== (typeof pathToModify[i+1] === 'number'))) {
                    if (action === 'set') {
                        current[segment] = typeof pathToModify[i+1] === 'number' ? [] : {};
                    } else if (action === 'del') {
                        console.warn(`[CollabDoc ${this.actorId}] Intermediate path segment not found for DELETE: ${segment} in ${JSON.stringify(pathToModify)}`);
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
                    } else {
                        console.warn(`[CollabDoc ${this.actorId}] Attempted to delete invalid array index: ${lastSegment} in path ${JSON.stringify(pathToModify)}`);
                    }
                } else if (typeof current === 'object' && current !== null && current.hasOwnProperty(lastSegment)) {
                    delete current[lastSegment];
                } else {
                    console.warn(`[CollabDoc ${this.actorId}] Attempted to delete non-existent or invalid path segment: ${JSON.stringify(pathToModify)}`);
                }
            }

            if (op.op === 'del') {
                delete this.metadata[pathKey];
            } else {
                this.metadata[pathKey] = {
                    timestamp: op.timestamp,
                    actorId: op.actorId,
                    version: op.version
                };
            }
            this.emit('change', { path: op.path, action: op.op, value: op.value, isRemote });
        }
    }

    private initializeMetadata(initialMetadata: { [path: string]: { timestamp: number; actorId: string; version: number } }) {
        this.metadata = JSON.parse(JSON.stringify(initialMetadata));
    }

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