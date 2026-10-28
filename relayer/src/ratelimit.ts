/** In-memory sliding-window rate limiter (single machine). */
export class RateLimiter {
  private hits = new Map<string, number[]>()
  private lastSweep = Date.now()

  constructor(private windowMs = 60_000) {}

  /** Returns 0 if allowed (and records the hit), else the seconds until a slot frees up. */
  take(key: string, limit: number, now = Date.now()): number {
    if (limit <= 0) return 0
    this.sweep(now)
    const from = now - this.windowMs
    const list = (this.hits.get(key) ?? []).filter((t) => t > from)
    if (list.length >= limit) {
      this.hits.set(key, list)
      return Math.max(1, Math.ceil((list[0] + this.windowMs - now) / 1000))
    }
    list.push(now)
    this.hits.set(key, list)
    return 0
  }

  private sweep(now: number) {
    if (now - this.lastSweep < this.windowMs) return
    this.lastSweep = now
    const from = now - this.windowMs
    for (const [k, v] of this.hits) if (!v.length || v[v.length - 1] <= from) this.hits.delete(k)
  }
}

/** Origin allow-list with `https://*.vercel.app`-style wildcards (one label or more). */
export function originMatcher(patterns: string[]) {
  const res = patterns.map((p) => {
    if (p === '*') return /^.*$/
    const esc = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+(?:\\.[a-z0-9-]+)*')
    return new RegExp(`^${esc}$`, 'i')
  })
  return (origin: string | undefined | null): boolean => !!origin && res.some((r) => r.test(origin))
}
