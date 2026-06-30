/**
 * In-memory DocumentStore implementation.
 *
 * Used for development and testing — no external dependencies required.
 * Data is lost on process restart (by design).
 */

import type { DocumentStore, StoredSnapshot, StoredOp } from './types';

export class MemoryStore implements DocumentStore {
  private snapshots: Map<string, StoredSnapshot> = new Map();
  private ops: Map<string, StoredOp[]> = new Map();
  private seqCounters: Map<string, number> = new Map();

  async initialize(): Promise<void> {
    // No-op for memory store
  }

  async getSnapshot(docId: string): Promise<StoredSnapshot | null> {
    return this.snapshots.get(docId) ?? null;
  }

  async saveSnapshot(docId: string, data: string, metadata: string, version: number): Promise<void> {
    this.snapshots.set(docId, {
      docId,
      data,
      metadata,
      version,
      createdAt: new Date(),
    });
  }

  async appendOps(docId: string, ops: Array<{ opData: string }>): Promise<number[]> {
    if (!this.ops.has(docId)) {
      this.ops.set(docId, []);
    }
    const docOps = this.ops.get(docId)!;
    const currentSeq = this.seqCounters.get(docId) ?? 0;
    const seqs: number[] = [];

    for (let i = 0; i < ops.length; i++) {
      const seq = currentSeq + i + 1;
      seqs.push(seq);
      docOps.push({
        docId,
        seq,
        opData: ops[i].opData,
        createdAt: new Date(),
      });
    }

    this.seqCounters.set(docId, currentSeq + ops.length);
    return seqs;
  }

  async getOpsSince(docId: string, afterSeq: number): Promise<StoredOp[]> {
    const docOps = this.ops.get(docId) ?? [];
    return docOps.filter(op => op.seq > afterSeq);
  }

  async getLatestSeq(docId: string): Promise<number> {
    return this.seqCounters.get(docId) ?? 0;
  }

  async trimOpsBefore(docId: string, beforeSeq: number): Promise<number> {
    const docOps = this.ops.get(docId);
    if (!docOps) return 0;
    const before = docOps.length;
    const remaining = docOps.filter(op => op.seq > beforeSeq);
    this.ops.set(docId, remaining);
    return before - remaining.length;
  }

  async listDocuments(): Promise<string[]> {
    const docIds = new Set<string>();
    for (const id of this.snapshots.keys()) docIds.add(id);
    for (const id of this.ops.keys()) docIds.add(id);
    return Array.from(docIds);
  }

  async deleteDocument(docId: string): Promise<void> {
    this.snapshots.delete(docId);
    this.ops.delete(docId);
    this.seqCounters.delete(docId);
  }

  async close(): Promise<void> {
    this.snapshots.clear();
    this.ops.clear();
    this.seqCounters.clear();
  }
}
