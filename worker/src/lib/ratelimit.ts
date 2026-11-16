// src/lib/ratelimit.ts
// Simple in-memory sliding window rate limiter.
// Runs per-isolate (not globally shared across CF edge nodes),
// but sufficient to prevent per-instance abuse on a utility app.

const WINDOW_MS = 60_000; // 1 minute
const DEFAULT_MAX_REQUESTS = 10;  // default requests per IP per window

interface Entry {
  timestamps: number[];
}

const store = new Map<string, Entry>();

/** Returns true if the request should be blocked. */
export function isRateLimited(ip: string, maxRequests = DEFAULT_MAX_REQUESTS): boolean {
  const now = Date.now();
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
  return (
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ??
    'unknown'
  );
}
