/**
 * Hybrid Logical Clock (HLC)
 *
 * Combines wall-clock time with a logical counter to produce
 * monotonically increasing timestamps that are:
 *   1. Roughly aligned with real time (within ms)
 *   2. Immune to wall-clock skew / manipulation
 *   3. Totally ordered per node, causally ordered across nodes
 *
 * Format: { wallTime: number, counter: number, nodeId: string }
 *
 * Comparison: wallTime first, then counter, then nodeId (string compare)
 * — deterministic total order even when two nodes produce the same
 * wallTime + counter.
 *
 * Reference: Kulkarni et al., "Logical Physical Clocks and Consistent
 * Snapshots in Globally Distributed Databases" (HLC paper, 2014).
 */

export interface HLCTimestamp {
  /** Wall-clock time in ms (from Date.now or similar) */
  wallTime: number;
  /** Logical counter — incremented when wall clock doesn't advance */
  counter: number;
  /** Node identifier — tie-breaker for total order */
  nodeId: string;
}

export class HLC {
  private wallTime: number;
  private counter: number;
  private nodeId: string;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.wallTime = Date.now();
    this.counter = 0;
  }

  /**
   * Generate a new timestamp for a local event.
   * Always advances beyond the last known timestamp.
   */
  now(): HLCTimestamp {
    const physicalNow = Date.now();

    if (physicalNow > this.wallTime) {
      // Wall clock moved forward — reset counter
      this.wallTime = physicalNow;
      this.counter = 0;
    } else {
      // Wall clock hasn't moved (or went backward) — bump counter
      this.counter += 1;
    }

    return {
      wallTime: this.wallTime,
      counter: this.counter,
      nodeId: this.nodeId,
    };
  }

  /**
   * Receive a remote timestamp and advance local clock to maintain
   * causal ordering. Returns the merged (advanced) local timestamp.
   *
   * Call this when you receive a remote operation — it ensures your
   * next `now()` will produce a timestamp that is strictly greater
   * than both your last local timestamp AND the remote one.
   */
  receive(remote: HLCTimestamp): HLCTimestamp {
    const physicalNow = Date.now();

    if (physicalNow > this.wallTime && physicalNow > remote.wallTime) {
      // Physical clock is ahead of both — use it
      this.wallTime = physicalNow;
      this.counter = 0;
    } else if (this.wallTime === remote.wallTime) {
      // Same wall time — advance counter beyond both
      this.counter = Math.max(this.counter, remote.counter) + 1;
    } else if (this.wallTime > remote.wallTime) {
      // Local is ahead — just bump local counter
      this.counter += 1;
    } else {
      // Remote is ahead — adopt remote wall time
      this.wallTime = remote.wallTime;
      this.counter = remote.counter + 1;
    }

    return {
      wallTime: this.wallTime,
      counter: this.counter,
      nodeId: this.nodeId,
    };
  }

  /**
   * Compare two HLC timestamps.
   * Returns negative if a < b, positive if a > b, 0 if equal.
   */
  static compare(a: HLCTimestamp, b: HLCTimestamp): number {
    if (a.wallTime !== b.wallTime) {
      return a.wallTime - b.wallTime;
    }
    if (a.counter !== b.counter) {
      return a.counter - b.counter;
    }
    // Deterministic tie-break: lower nodeId wins (consistent with
    // existing actorId < comparison in the LWW logic)
    if (a.nodeId < b.nodeId) return -1;
    if (a.nodeId > b.nodeId) return 1;
    return 0;
  }

  /**
   * Returns true if timestamp `a` is strictly greater than `b`.
   */
  static isNewer(a: HLCTimestamp, b: HLCTimestamp): boolean {
    return HLC.compare(a, b) > 0;
  }

  /**
   * Serialize an HLC timestamp to a numeric value suitable for
   * backward compatibility with the existing `timestamp` field.
   *
   * Encoding: wallTime * 65536 + counter (counter fits in 16 bits
   * for any reasonable op rate). This preserves comparison order
   * when compared as plain numbers.
   *
   * Note: nodeId is NOT encoded — it's sent separately as actorId.
   */
  static toNumeric(ts: HLCTimestamp): number {
    return ts.wallTime * 65536 + (ts.counter & 0xffff);
  }

  /**
   * Decode a numeric timestamp back to an approximate HLC.
   * The nodeId will be empty — caller must supply it.
   */
  static fromNumeric(n: number): Omit<HLCTimestamp, 'nodeId'> {
    return {
      wallTime: Math.floor(n / 65536),
      counter: n & 0xffff,
    };
  }
}
