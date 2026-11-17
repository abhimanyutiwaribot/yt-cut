import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
  SELF,
} from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';

// ── Helpers ──────────────────────────────────────────────────────────────────

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

function makeRequest(path: string, method = 'GET', origin = 'http://localhost:5173') {
  return new IncomingRequest(`http://yt-cut-worker.dev${path}`, {
    method,
    headers: { Origin: origin },
  });
}

async function fetchWorker(path: string, method = 'GET') {
  const req = makeRequest(path, method);
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

// ── Mock youtubei.js ──────────────────────────────────────────────────────────
// We don't want real network calls in tests — mock the lib layer.

vi.mock('../src/lib/youtube', () => ({
  extractVideoId: vi.fn((input: string) => {
    // Mirror real logic: parse URL and extract ?v= param
    try {
      const url = new URL(input);
      if (url.hostname.includes('youtube.com')) return url.searchParams.get('v');
      if (url.hostname === 'youtu.be') return url.pathname.slice(1) || null;
    } catch {
      if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
    }
    return null;
  }),

  getStreamInfo: vi.fn(async (videoId: string) => {
    if (videoId === 'privateVid1') {
      throw new Error('This video is private or unavailable');
    }
    if (videoId === 'noStream111') {
      throw new Error('No suitable video stream found (≤1080p VP9/AV1)');
    }
    // Happy path
    return {
      videoId,
      title: 'Never Gonna Give You Up',
      author: 'Rick Astley',
      durationSeconds: 213,
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      streams: {
        best: {
          video: {
            url: 'https://cdn.youtube.com/fake-video-stream',
            mimeType: 'video/webm; codecs="vp9"',
            bitrate: 2500000,
            height: 1080,
          },
          audio: {
            url: 'https://cdn.youtube.com/fake-audio-stream',
            mimeType: 'audio/webm; codecs="opus"',
            bitrate: 128000,
          },
        },
        audioOnly: {
          url: 'https://cdn.youtube.com/fake-audio-stream',
          mimeType: 'audio/webm; codecs="opus"',
          bitrate: 128000,
        },
      },
    };
  }),
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe('Rate limiting', () => {
  it('returns 429 after exceeding 10 requests per minute from same IP', async () => {
    // Fire 10 allowed requests
    for (let i = 0; i < 10; i++) {
      const req = new IncomingRequest('http://yt-cut-worker.dev/health', {
        method: 'GET',
        headers: { Origin: 'http://localhost:5173', 'CF-Connecting-IP': '1.2.3.4' },
      });
      const ctx = createExecutionContext();
      await worker.fetch(req, env, ctx);
      await waitOnExecutionContext(ctx);
    }
    // 11th should be blocked
    const req = new IncomingRequest('http://yt-cut-worker.dev/health', {
      method: 'GET',
      headers: { Origin: 'http://localhost:5173', 'CF-Connecting-IP': '1.2.3.4' },
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(429);
  });
});

// ── Health check ─────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with service name', async () => {
    const res = await fetchWorker('/health');
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; service: string }>();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('yt-cut-worker');
  });
});

// ── Method guards ─────────────────────────────────────────────────────────────

describe('Non-GET requests', () => {
  it('returns 405 for POST', async () => {
    const res = await fetchWorker('/api/info', 'POST');
    expect(res.status).toBe(405);
  });

  it('returns 405 for PUT', async () => {
    const res = await fetchWorker('/api/info', 'PUT');
    expect(res.status).toBe(405);
  });
});

// ── Unknown routes ────────────────────────────────────────────────────────────

describe('Unknown routes', () => {
  it('returns 404', async () => {
    const res = await fetchWorker('/api/unknown');
    expect(res.status).toBe(404);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(false);
  });
});

// ── CORS preflight ────────────────────────────────────────────────────────────

describe('OPTIONS preflight', () => {
  it('returns 204 with CORS headers for allowed origin', async () => {
    const req = new IncomingRequest('http://yt-cut-worker.dev/api/info', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });
});

// ── GET /api/info — validation ────────────────────────────────────────────────

describe('GET /api/info — input validation', () => {
  it('returns 400 when url param is missing', async () => {
    const res = await fetchWorker('/api/info');
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/url/i);
  });

  it('returns 400 for a non-YouTube URL', async () => {
    const res = await fetchWorker('/api/info?url=https://vimeo.com/123456');
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid/i);
  });

  it('returns 400 for a garbage string', async () => {
    const res = await fetchWorker('/api/info?url=not-a-url-at-all-invalid');
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(false);
  });
});

