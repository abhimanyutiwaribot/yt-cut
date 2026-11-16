// src/lib/cors.ts
// CORS helpers — allows the frontend origin to call the Worker

const ALLOWED_ORIGINS = [
  'http://localhost:5173',  // Vite dev server
  'http://localhost:3000',
  'https://yt-cut.com',     // production — update with your real domain
  'https://www.yt-cut.com',
];

export function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleOptions(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}
