/**
 * PostgreSQL DocumentStore implementation.
 *
 * Tables:
 *   - documents: snapshots (one row per document, upserted)
 *   - operations: append-only op log (indexed by doc_id + seq)
 *
 * This store is designed for Phase 2's LWW-based server.
 * Phase 3 will change snapshot data from JSON to Yjs binary.
 */

import { Pool, type PoolConfig } from 'pg';
import type { DocumentStore, StoredSnapshot, StoredOp } from './types';

export class PostgresStore implements DocumentStore {
  private pool: Pool;

  constructor(connectionString: string, poolSize: number = 10) {
    this.pool = new Pool({
      connectionString,
      max: poolSize,
      // Connection timeout: 5s
      connectionTimeoutMillis: 5000,
      // Idle timeout: 30s
      idleTimeoutMillis: 30000,
    });
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Create tables if they don't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS documents (
          doc_id TEXT PRIMARY KEY,
          snapshot_data TEXT NOT NULL DEFAULT '{}',
          snapshot_metadata TEXT NOT NULL DEFAULT '{}',
          snapshot_version INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS operations (
          id BIGSERIAL PRIMARY KEY,
          doc_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          op_data TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (doc_id, seq)
        );
      `);

      // Index for fast tail reads: get ops after a certain seq for a doc
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_operations_doc_seq
        ON operations (doc_id, seq);
      `);
    } finally {
      client.release();
    }
  }

  async getSnapshot(docId: string): Promise<StoredSnapshot | null> {
    const result = await this.pool.query(
      'SELECT doc_id, snapshot_data, snapshot_metadata, snapshot_version, updated_at FROM documents WHERE doc_id = $1',
      [docId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      docId: row.doc_id,
      data: row.snapshot_data,
      metadata: row.snapshot_metadata,
      version: row.snapshot_version,
      createdAt: row.updated_at,
    };
  }

  async saveSnapshot(docId: string, data: string, metadata: string, version: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO documents (doc_id, snapshot_data, snapshot_metadata, snapshot_version, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (doc_id) DO UPDATE SET
         snapshot_data = EXCLUDED.snapshot_data,
         snapshot_metadata = EXCLUDED.snapshot_metadata,
         snapshot_version = EXCLUDED.snapshot_version,
         updated_at = NOW()`,
      [docId, data, metadata, version]
    );
  }

  async appendOps(docId: string, ops: Array<{ opData: string }>): Promise<number[]> {
    if (ops.length === 0) return [];

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get current max seq for this document
      const seqResult = await client.query(
        'SELECT COALESCE(MAX(seq), 0) as max_seq FROM operations WHERE doc_id = $1',
        [docId]
      );
      let currentSeq: number = seqResult.rows[0].max_seq;

      const seqs: number[] = [];
      for (const op of ops) {
        currentSeq += 1;
        seqs.push(currentSeq);
        await client.query(
          'INSERT INTO operations (doc_id, seq, op_data) VALUES ($1, $2, $3)',
          [docId, currentSeq, op.opData]
        );
      }

      await client.query('COMMIT');
      return seqs;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getOpsSince(docId: string, afterSeq: number): Promise<StoredOp[]> {
    const result = await this.pool.query(
      'SELECT doc_id, seq, op_data, created_at FROM operations WHERE doc_id = $1 AND seq > $2 ORDER BY seq ASC',
      [docId, afterSeq]
    );

    return result.rows.map(row => ({
      docId: row.doc_id,
      seq: row.seq,
      opData: row.op_data,
      createdAt: row.created_at,
    }));
  }

  async getLatestSeq(docId: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT COALESCE(MAX(seq), 0) as max_seq FROM operations WHERE doc_id = $1',
      [docId]
    );
    return result.rows[0].max_seq;
  }

  async trimOpsBefore(docId: string, beforeSeq: number): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM operations WHERE doc_id = $1 AND seq <= $2',
      [docId, beforeSeq]
    );
    return result.rowCount ?? 0;
  }

  async listDocuments(): Promise<string[]> {
    const res = await this.pool.query('SELECT DISTINCT doc_id FROM documents');
    return res.rows.map(row => row.doc_id);
  }

  async deleteDocument(docId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM operations WHERE doc_id = $1', [docId]);
      await client.query('DELETE FROM documents WHERE doc_id = $1', [docId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
