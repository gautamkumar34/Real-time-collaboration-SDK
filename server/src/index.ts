import { Server } from 'socket.io';
import http from 'http';
import pino from 'pino';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { loadConfig, type ServerConfig } from './config';
import { RateLimiter } from './rate-limiter';
import { createStore, SnapshotManager, type DocumentStore } from './store';
import { YjsDocManager } from './crdt/yjs-doc-manager';
import { signToken, verifyToken, canWrite, canRead, type TokenPayload } from './auth/jwt';
import * as Y from 'yjs';

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

// ─── Yjs Doc Manager ─────────────────────────────────────────
const docManager = new YjsDocManager();

// ─── Store & Snapshot Manager ─────────────────────────────────
let store: DocumentStore;
let snapshotManager: SnapshotManager;

/** Track ops-since-snapshot per room for snapshot triggering */
const roomOpCounts: Map<string, number> = new Map();

// ─── HTTP Server ──────────────────────────────────────────────
const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const path = url.pathname;

    // ── Health Check ──
    if (path === '/health' || path === '/healthz') {
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
            store: { backend: config.store.backend, healthy: storeOk },
            docsInMemory: docManager.size,
            rateLimiterBuckets: rateLimiter.size,
        }));
        return;
    }

    // ── Token Endpoint ──
    if (path === '/api/auth/token' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { roomId, userId, permission } = JSON.parse(body);
                if (!roomId || !userId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'roomId and userId required' }));
                    return;
                }
                const token = signToken({
                    sub: userId,
                    room: roomId,
                    perm: permission === 'read' ? 'read' : 'write',
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ token }));
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            }
        });
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('CollabDoc Socket.IO Server (Yjs)\n');
});

// ─── Socket.IO ────────────────────────────────────────────────
const io = new Server(httpServer, {
    cors: {
        origin: config.corsOrigin,
        methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 512 * 1024, // 512KB — Yjs updates can be larger
});

// ─── Auth Middleware ──────────────────────────────────────────
// If JWT_SECRET is set, require valid token. Otherwise, allow all (dev mode).
const authEnabled = !!process.env.JWT_SECRET;

io.use((socket, next) => {
    if (!authEnabled) {
        // Dev mode — no auth required
        (socket.data as any).user = { sub: `anon-${socket.id}`, room: '*', perm: 'write' as const };
        return next();
    }

    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
        return next(new Error('AUTH_REQUIRED: No token provided'));
    }

    const payload = verifyToken(token);
    if (!payload) {
        return next(new Error('AUTH_INVALID: Token verification failed'));
    }

    (socket.data as any).user = payload;
    next();
});

// ─── Room Loading ─────────────────────────────────────────────

/**
 * Load a Y.Doc from the store if we haven't already.
 * The store persists Yjs binary snapshots.
 */
async function ensureDocLoaded(roomId: string): Promise<void> {
    if (docManager.has(roomId)) return;

    try {
        const snapshot = await store.getSnapshot(roomId);
        if (snapshot) {
            // Snapshot data is a base64-encoded Yjs binary
            const binary = Buffer.from(snapshot.data, 'base64');
            docManager.loadFromSnapshot(roomId, new Uint8Array(binary));
            logger.debug({ roomId, version: snapshot.version }, 'Loaded Y.Doc from snapshot');
        } else {
            // New document — just create an empty Y.Doc
            docManager.getOrCreate(roomId);
            logger.debug({ roomId }, 'Created new Y.Doc');
        }

        // Replay any ops since snapshot
        const snapshotVersion = snapshot?.version ?? 0;
        const ops = await store.getOpsSince(roomId, snapshotVersion);
        if (ops.length > 0) {
            for (const op of ops) {
                const binary = Buffer.from(op.opData, 'base64');
                docManager.applyUpdate(roomId, new Uint8Array(binary));
            }
            logger.debug({ roomId, replayedOps: ops.length }, 'Replayed ops from store');
        }

        snapshotManager.initDoc(roomId, snapshotVersion + ops.length);
        roomOpCounts.set(roomId, 0);
    } catch (err) {
        logger.error({ roomId, error: String(err) }, 'Failed to load doc from store');
        // Create empty doc anyway so clients can still connect
        docManager.getOrCreate(roomId);
    }
}

// ─── Socket.IO Event Handlers ─────────────────────────────────

