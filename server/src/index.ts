import { Server } from 'socket.io';
import http from 'http';
import pino from 'pino';
import { validateRoomId, validateOperation, type ValidatedOperation } from './validation';
import { RateLimiter } from './rate-limiter';

// ─── Configuration ────────────────────────────────────────────
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/** Comma-separated browser origins. Fails in production if not set. */
function getCorsOrigin(): string | string[] {
    const raw = process.env.CORS_ORIGIN?.trim();

    if (IS_PRODUCTION && (!raw || raw === '*')) {
        logger.error('CORS_ORIGIN must be set to specific origins in production (not "*"). Exiting.');
        process.exit(1);
    }

    if (!raw || raw === '*') {
        return '*';
    }
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// ─── Logger ───────────────────────────────────────────────────
const logger = pino({
    level: LOG_LEVEL,
    transport: IS_PRODUCTION
        ? undefined
        : { target: 'pino/file', options: { destination: 1 } }, // stdout with formatting in dev
});

// ─── Rate Limiter ─────────────────────────────────────────────
const rateLimiter = new RateLimiter({
    maxBurst: 100,
    refillRate: 50,
});

// ─── State (in-memory — replaced by persistence in Phase 2) ──
const roomStates: Map<string, any> = new Map();
const roomMetadata: Map<string, { [path: string]: { timestamp: number; actorId: string; version: number } }> = new Map();

// ─── HTTP Server ──────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
    const path = req.url?.split('?')[0] ?? '/';

    if (path === '/health' || path === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'collab-server',
            rooms: roomStates.size,
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
        origin: getCorsOrigin(),
        methods: ['GET', 'POST'],
    },
    // Limit max payload at the transport level (Socket.IO config)
    maxHttpBufferSize: 128 * 1024, // 128KB — generous to account for encoding overhead
});

io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Client connected');

    socket.on('join_room', (roomId: unknown) => {
        // ── Validate roomId ──
        const validation = validateRoomId(roomId);
        if (!validation.ok) {
            logger.warn({ socketId: socket.id, roomId, error: validation.error }, 'Invalid roomId rejected');
            socket.emit('error_msg', { code: 'INVALID_ROOM', message: validation.error });
            return;
        }
        const validRoomId = validation.data;

        socket.join(validRoomId);
        logger.debug({ socketId: socket.id, roomId: validRoomId }, 'Joined room');

        if (!roomStates.has(validRoomId)) {
            roomStates.set(validRoomId, {});
        }
        if (!roomMetadata.has(validRoomId)) {
            roomMetadata.set(validRoomId, {});
        }

        const currentDocState = roomStates.get(validRoomId);
        const currentMetadata = roomMetadata.get(validRoomId);

        socket.emit('initial_state', currentDocState, currentMetadata);
        logger.debug({ socketId: socket.id, roomId: validRoomId }, 'Sent initial state');
    });

    socket.on('operation', (roomId: unknown, operation: unknown) => {
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
            logger.warn({ socketId: socket.id, roomId: validRoomId }, 'Rate limited — too many ops/sec');
            socket.emit('error_msg', { code: 'RATE_LIMITED', message: 'Too many operations per second' });
            // Disconnect on sustained abuse (3 consecutive rate-limit hits could trigger this)
            // For now, just reject the op. Phase 4 adds per-tenant quotas.
            return;
        }

        // ── Validate operation payload ──
        const opValidation = validateOperation(operation);
        if (!opValidation.ok) {
            logger.warn({ socketId: socket.id, roomId: validRoomId, error: opValidation.error }, 'Invalid operation rejected');
            socket.emit('error_msg', { code: 'INVALID_OP', message: opValidation.error });
            return;
        }
        const validOp = opValidation.data;

        // ── Apply LWW ──
        const currentRoomState = roomStates.get(validRoomId) || {};
        const currentRoomMetadata = roomMetadata.get(validRoomId) || {};
        const pathKey = JSON.stringify(validOp.path);
        const existingMetadata = currentRoomMetadata[pathKey];

        let applyServerOp = true;

        if (existingMetadata) {
            const incomingWinsByTimestamp = validOp.timestamp > existingMetadata.timestamp;
            const timestampsAreEqual = validOp.timestamp === existingMetadata.timestamp;
            const incomingWinsByActorId = timestampsAreEqual && validOp.actorId < existingMetadata.actorId;

            if (!incomingWinsByTimestamp && !incomingWinsByActorId) {
                applyServerOp = false;
            }
        }

        if (applyServerOp) {
            // ── Mutate state ──
            if (validOp.op === 'set') {
                deepSet(currentRoomState, validOp.path, validOp.value);
            } else if (validOp.op === 'del') {
                deepDelete(currentRoomState, validOp.path);
            }
            roomStates.set(validRoomId, currentRoomState);

            // ── Update metadata ──
            if (validOp.op === 'del') {
                delete currentRoomMetadata[pathKey];
            } else {
                currentRoomMetadata[pathKey] = {
                    timestamp: validOp.timestamp,
                    actorId: validOp.actorId,
                    version: validOp.version,
                };
            }
            roomMetadata.set(validRoomId, currentRoomMetadata);

            // ── Broadcast ONLY accepted ops (FIX: was outside if-block) ──
            io.to(validRoomId).emit('operation', validRoomId, validOp);
            logger.debug({ roomId: validRoomId, opId: validOp.id, op: validOp.op }, 'Op applied and broadcast');
        } else {
            // ── Rejected by LWW — notify sender only ──
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

// ─── Graceful shutdown ────────────────────────────────────────
function shutdown(signal: string) {
    logger.info({ signal }, 'Received shutdown signal — draining connections');
    io.close(() => {
        logger.info('All connections closed');
        httpServer.close(() => {
            logger.info('HTTP server closed — exiting');
            process.exit(0);
        });
    });
    // Force exit after 10s if graceful drain hangs
    setTimeout(() => {
        logger.warn('Graceful shutdown timed out — forcing exit');
        process.exit(1);
    }, 10_000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Start ────────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT, cors: getCorsOrigin(), logLevel: LOG_LEVEL }, 'CollabDoc server started');
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