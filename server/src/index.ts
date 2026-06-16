import { Server } from 'socket.io';
import http from 'http';
import pino from 'pino';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { loadConfig, type ServerConfig } from './config';
import { validateRoomId, validateOperation, type ValidatedOperation } from './validation';
import { RateLimiter } from './rate-limiter';
import { createStore, SnapshotManager, type DocumentStore } from './store';

// ─── Load Config ──────────────────────────────────────────────
const config = loadConfig();

// ─── Logger ───────────────────────────────────────────────────
const logger = pino({
    level: config.logLevel,
    transport: config.nodeEnv !== 'production'
        ? { target: 'pino/file', options: { destination: 1 } }
        : undefined,
});

// ─── Rate Limiter ─────────────────────────────────────────────
const rateLimiter = new RateLimiter({ maxBurst: 100, refillRate: 50 });

// ─── In-Memory Room State (loaded from store on join) ─────────
interface RoomState {
    data: Record<string, any>;
    metadata: { [path: string]: { timestamp: number; actorId: string; version: number } };
    loadedFromStore: boolean;
    opsSinceLoad: number;
}
const rooms: Map<string, RoomState> = new Map();

// ─── Store & Snapshot Manager ─────────────────────────────────
let store: DocumentStore;
let snapshotManager: SnapshotManager;

// ─── HTTP Server ──────────────────────────────────────────────
const httpServer = http.createServer(async (req, res) => {
    const path = req.url?.split('?')[0] ?? '/';

    if (path === '/health' || path === '/healthz') {
        // Check store connectivity
        let storeOk = true;
        try {
            await store.listDocuments();
        } catch {
            storeOk = false;
        }

        const status = storeOk ? 200 : 503;
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            status: storeOk ? 'ok' : 'degraded',
            service: 'collab-server',
            store: {
                backend: config.store.backend,
                healthy: storeOk,
            },
            rooms: rooms.size,
            rateLimiterBuckets: rateLimiter.size,
        }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('CollabDoc Socket.IO Server\n');
});

