/**
 * Store factory — creates the right DocumentStore based on config.
 */

import type { DocumentStore } from './types';
import type { ServerConfig } from '../config';
import { MemoryStore } from './memory';
import { PostgresStore } from './postgres';

export { DocumentStore, StoredSnapshot, StoredOp } from './types';
export { MemoryStore } from './memory';
export { PostgresStore } from './postgres';
export { SnapshotManager } from './snapshot-manager';

export function createStore(config: ServerConfig): DocumentStore {
  switch (config.store.backend) {
    case 'postgres':
      return new PostgresStore(
        config.postgres.connectionString,
        config.postgres.poolSize
      );
    case 'memory':
    default:
      return new MemoryStore();
  }
}
