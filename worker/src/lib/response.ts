// src/lib/response.ts
// Typed JSON response helpers

export function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

export function error(message: string, status = 400, extraHeaders: HeadersInit = {}): Response {
  return json({ ok: false, error: message }, status, extraHeaders);
}
