// src/index.ts
// YT-CUT Cloudflare Worker — entry point
// Sole responsibility: extract YouTube stream URLs for the browser.
// Video bytes NEVER pass through this worker.

import { handleInfo } from './routes/info';
import { handleProxy } from './routes/proxy';
import { handleOptions, getCorsHeaders } from './lib/cors';
import { error } from './lib/response';
import { isRateLimited, getClientIp } from './lib/ratelimit';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    // ── CORS preflight ──────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    const cors = getCorsHeaders(request);

    // ── Only GET requests beyond this point ────────────────────────
    if (request.method !== 'GET') {
      return error('Method not allowed', 405, cors);
    }

    // ── Rate limiting ───────────────────────────────────────────────
    // Limit /api/info and general routes to 10 req/min.
    // Allow up to 600 req/min for /api/proxy to support chunked media streaming.
    const ip = getClientIp(request);
    const maxRequests = pathname === '/api/proxy' ? 600 : 10;
    if (isRateLimited(ip, maxRequests)) {
      return error('Too many requests. Please wait a moment.', 429, cors);
    }

    // ── Route table ─────────────────────────────────────────────────
    // GET /api/proxy?url=<googlevideo_url> → CORS stream passthrough
    if (pathname === '/api/proxy') {
      return handleProxy(request);
    }

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
