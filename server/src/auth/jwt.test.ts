import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { verifyToken, signToken, setJWKS } from './jwt';

describe('verifyToken — ES256 (Supabase user tokens)', () => {
  let privateKey: CryptoKey;

  before(async () => {
    const pair = await generateKeyPair('ES256');
    privateKey = pair.privateKey;

    const publicJwk = await exportJWK(pair.publicKey);
    const localJWKS = createLocalJWKSet({ keys: [{ ...publicJwk, alg: 'ES256', use: 'sig' }] });
    setJWKS(localJWKS);
  });

  it('verifies a Supabase ES256 user token and returns write access', async () => {
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject('user-abc-123')
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(privateKey);

    const payload = await verifyToken(token);

    assert.equal(payload.sub, 'user-abc-123');
    assert.equal(payload.perm, 'write');
    assert.equal(payload.room, '*');
  });

  it('rejects an ES256 token signed with a different key', async () => {
    const wrongKey = (await generateKeyPair('ES256')).privateKey;
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject('user-abc-123')
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(wrongKey);

    await assert.rejects(() => verifyToken(token));
  });

  it('rejects an expired ES256 token', async () => {
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject('user-abc-123')
      .setAudience('authenticated')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);

    await assert.rejects(() => verifyToken(token));
  });
});

describe('verifyToken — HS256 (custom app tokens)', () => {
  it('verifies a custom HS256 token with room and perm fields', async () => {
    const token = signToken({ sub: 'user-1', room: 'room-xyz', perm: 'write' });
    const payload = await verifyToken(token);

    assert.equal(payload.sub, 'user-1');
    assert.equal(payload.room, 'room-xyz');
    assert.equal(payload.perm, 'write');
  });
});