io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Client connected');

    // ── Join Room ──
    socket.on('join_room', async (roomId: unknown) => {
        if (typeof roomId !== 'string' || roomId.length === 0 || roomId.length > 128) {
            socket.emit('error_msg', { code: 'INVALID_ROOM', message: 'Invalid room ID' });
            return;
        }

        // Permission check: can this user access this room?
        const user = (socket.data as any).user as TokenPayload;
        if (authEnabled && !canRead(user, roomId)) {
            socket.emit('error_msg', { code: 'FORBIDDEN', message: 'No access to this room' });
            return;
        }

        socket.join(roomId);
        await ensureDocLoaded(roomId);
        logger.debug({ socketId: socket.id, roomId, userId: user.sub }, 'Joined room');
    });

    // ── Yjs Sync Step 1: Client sends state vector ──
    socket.on('yjs_sync_step1', async (roomId: unknown, clientSV: unknown) => {
        if (typeof roomId !== 'string') return;
        if (!Array.isArray(clientSV)) return;

        await ensureDocLoaded(roomId);

        // Encode diff: what the client is missing
        const diff = docManager.encodeDiff(roomId, new Uint8Array(clientSV));
        socket.emit('yjs_sync_step2', roomId, Array.from(diff));
        logger.debug({ socketId: socket.id, roomId, diffSize: diff.length }, 'Sync step 2 sent');
    });

    // ── Yjs Update: Client sends incremental update ──
    socket.on('yjs_update', async (roomId: unknown, update: unknown) => {
        if (typeof roomId !== 'string') return;
        if (!Array.isArray(update)) return;

        // Permission check: only writers can send updates
        const user = (socket.data as any).user as TokenPayload;
        if (authEnabled && !canWrite(user, roomId)) {
            socket.emit('error_msg', { code: 'FORBIDDEN', message: 'Read-only access' });
            return;
        }

        // Rate limit
        if (!rateLimiter.consume(socket.id)) {
            socket.emit('error_msg', { code: 'RATE_LIMITED', message: 'Too many updates per second' });
            return;
        }

        const binary = new Uint8Array(update);

        // Apply to server Y.Doc
        docManager.applyUpdate(roomId, binary);

        // Persist to op log (base64 for storage)
        try {
            await store.appendOps(roomId, [{ opData: Buffer.from(binary).toString('base64') }]);
            const count = (roomOpCounts.get(roomId) ?? 0) + 1;
            roomOpCounts.set(roomId, count);
        } catch (err) {
            logger.error({ roomId, error: String(err) }, 'Failed to persist Yjs update');
        }

        // Trigger snapshot check
        snapshotManager.onOpApplied(roomId).catch(err => {
            logger.error({ roomId, error: String(err) }, 'Snapshot trigger failed');
        });

        // Broadcast to other clients in the room
        socket.to(roomId).emit('yjs_update', roomId, Array.from(binary));
        logger.debug({ socketId: socket.id, roomId, updateSize: binary.length }, 'Yjs update applied & broadcast');
    });

    // ── Awareness Update ──
    socket.on('awareness_update', (roomId: unknown, data: unknown) => {
        if (typeof roomId !== 'string') return;
        // Broadcast to everyone else in room
        socket.to(roomId).emit('awareness_update', roomId, data);
    });

    // ── Disconnect ──
    socket.on('disconnect', () => {
        rateLimiter.remove(socket.id);
        // Broadcast awareness removal to all rooms this socket was in
        for (const room of socket.rooms) {
            if (room !== socket.id) {
                socket.to(room).emit('awareness_remove', room, socket.id);
            }
        }
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

    // 2. Initialize snapshot manager (adapted for Yjs binary)
    snapshotManager = new SnapshotManager(
        store,
        {
            snapshotEveryNOps: config.store.snapshotEveryNOps,
            snapshotAfterSeconds: config.store.snapshotAfterSeconds,
        },
        logger,
        (docId: string) => {
            if (!docManager.has(docId)) return null;
            // Encode full Yjs state as base64
            const snapshot = docManager.encodeSnapshot(docId);
            return {
                data: Buffer.from(snapshot).toString('base64'),
                metadata: '{}', // No separate metadata in Yjs mode
            };
        }
    );
    snapshotManager.start();
    logger.info('Snapshot manager started');

    // 3. Setup Redis adapter (if configured)
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
            logger.info({ redisUrl: config.redis.url }, 'Redis adapter connected');
        } catch (err) {
            logger.warn({ error: String(err) }, 'Redis adapter failed — single-instance mode');
        }
    }

    // 4. Start HTTP server
    httpServer.listen(config.port, '0.0.0.0', () => {
        logger.info({
            port: config.port,
            cors: config.corsOrigin,
            store: config.store.backend,
        }, 'CollabDoc server started (Yjs CRDT)');
    });
}

// ─── Graceful Shutdown ────────────────────────────────────────

async function shutdown(signal: string) {
    logger.info({ signal }, 'Received shutdown signal — draining');

    snapshotManager.stop();

    try {
        await snapshotManager.flushAll();
        logger.info('All dirty snapshots flushed');
    } catch (err) {
        logger.error({ error: String(err) }, 'Failed to flush snapshots');
    }

    docManager.destroyAll();

    io.close(() => {
        store.close().then(() => {
            logger.info('Shutdown complete');
            httpServer.close(() => process.exit(0));
        }).catch(err => {
            logger.error({ error: String(err) }, 'Error closing store');
            process.exit(1);
        });
    });

    setTimeout(() => {
        logger.warn('Graceful shutdown timed out — forcing exit');
        process.exit(1);
    }, 15_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startup().catch(err => {
    logger.fatal({ error: String(err) }, 'Failed to start server');
    process.exit(1);
});