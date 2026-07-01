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
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type GetKeyFunction, type JWSHeaderParameters, type FlattenedJWSInput } from 'jose';

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

const JWT_SECRET: jwt.Secret = process.env.SUPABASE_SECRET_KEY || process.env.JWT_SECRET || 'dev-secret-change-in-production';
const TOKEN_EXPIRY_SECONDS = parseInt(process.env.JWT_EXPIRY_SECONDS || '86400', 10); // 24h

// ─── JWKS (for ES256 Supabase tokens) ─────────────────────────

type JWKSVerifier = GetKeyFunction<JWSHeaderParameters, FlattenedJWSInput>;

// Module-level JWKS verifier — initialized from SUPABASE_URL, replaceable in tests via setJWKS()
let _jwks: JWKSVerifier | null = null;

const SUPABASE_URL = process.env.SUPABASE_URL;
if (SUPABASE_URL) {
  _jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
}

/** Override the JWKS verifier — for testing with a local key set. */
export function setJWKS(jwks: JWKSVerifier): void {
  _jwks = jwks;
}

// ─── Sign ─────────────────────────────────────────────────────

/** Issue a signed HS256 JWT token for a user + room + permission */
export function signToken(payload: TokenPayload): string {
  return jwt.sign(
    { sub: payload.sub, room: payload.room, perm: payload.perm },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY_SECONDS }
  );
}

// ─── Verify ───────────────────────────────────────────────────

/**
 * Verify a JWT token and return the payload.
 *
 * Handles two token types:
 *  - ES256 (Supabase user session tokens) — verified via JWKS
 *  - HS256 (custom app-issued tokens)    — verified via JWT_SECRET
 */
export async function verifyToken(token: string): Promise<TokenPayload> {
  const header = jwt.decode(token, { complete: true })?.header;

  if (header?.alg === 'ES256') {
    return verifyES256Token(token);
  }

  return verifyHS256Token(token);
}

async function verifyES256Token(token: string): Promise<TokenPayload> {
  if (!_jwks) {
    throw new Error('ES256 token received but SUPABASE_URL is not configured');
  }

  let payload: JWTPayload & { role?: string };
  try {
    const result = await jwtVerify(token, _jwks);
    payload = result.payload as JWTPayload & { role?: string };
  } catch (err) {
    throw new Error(`[ES256] ${(err as Error).message}`);
  }

  if (payload.aud === 'authenticated' && payload.role === 'authenticated') {
    return {
      sub: payload.sub as string,
      room: '*',
      perm: 'write',
    };
  }

  throw new Error('[ES256] Unrecognized token audience');
}

function verifyHS256Token(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;

    if (!decoded.sub || !decoded.room || !decoded.perm) {
      throw new Error('Invalid payload structure: missing sub, room, or perm');
    }

    return {
      sub: decoded.sub as string,
      room: decoded.room as string,
      perm: decoded.perm as Permission,
    };
  } catch (err) {
    throw new Error(`[HS256] ${(err as Error).message}`);
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
