import { Injectable } from '@nestjs/common';

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch milliseconds at which the current window ends. */
  resetAt: number;
}

interface Counter {
  count: number;
  resetAt: number;
}

/**
 * Maximum number of client keys kept in memory before expired entries are
 * swept. The cap keeps a burst of unique clients from growing the map without
 * bound on a long-lived instance.
 */
const MAX_TRACKED_KEYS = 10_000;

/**
 * Fixed-window counter kept in process memory.
 *
 * Deliberately dependency-free: the popular `@nestjs/throttler` package ships
 * CommonJS output that `require()`s the ESM-only `@nestjs/common`, which breaks
 * on serverless runtimes that do not support `require()` of ES modules.
 *
 * Counters are per process. On Vercel every function instance keeps its own
 * map, so this is a best-effort limiter; a distributed store (or Vercel WAF)
 * is required to enforce a global limit.
 */
@Injectable()
export class RateLimitService {
  private readonly counters = new Map<string, Counter>();

  consume(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitDecision {
    const existing = this.counters.get(key);
    const isExpired = existing === undefined || existing.resetAt <= now;
    const counter: Counter = isExpired ? { count: 0, resetAt: now + windowMs } : existing;

    counter.count += 1;
    this.counters.set(key, counter);
    this.evictIfNeeded(now);

    return {
      allowed: counter.count <= limit,
      limit,
      remaining: Math.max(0, limit - counter.count),
      resetAt: counter.resetAt,
    };
  }

  private evictIfNeeded(now: number): void {
    if (this.counters.size <= MAX_TRACKED_KEYS) {
      return;
    }

    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) {
        this.counters.delete(key);
      }
    }

    // Still over the cap: drop the oldest tracked keys. JavaScript maps keep
    // insertion order, so the first keys are the least recently created.
    while (this.counters.size > MAX_TRACKED_KEYS) {
      const oldestKey = this.counters.keys().next().value;

      if (oldestKey === undefined) {
        return;
      }

      this.counters.delete(oldestKey);
    }
  }
}
