/**
 * Centralized configuration — single source of truth for all env vars.
 *
 * Validates at startup: missing required vars in production cause
 * immediate process.exit(1) with a clear error message.
 */

export interface ServerConfig {
  // ─── Core ────────────────────────────────────
  port: number;
  nodeEnv: 'production' | 'development' | 'test';
  logLevel: string;
  corsOrigin: string | string[];

  // ─── PostgreSQL ──────────────────────────────
  postgres: {
    connectionString: string;
    poolSize: number;
  };

  // ─── Redis ───────────────────────────────────
  redis: {
    url: string;
  };

  // ─── Store ───────────────────────────────────
  store: {
    /** 'postgres' | 'memory' — memory is for dev/test only */
    backend: 'postgres' | 'memory';
    /** Snapshot after this many ops */
    snapshotEveryNOps: number;
    /** Snapshot after this many seconds of inactivity */
    snapshotAfterSeconds: number;
  };
}

function getEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  return '';
}

function requireEnv(key: string, nodeEnv: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    if (nodeEnv === 'production') {
      console.error(`FATAL: Required env var ${key} is not set in production. Exiting.`);
      process.exit(1);
    }
    return '';
  }
  return value.trim();
}

function parseCorsOrigin(raw: string, nodeEnv: string): string | string[] {
  if (nodeEnv === 'production' && (!raw || raw === '*')) {
    console.error('FATAL: CORS_ORIGIN must be set to specific origins in production. Exiting.');
    process.exit(1);
  }
  if (!raw || raw === '*') return '*';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export function loadConfig(): ServerConfig {
  const nodeEnv = (getEnv('NODE_ENV', 'development') as 'production' | 'development' | 'test');

  return {
    port: parseInt(getEnv('PORT', '8080'), 10),
    nodeEnv,
    logLevel: getEnv('LOG_LEVEL', nodeEnv === 'production' ? 'info' : 'debug'),
    corsOrigin: parseCorsOrigin(getEnv('CORS_ORIGIN', '*'), nodeEnv),

    postgres: {
      connectionString: getEnv('DATABASE_URL', 'postgresql://collabdoc:collabdoc@localhost:5432/collabdoc'),
      poolSize: parseInt(getEnv('PG_POOL_SIZE', '10'), 10),
    },

    redis: {
      url: getEnv('REDIS_URL', 'redis://localhost:6379'),
    },

    store: {
      backend: (getEnv('STORE_BACKEND', 'memory') as 'postgres' | 'memory'),
      snapshotEveryNOps: parseInt(getEnv('SNAPSHOT_EVERY_N_OPS', '100'), 10),
      snapshotAfterSeconds: parseInt(getEnv('SNAPSHOT_AFTER_SECONDS', '30'), 10),
    },
  };
}
