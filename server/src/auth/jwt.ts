/**
 * JWT Auth — minimal token-based authentication for the collab server.
 *
 * Token payload:
 *   { sub: userId, room: roomId, perm: 'read' | 'write', exp: timestamp }
 *
 * Flow:
 *   1. Client requests token from /api/auth/token (or your app's backend)
 *   2. Client passes token in socket.io auth: { token: '...' }
 *   3. Server verifies on connection, attaches user info to socket
 *   4. Room-level permission checks on yjs_update events
 *
 * YAGNI: No refresh tokens, no roles beyond read/write, no multi-tenant.
 * In production, your backend issues tokens — this module just verifies them.
 */

import jwt from 'jsonwebtoken';

export type Permission = 'read' | 'write';

export interface TokenPayload {
  /** User ID */
  sub: string;
  /** Room ID the token is scoped to (or '*' for all rooms) */
  room: string;
  /** Permission level */
  perm: Permission;
}

// ─── Config ───────────────────────────────────────────────────

const JWT_SECRET: jwt.Secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const TOKEN_EXPIRY_SECONDS = parseInt(process.env.JWT_EXPIRY_SECONDS || '86400', 10); // 24h

// ─── Sign ─────────────────────────────────────────────────────

/** Issue a signed JWT token for a user + room + permission */
export function signToken(payload: TokenPayload): string {
  return jwt.sign(
    { sub: payload.sub, room: payload.room, perm: payload.perm },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY_SECONDS }
  );
}

// ─── Verify ───────────────────────────────────────────────────

/** Verify a JWT token and return the payload, or null if invalid */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    if (!decoded.sub || !decoded.room || !decoded.perm) return null;
    return {
      sub: decoded.sub as string,
      room: decoded.room as string,
      perm: decoded.perm as Permission,
    };
  } catch {
    return null;
  }
}

// ─── Permission Check ─────────────────────────────────────────

/** Check if a token grants write access to a specific room */
export function canWrite(payload: TokenPayload, roomId: string): boolean {
  if (payload.perm !== 'write') return false;
  return payload.room === '*' || payload.room === roomId;
}

/** Check if a token grants at least read access to a specific room */
export function canRead(payload: TokenPayload, roomId: string): boolean {
  return payload.room === '*' || payload.room === roomId;
}
