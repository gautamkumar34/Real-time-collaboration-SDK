import { Server } from 'socket.io';
import http from 'http';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

const roomStates: Map<string, any> = new Map();
const roomMetadata: Map<string, { [path: string]: { timestamp: number; actorId: string; version: number } }> = new Map();

const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('CollabDoc Socket.IO Server\n');
});

const io = new Server(httpServer, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('join_room', (roomId: string) => {
        socket.join(roomId);
        console.log(`${socket.id} joined room: ${roomId}`);

        if (!roomStates.has(roomId)) {
            roomStates.set(roomId, {}); 
        }
        if (!roomMetadata.has(roomId)) {
            roomMetadata.set(roomId, {}); 
        }

        const currentDocState = roomStates.get(roomId);
        const currentMetadata = roomMetadata.get(roomId);

        socket.emit('initial_state', currentDocState, currentMetadata);  
        console.log(`Sent initial state for room ${roomId} to ${socket.id}. Doc:`, currentDocState, 'Metadata:', currentMetadata);
    });

    socket.on('operation', (roomId: string, operation: any) => {
        console.log(`Received operation in room ${roomId} from ${socket.id}:`, operation);

        const currentRoomState = roomStates.get(roomId) || {};
        const currentRoomMetadata = roomMetadata.get(roomId) || {}; 
        const path = operation.path;
        const opType = operation.op;
        const value = operation.value;

        let applyServerOp = true;
        const pathKey = JSON.stringify(path);
        const existingMetadata = currentRoomMetadata[pathKey];

        if (existingMetadata) {
            const incomingWinsByTimestamp = operation.timestamp > existingMetadata.timestamp;
            const timestampsAreEqual = operation.timestamp === existingMetadata.timestamp;
            const incomingWinsByActorId = timestampsAreEqual && operation.actorId < existingMetadata.actorId; // Tie-breaker

            if (!incomingWinsByTimestamp && !incomingWinsByActorId) {
                applyServerOp = false;
                console.log(`Server: Operation not applied due to LWW conflict (existing value wins).`);
            }
        }

        if (applyServerOp) {
            if (opType === 'set') {
                deepSet(currentRoomState, path, value);
            } else if (opType === 'del') {
                deepDelete(currentRoomState, path);
            }
            roomStates.set(roomId, currentRoomState); 


            if (opType === 'del') {
                delete currentRoomMetadata[pathKey];
            } else {
                currentRoomMetadata[pathKey] = {
                    timestamp: operation.timestamp,
                    actorId: operation.actorId,
                    version: operation.version
                };
            }
            roomMetadata.set(roomId, currentRoomMetadata); 
        } 
        io.to(roomId).emit('operation', roomId, operation);
        console.log(`Broadcasted operation to room ${roomId}. Current Server State:`, currentRoomState, 'Current Server Metadata:', currentRoomMetadata);
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });

    socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}: ${error}`);
    });
});

httpServer.listen(PORT, () => {
    console.log(`CollabDoc Socket.IO server listening on http://localhost:${PORT}`);
});

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