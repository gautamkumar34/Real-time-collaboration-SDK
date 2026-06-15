/**
 * Token-bucket rate limiter per socket.
 *
 * Each socket gets a bucket that refills at `refillRate` tokens/sec
 * up to `maxBurst`. Every operation costs 1 token. When the bucket
 * is empty the socket is throttled.
 *
 * Why token bucket over sliding window: simpler, allows short bursts
 * (paste 20 fields at once), and the refill-on-check pattern needs
 * no timers — just math on timestamps.
 */

export interface RateLimiterConfig {
  /** Max tokens in the bucket (burst capacity). Default: 100 */
  maxBurst: number;
  /** Tokens added per second. Default: 50 */
  refillRate: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number; // ms timestamp
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxBurst: 100,
  refillRate: 50,
};

export class RateLimiter {
  private buckets: Map<string, Bucket> = new Map();
  private config: RateLimiterConfig;

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Try to consume one token for the given key (socket id).
   * Returns true if allowed, false if rate-limited.
   */
  consume(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      // New socket — start with a full bucket
      bucket = { tokens: this.config.maxBurst, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    const refill = elapsed * this.config.refillRate;
    bucket.tokens = Math.min(this.config.maxBurst, bucket.tokens + refill);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      return false; // Rate limited
    }

    bucket.tokens -= 1;
    return true;
  }

  /**
   * Remove the bucket for a disconnected socket.
   * Prevents unbounded memory growth.
   */
  remove(key: string): void {
    this.buckets.delete(key);
  }

  /** Number of tracked sockets (for metrics). */
  get size(): number {
    return this.buckets.size;
  }
}
