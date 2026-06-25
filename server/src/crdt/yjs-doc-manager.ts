/**
 * YjsDocManager — manages one Y.Doc per active room on the server.
 *
 * Responsibilities:
 *   - Create/load Y.Doc for a room
 *   - Apply binary updates from clients
 *   - Encode state for sync
 *   - Encode/decode snapshots for persistence
 *
 * This is intentionally simple (YAGNI). No eviction, no sharding.
 * Y.Doc is lightweight — a server can hold thousands in memory.
 */

import * as Y from 'yjs';

export class YjsDocManager {
  private docs: Map<string, Y.Doc> = new Map();

  /** Get or create a Y.Doc for a room */
  getOrCreate(docId: string): Y.Doc {
    let doc = this.docs.get(docId);
    if (!doc) {
      doc = new Y.Doc();
      this.docs.set(docId, doc);
    }
    return doc;
  }

  /** Check if a doc exists in memory */
  has(docId: string): boolean {
    return this.docs.has(docId);
  }

  /** Apply a binary update to a document */
  applyUpdate(docId: string, update: Uint8Array): void {
    const doc = this.getOrCreate(docId);
    Y.applyUpdate(doc, update);
  }

  /** Get the state vector for a document (used in sync step 1) */
  getStateVector(docId: string): Uint8Array {
    const doc = this.getOrCreate(docId);
    return Y.encodeStateVector(doc);
  }

  /** Encode the diff between a client's state vector and our state */
  encodeDiff(docId: string, clientStateVector: Uint8Array): Uint8Array {
    const doc = this.getOrCreate(docId);
    return Y.encodeStateAsUpdate(doc, clientStateVector);
  }

  /** Encode the full state as a binary snapshot (for persistence) */
  encodeSnapshot(docId: string): Uint8Array {
    const doc = this.getOrCreate(docId);
    return Y.encodeStateAsUpdate(doc);
  }

  /** Load a document from a persisted binary snapshot */
  loadFromSnapshot(docId: string, snapshot: Uint8Array): void {
    const doc = this.getOrCreate(docId);
    Y.applyUpdate(doc, snapshot);
  }

  /** Remove a document from memory (when all clients leave) */
  remove(docId: string): void {
    const doc = this.docs.get(docId);
    if (doc) {
      doc.destroy();
      this.docs.delete(docId);
    }
  }

  /** Get count of docs in memory */
  get size(): number {
    return this.docs.size;
  }

  /** Destroy all docs */
  destroyAll(): void {
    for (const [, doc] of this.docs) {
      doc.destroy();
    }
    this.docs.clear();
  }
}
