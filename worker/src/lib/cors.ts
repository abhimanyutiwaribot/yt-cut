// src/lib/cors.ts
// CORS helpers — allows the frontend origin to call the Worker

const ALLOWED_ORIGINS = [
  'http://localhost:4321',  // Astro dev server
  'http://127.0.0.1:4321',
  'http://localhost:5173',  // Vite dev server
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'https://yt-cut.pages.dev', // Cloudflare Pages
  'https://yt-cut.com',     // production
  'https://www.yt-cut.com',
];

export function getCorsHeaders(request: Request): HeadersInit {
  const rawOrigin = request.headers.get('Origin') ?? '';
  const origin = rawOrigin.replace(/\/+$/, '');
  const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
  const isPagesDev = origin === 'https://yt-cut.pages.dev' || origin.endsWith('.yt-cut.pages.dev');
  const isAllowed = isLocalhost || isPagesDev || ALLOWED_ORIGINS.includes(origin);
  const allowed = isAllowed ? origin : 'https://yt-cut.com';

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleOptions(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}
