// src/lib/ratelimit.ts
// Simple in-memory sliding window rate limiter.
// Runs per-isolate (not globally shared across CF edge nodes),
// but sufficient to prevent per-instance abuse on a utility app.

const WINDOW_MS = 60_000; // 1 minute
const DEFAULT_MAX_REQUESTS = 10;  // default requests per IP per window
const MAX_STORE_ENTRIES = 5_000;  // prevent unbounded memory growth in isolate

interface Entry {
  timestamps: number[];
}

const store = new Map<string, Entry>();

/** Returns true if the request should be blocked. */
export function isRateLimited(ip: string, maxRequests = DEFAULT_MAX_REQUESTS): boolean {
  const now = Date.now();

  // Guard against memory leaks by pruning expired records when map is large
  if (store.size >= MAX_STORE_ENTRIES) {
    for (const [k, v] of store.entries()) {
      v.timestamps = v.timestamps.filter((t) => now - t < WINDOW_MS);
      if (v.timestamps.length === 0) {
        store.delete(k);
      }
    }
    // Safety valve if still saturated
    if (store.size >= MAX_STORE_ENTRIES) {
      store.clear();
    }
  }

  const entry = store.get(ip) ?? { timestamps: [] };

  // Drop timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);

  if (entry.timestamps.length >= maxRequests) {
    store.set(ip, entry);
    return true; // blocked
  }

  entry.timestamps.push(now);
  store.set(ip, entry);
  return false; // allowed
}

/** Extract the real client IP from CF headers. */
export function getClientIp(request: Request): string {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp;

  const forwarded = request.headers.get('X-Forwarded-For');
  if (forwarded) return forwarded.split(',')[0].trim();

  return 'unknown';
}
