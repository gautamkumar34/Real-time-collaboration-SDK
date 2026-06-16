/**
 * DocumentStore — persistence abstraction for document state.
 *
 * Two implementations:
 *   1. MemoryStore — in-memory Maps (dev/test)
 *   2. PostgresStore — durable (production)
 *
 * The store manages two things:
 *   - Snapshots: full document state at a point in time
 *   - Operations: individual ops since last snapshot (for replay)
 *
 * Recovery flow: load latest snapshot → replay ops since snapshot → done
 */

export interface StoredSnapshot {
  docId: string;
  /** Full document JSON stringified. Phase 3 changes this to Yjs binary. */
  data: string;
  /** Full metadata JSON stringified. */
  metadata: string;
  /** Monotonically increasing version — number of ops incorporated */
  version: number;
  createdAt: Date;
}

export interface StoredOp {
  docId: string;
  /** Auto-incrementing sequence per document */
  seq: number;
  /** JSON-serialized operation payload */
  opData: string;
  createdAt: Date;
}

export interface DocumentStore {
  /** Initialize store (create tables, connections, etc.) */
  initialize(): Promise<void>;

  /** Get the latest snapshot for a document. Returns null if never snapshotted. */
  getSnapshot(docId: string): Promise<StoredSnapshot | null>;

  /** Save a new snapshot, replacing the previous one for this document. */
  saveSnapshot(docId: string, data: string, metadata: string, version: number): Promise<void>;

  /** Append operations to the op log. Returns assigned sequence numbers. */
  appendOps(docId: string, ops: Array<{ opData: string }>): Promise<number[]>;

  /** Get all ops after the given sequence number (for replay after snapshot). */
  getOpsSince(docId: string, afterSeq: number): Promise<StoredOp[]>;

  /** Get the latest sequence number for a document (0 if no ops). */
  getLatestSeq(docId: string): Promise<number>;

  /** Delete all ops with seq <= the given value (after snapshot). */
  trimOpsBefore(docId: string, beforeSeq: number): Promise<number>;

  /** List all document IDs that have stored state. */
  listDocuments(): Promise<string[]>;

  /** Graceful shutdown — close connections. */
  close(): Promise<void>;
}