// ─── Socket.IO ────────────────────────────────────────────────
const io = new Server(httpServer, {
    cors: {
        origin: config.corsOrigin,
        methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 128 * 1024,
});

// ─── Room State Helpers ───────────────────────────────────────

/**
 * Load or create room state. If the store has a snapshot and/or ops,
 * reconstruct the document from them. Otherwise create an empty room.
 */
async function loadRoom(roomId: string): Promise<RoomState> {
    const existing = rooms.get(roomId);
    if (existing) return existing;

    let data: Record<string, any> = {};
    let metadata: { [path: string]: { timestamp: number; actorId: string; version: number } } = {};
    let snapshotVersion = 0;

    try {
        // 1. Load latest snapshot
        const snapshot = await store.getSnapshot(roomId);
        if (snapshot) {
            data = JSON.parse(snapshot.data);
            metadata = JSON.parse(snapshot.metadata);
            snapshotVersion = snapshot.version;
            logger.debug({ roomId, snapshotVersion }, 'Loaded snapshot from store');
        }

        // 2. Replay ops since snapshot
        const ops = await store.getOpsSince(roomId, snapshotVersion);
        if (ops.length > 0) {
            for (const storedOp of ops) {
                const op = JSON.parse(storedOp.opData) as ValidatedOperation;
                applyOpToState(data, metadata, op);
            }
            logger.debug({ roomId, replayedOps: ops.length }, 'Replayed ops from store');
        }
    } catch (err) {
        logger.error({ roomId, error: String(err) }, 'Failed to load room from store — starting empty');
    }

    const room: RoomState = { data, metadata, loadedFromStore: true, opsSinceLoad: 0 };
    rooms.set(roomId, room);

    // Initialize snapshot manager tracking for this doc
    snapshotManager.initDoc(roomId, snapshotVersion);

    return room;
}

/**
 * Apply an operation to the in-memory state (pure function, no I/O).
 */
function applyOpToState(
    data: Record<string, any>,
    metadata: { [path: string]: { timestamp: number; actorId: string; version: number } },
    op: ValidatedOperation
): boolean {
    const pathKey = JSON.stringify(op.path);
    const existingMeta = metadata[pathKey];

    let shouldApply = true;
    if (existingMeta) {
        const incomingWinsByTimestamp = op.timestamp > existingMeta.timestamp;
        const timestampsEqual = op.timestamp === existingMeta.timestamp;
        const incomingWinsByActorId = timestampsEqual && op.actorId < existingMeta.actorId;

        if (!incomingWinsByTimestamp && !incomingWinsByActorId) {
            shouldApply = false;
        }
    }

    if (shouldApply) {
        if (op.op === 'set') {
            deepSet(data, op.path, op.value);
        } else if (op.op === 'del') {
            deepDelete(data, op.path);
        }

        if (op.op === 'del') {
            delete metadata[pathKey];
        } else {
            metadata[pathKey] = {
                timestamp: op.timestamp,
                actorId: op.actorId,
                version: op.version,
            };
        }
    }

    return shouldApply;
}

// ─── Socket.IO Event Handlers ─────────────────────────────────

io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Client connected');

    socket.on('join_room', async (roomId: unknown) => {
        const validation = validateRoomId(roomId);
        if (!validation.ok) {
            logger.warn({ socketId: socket.id, roomId, error: validation.error }, 'Invalid roomId rejected');
            socket.emit('error_msg', { code: 'INVALID_ROOM', message: validation.error });
            return;
        }
        const validRoomId = validation.data;

        socket.join(validRoomId);
        logger.debug({ socketId: socket.id, roomId: validRoomId }, 'Joined room');

        // Load from store (or use cached in-memory state)
        const room = await loadRoom(validRoomId);

        socket.emit('initial_state', room.data, room.metadata);
        logger.debug({ socketId: socket.id, roomId: validRoomId }, 'Sent initial state');
    });

    socket.on('operation', async (roomId: unknown, operation: unknown) => {
        // ── Validate roomId ──
        const roomValidation = validateRoomId(roomId);
        if (!roomValidation.ok) {
            logger.warn({ socketId: socket.id, error: roomValidation.error }, 'Operation with invalid roomId');
            socket.emit('error_msg', { code: 'INVALID_ROOM', message: roomValidation.error });
            return;
        }
        const validRoomId = roomValidation.data;

        // ── Rate limit ──
        if (!rateLimiter.consume(socket.id)) {
            logger.warn({ socketId: socket.id, roomId: validRoomId }, 'Rate limited');
            socket.emit('error_msg', { code: 'RATE_LIMITED', message: 'Too many operations per second' });
            return;
        }

        // ── Validate operation ──
        const opValidation = validateOperation(operation);
        if (!opValidation.ok) {
            logger.warn({ socketId: socket.id, roomId: validRoomId, error: opValidation.error }, 'Invalid operation rejected');
            socket.emit('error_msg', { code: 'INVALID_OP', message: opValidation.error });
            return;
        }
        const validOp = opValidation.data;

        // ── Get room state (should already be loaded from join_room) ──
        let room = rooms.get(validRoomId);
        if (!room) {
            room = await loadRoom(validRoomId);
        }

        // ── Apply LWW ──
        const applied = applyOpToState(room.data, room.metadata, validOp);

        if (applied) {
            // ── Persist to op log (async, best-effort) ──
            try {
                await store.appendOps(validRoomId, [{ opData: JSON.stringify(validOp) }]);
                room.opsSinceLoad += 1;
            } catch (err) {
                // Log but don't fail the broadcast — op is in memory.
                // Worst case: op lost on crash before next snapshot.
                logger.error({ roomId: validRoomId, opId: validOp.id, error: String(err) }, 'Failed to persist op');
            }

            // ── Notify snapshot manager ──
            snapshotManager.onOpApplied(validRoomId).catch(err => {
                logger.error({ roomId: validRoomId, error: String(err) }, 'Snapshot trigger failed');
            });

            // ── Broadcast to all clients in room ──
            io.to(validRoomId).emit('operation', validRoomId, validOp);
            logger.debug({ roomId: validRoomId, opId: validOp.id, op: validOp.op }, 'Op applied, persisted, and broadcast');
        } else {
            socket.emit('op_rejected', {
                opId: validOp.id,
                reason: 'LWW conflict: existing value wins',
            });
            logger.debug({ roomId: validRoomId, opId: validOp.id }, 'Op rejected by LWW');
        }
    });

    socket.on('disconnect', () => {
        rateLimiter.remove(socket.id);
        logger.info({ socketId: socket.id }, 'Client disconnected');
    });

    socket.on('error', (error) => {
        logger.error({ socketId: socket.id, error: String(error) }, 'Socket error');
    });
});

