/**
 * SnapshotManager — automatic snapshotting and op log compaction.
 *
 * Triggers a snapshot when either condition is met:
 *   1. opsSinceSnapshot >= snapshotEveryNOps (default: 100)
 *   2. Time since last snapshot > snapshotAfterSeconds (default: 30)
 *
 * After snapshotting, trims the op log up to the snapshot version
 * to prevent unbounded growth.
 */

import type { DocumentStore } from './types';
import type { Logger } from 'pino';

export interface SnapshotManagerConfig {
  /** Snapshot after this many ops since last snapshot */
  snapshotEveryNOps: number;
  /** Snapshot if no snapshot in this many seconds (checked periodically) */
  snapshotAfterSeconds: number;
}

interface DocSnapshotState {
  opsSinceSnapshot: number;
  lastSnapshotTime: number; // ms timestamp
  snapshotVersion: number;
  isSnapshotting: boolean;
}

export class SnapshotManager {
  private store: DocumentStore;
  private config: SnapshotManagerConfig;
  private logger: Logger;
  private docStates: Map<string, DocSnapshotState> = new Map();
  private periodicTimer: ReturnType<typeof setInterval> | null = null;

  /** Callback to get current document state for snapshotting */
  private getDocState: (docId: string) => { data: any; metadata: any } | null;

  constructor(
    store: DocumentStore,
    config: SnapshotManagerConfig,
    logger: Logger,
    getDocState: (docId: string) => { data: any; metadata: any } | null
  ) {
    this.store = store;
    this.config = config;
    this.logger = logger;
    this.getDocState = getDocState;
  }

  /**
   * Start periodic snapshot checks.
   * Runs every `snapshotAfterSeconds / 2` to ensure timely snapshots.
   */
  start(): void {
    const intervalMs = Math.max(5000, (this.config.snapshotAfterSeconds * 1000) / 2);
    this.periodicTimer = setInterval(() => {
      this.checkTimeBasedSnapshots().catch(err => {
        this.logger.error({ error: String(err) }, 'Periodic snapshot check failed');
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  /**
   * Called after each op is applied. Increments counter and
   * triggers snapshot if threshold reached.
   */
  async onOpApplied(docId: string): Promise<void> {
    let state = this.docStates.get(docId);
    if (!state) {
      state = {
        opsSinceSnapshot: 0,
        lastSnapshotTime: Date.now(),
        snapshotVersion: 0,
        isSnapshotting: false,
      };
      this.docStates.set(docId, state);
    }

    state.opsSinceSnapshot += 1;

    if (state.opsSinceSnapshot >= this.config.snapshotEveryNOps && !state.isSnapshotting) {
      await this.takeSnapshot(docId, state);
    }
  }

  /**
   * Initialize state for a document loaded from store.
   */
  initDoc(docId: string, snapshotVersion: number): void {
    this.docStates.set(docId, {
      opsSinceSnapshot: 0,
      lastSnapshotTime: Date.now(),
      snapshotVersion,
      isSnapshotting: false,
    });
  }

  /**
   * Force a snapshot for a specific document (e.g., on graceful shutdown).
   */
  async forceSnapshot(docId: string): Promise<void> {
    const state = this.docStates.get(docId);
    if (!state || state.opsSinceSnapshot === 0) return;
    await this.takeSnapshot(docId, state);
  }

  /**
   * Force snapshots for all dirty documents (e.g., on shutdown).
   */
  async flushAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [docId, state] of this.docStates) {
      if (state.opsSinceSnapshot > 0 && !state.isSnapshotting) {
        promises.push(this.takeSnapshot(docId, state));
      }
    }
    await Promise.allSettled(promises);
  }

  // ─── Internal ─────────────────────────────────

  private async checkTimeBasedSnapshots(): Promise<void> {
    const now = Date.now();
    const thresholdMs = this.config.snapshotAfterSeconds * 1000;

    for (const [docId, state] of this.docStates) {
      if (
        state.opsSinceSnapshot > 0 &&
        !state.isSnapshotting &&
        (now - state.lastSnapshotTime) > thresholdMs
      ) {
        await this.takeSnapshot(docId, state);
      }
    }
  }

  private async takeSnapshot(docId: string, state: DocSnapshotState): Promise<void> {
    if (state.isSnapshotting) return;
    state.isSnapshotting = true;

    try {
      const docState = this.getDocState(docId);
      if (!docState) {
        this.logger.warn({ docId }, 'Cannot snapshot — document not in memory');
        return;
      }

      const currentSeq = await this.store.getLatestSeq(docId);
      const data = JSON.stringify(docState.data);
      const metadata = JSON.stringify(docState.metadata);

      await this.store.saveSnapshot(docId, data, metadata, currentSeq);

      // Trim ops that are now incorporated into the snapshot
      const trimmed = await this.store.trimOpsBefore(docId, currentSeq);

      state.opsSinceSnapshot = 0;
      state.lastSnapshotTime = Date.now();
      state.snapshotVersion = currentSeq;

      this.logger.info(
        { docId, snapshotVersion: currentSeq, trimmedOps: trimmed },
        'Snapshot saved and ops trimmed'
      );
    } catch (err) {
      this.logger.error({ docId, error: String(err) }, 'Snapshot failed');
    } finally {
      state.isSnapshotting = false;
    }
  }
}
