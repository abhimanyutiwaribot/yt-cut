// src/index.ts
// YT-CUT Cloudflare Worker — entry point
// Sole responsibility: extract YouTube stream URLs for the browser.
// Video bytes NEVER pass through this worker.

import { handleInfo } from './routes/info';
import { handleOptions } from './lib/cors';
import { error } from './lib/response';
import { isRateLimited, getClientIp } from './lib/ratelimit';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    // ── CORS preflight ──────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // ── Only GET requests beyond this point ────────────────────────
    if (request.method !== 'GET') {
      return error('Method not allowed', 405);
    }

    // ── Rate limiting ───────────────────────────────────────────────
    const ip = getClientIp(request);
    if (isRateLimited(ip)) {
      return error('Too many requests. Please wait a moment.', 429);
    }

    // ── Route table ─────────────────────────────────────────────────
    // GET /api/info?url=<youtube_url>   → stream URLs + metadata
    if (pathname === '/api/info') {
      return handleInfo(request, env);
    }

    // ── Health check (useful for uptime monitors) ───────────────────
    if (pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'yt-cut-worker' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return error('Not found', 404);
  },
} satisfies ExportedHandler<Env>;