// ─── Startup ──────────────────────────────────────────────────

async function startup() {
    // 1. Initialize store
    store = createStore(config);
    await store.initialize();
    logger.info({ backend: config.store.backend }, 'Store initialized');

    // 2. Initialize snapshot manager
    snapshotManager = new SnapshotManager(
        store,
        {
            snapshotEveryNOps: config.store.snapshotEveryNOps,
            snapshotAfterSeconds: config.store.snapshotAfterSeconds,
        },
        logger,
        (docId: string) => {
            const room = rooms.get(docId);
            if (!room) return null;
            return { data: room.data, metadata: room.metadata };
        }
    );
    snapshotManager.start();
    logger.info('Snapshot manager started');

    // 3. Setup Redis adapter (if REDIS_URL is configured and not memory-only mode)
    if (config.redis.url && config.store.backend !== 'memory') {
        try {
            const pubClient = new Redis(config.redis.url);
            const subClient = pubClient.duplicate();

            await Promise.all([
                new Promise<void>((resolve, reject) => {
                    pubClient.once('ready', resolve);
                    pubClient.once('error', reject);
                }),
                new Promise<void>((resolve, reject) => {
                    subClient.once('ready', resolve);
                    subClient.once('error', reject);
                }),
            ]);

            io.adapter(createAdapter(pubClient, subClient));
            logger.info({ redisUrl: config.redis.url }, 'Redis adapter connected — multi-instance broadcast enabled');
        } catch (err) {
            logger.warn({ error: String(err) }, 'Redis adapter failed to connect — running in single-instance mode');
        }
    }

    // 4. Start HTTP server
    httpServer.listen(config.port, '0.0.0.0', () => {
        logger.info({
            port: config.port,
            cors: config.corsOrigin,
            store: config.store.backend,
            logLevel: config.logLevel,
        }, 'CollabDoc server started');
    });
}

// ─── Graceful Shutdown ────────────────────────────────────────

async function shutdown(signal: string) {
    logger.info({ signal }, 'Received shutdown signal — draining');

    // Stop snapshot timer
    snapshotManager.stop();

    // Flush all dirty snapshots to store
    try {
        await snapshotManager.flushAll();
        logger.info('All dirty snapshots flushed');
    } catch (err) {
        logger.error({ error: String(err) }, 'Failed to flush snapshots on shutdown');
    }

    // Close Socket.IO
    io.close(() => {
        logger.info('All connections closed');

        // Close store
        store.close().then(() => {
            logger.info('Store closed');
            httpServer.close(() => {
                logger.info('HTTP server closed — exiting');
                process.exit(0);
            });
        }).catch(err => {
            logger.error({ error: String(err) }, 'Error closing store');
            process.exit(1);
        });
    });

    // Force exit after 15s
    setTimeout(() => {
        logger.warn('Graceful shutdown timed out — forcing exit');
        process.exit(1);
    }, 15_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Start ────────────────────────────────────────────────────
startup().catch(err => {
    logger.fatal({ error: String(err) }, 'Failed to start server');
    process.exit(1);
});

// ─── Deep path helpers ────────────────────────────────────────

function deepSet(obj: any, path: (string | number)[], value: any): void {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
            current[key] = typeof path[i + 1] === 'number' ? [] : {};
        }
        current = current[key];
    }
    current[path[path.length - 1]] = value;
}

function deepDelete(obj: any, path: (string | number)[]): void {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
            return;
        }
        current = current[key];
    }
    const lastSegment = path[path.length - 1];
    if (Array.isArray(current) && typeof lastSegment === 'number') {
        if (lastSegment >= 0 && lastSegment < current.length) {
            current.splice(lastSegment, 1);
        }
    } else if (typeof current === 'object' && current !== null && current.hasOwnProperty(lastSegment)) {
        delete current[lastSegment];
    }
}