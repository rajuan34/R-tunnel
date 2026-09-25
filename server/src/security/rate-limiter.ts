interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class SimpleRateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 120) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Periodically clean up expired entries
    setInterval(() => this.cleanup(), Math.max(windowMs, 30000)).unref();
  }

  isAllowed(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || entry.resetAt <= now) {
      const resetAt = now + this.windowMs;
      this.limits.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.maxRequests - 1, resetAt };
    }

    if (entry.count >= this.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count += 1;
    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (entry.resetAt <= now) {
        this.limits.delete(key);
      }
    }
  }
}
