import { config } from '../config';

/**
 * In-memory sliding-window rate limiter.
 * Keeps an ordered list of event timestamps per key and prunes expired
 * entries on every call — no timers, no leaks beyond the current window.
 */
export class SlidingWindowRateLimiter {
  private readonly maxEvents: number;
  private readonly windowMs: number;
  private readonly buckets = new Map<string, number[]>();

  constructor(maxEvents: number, windowMs: number) {
    this.maxEvents = Math.max(1, Math.floor(maxEvents));
    this.windowMs = Math.max(1, Math.floor(windowMs));
  }

  /**
   * Record one event for `key`. Every hit (allowed or blocked) is recorded —
   * a true sliding window. Old entries are pruned automatically.
   */
  hit(key: string): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let events = this.buckets.get(key);
    if (events) {
      // Auto-prune timestamps that fell out of the window.
      let firstValid = 0;
      while (firstValid < events.length && events[firstValid] <= cutoff) firstValid++;
      if (firstValid > 0) events.splice(0, firstValid);
    } else {
      events = [];
      this.buckets.set(key, events);
    }

    if (events.length >= this.maxEvents) {
      // Blocked — record the attempt too so sustained floods stay limited.
      events.push(now);
      // Hard cap to keep memory bounded under abuse.
      const cap = this.maxEvents * 8;
      if (events.length > cap) events.splice(0, events.length - cap);
      const oldest = events[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      return { allowed: false, retryAfterSec };
    }

    events.push(now);
    return { allowed: true, retryAfterSec: 0 };
  }

  /** Clear all recorded events for one key (e.g. after successful auth). */
  resetKey(key: string): void {
    this.buckets.delete(key);
  }

  /** Number of distinct keys currently tracked. */
  size(): number {
    return this.buckets.size;
  }
}

/** Shared limiter: config.security.rateLimitPerMin events per 60 seconds. */
export const globalUserLimiter = new SlidingWindowRateLimiter(config.security.rateLimitPerMin, 60_000);