// ── GET /api/info — happy path ────────────────────────────────────────────────

describe('GET /api/info — success', () => {
  it('returns stream info for a valid YouTube URL', async () => {
    const res = await fetchWorker(
      '/api/info?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
    expect(res.status).toBe(200);

    const body = await res.json<{
      ok: boolean;
      data: {
        videoId: string;
        title: string;
        author: string;
        durationSeconds: number;
        maxClipDurationSeconds: number;
        streams: {
          best: { video: { height: number }; audio: { url: string } };
          audioOnly: { url: string };
        };
      };
    }>();

    expect(body.ok).toBe(true);
    expect(body.data.videoId).toBe('dQw4w9WgXcQ');
    expect(body.data.title).toBe('Never Gonna Give You Up');
    expect(body.data.author).toBe('Rick Astley');
    expect(body.data.durationSeconds).toBe(213);
    expect(body.data.maxClipDurationSeconds).toBe(600);
    expect(body.data.streams.best.video.height).toBeLessThanOrEqual(1080);
    expect(body.data.streams.best.audio.url).toContain('https://');
    expect(body.data.streams.audioOnly.url).toContain('https://');
  });

  it('response includes CORS header', async () => {
    const res = await fetchWorker(
      '/api/info?url=https://youtu.be/dQw4w9WgXcQ'
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });

  it('content-type is application/json', async () => {
    const res = await fetchWorker(
      '/api/info?url=https://youtube.com/watch?v=dQw4w9WgXcQ'
    );
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });
});

// ── GET /api/info — YouTube error scenarios ───────────────────────────────────

describe('GET /api/info — upstream errors', () => {
  it('returns 403 for a private video', async () => {
    const res = await fetchWorker('/api/info?url=https://youtube.com/watch?v=privateVid1');
    expect(res.status).toBe(403);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/private|unavailable/i);
  });

  it('returns 422 when no suitable stream is available', async () => {
    const res = await fetchWorker('/api/info?url=https://youtube.com/watch?v=noStream111');
    expect(res.status).toBe(422);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/stream/i);
  });
});

// ── Security Hardening Checks ────────────────────────────────────────────────

describe('Security hardening checks', () => {
  it('allows Cloudflare Pages origin in CORS', async () => {
    const req = makeRequest('/api/info?url=https://youtube.com/watch?v=dQw4w9WgXcQ', 'GET', 'https://yt-cut.pages.dev');
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://yt-cut.pages.dev');
  });

  it('does not reflect untrusted origins in CORS', async () => {
    const req = makeRequest('/api/info?url=https://youtube.com/watch?v=dQw4w9WgXcQ', 'GET', 'https://malicious-site.com');
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://yt-cut.com');
  });

  it('rejects proxy requests with non-HTTPS URLs', async () => {
    const res = await fetchWorker('/api/proxy?url=http://rr1---sn-4g5ednks.googlevideo.com/videoplayback');
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.error).toMatch(/https/i);
  });

  it('rejects proxy requests to unapproved stream hosts', async () => {
    const res = await fetchWorker('/api/proxy?url=https://malicious-host.com/videoplayback');
    expect(res.status).toBe(403);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.error).toMatch(/invalid stream host/i);
  });
});
