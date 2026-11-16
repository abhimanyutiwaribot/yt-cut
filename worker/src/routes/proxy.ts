// src/routes/proxy.ts
// Streaming CORS proxy for YouTube CDN streams (googlevideo.com)
// Pipes bytes directly to the client with Access-Control-Allow-Origin headers.
// Memory footprint is near zero because it streams without buffering.

import { getCorsHeaders } from '../lib/cors';
import { error } from '../lib/response';

export async function handleProxy(request: Request): Promise<Response> {
  const cors = getCorsHeaders(request);
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return error('Missing required query param: url', 400, cors);
  }

  // Security check: ensure target is a Google / YouTube CDN host
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
    if (!parsed.hostname.endsWith('.googlevideo.com') && !parsed.hostname.endsWith('.youtube.com')) {
      return error('Invalid stream host', 403, cors);
    }
  } catch {
    return error('Malformed target URL', 400, cors);
  }

  const clen = parsed.searchParams.get('clen');
  const clenNum = clen ? parseInt(clen, 10) : 0;

  // Read requested Range header or query param
  let rangeHeader = request.headers.get('Range') || (searchParams.get('range') ? `bytes=${searchParams.get('range')}` : null);

  let start = 0;
  let end = clenNum > 0 ? clenNum - 1 : 5242879;

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      start = parseInt(match[1], 10);
      if (match[2] && match[2].length > 0) {
        end = parseInt(match[2], 10);
      }
    }
  }

  // CRITICAL: Ensure `end` never exceeds `clen - 1`.
  // Google Video CDN returns 403 Forbidden if a range request asks for bytes beyond clen!
  if (clenNum > 0 && end >= clenNum) {
    end = clenNum - 1;
  }

  // If start is beyond end (e.g. invalid range), return 416 Range Not Satisfiable
  if (clenNum > 0 && start > end) {
    return new Response(null, {
      status: 416,
      headers: {
        ...cors,
        'Content-Range': `bytes */${clenNum}`,
      },
    });
  }

  const boundedRangeStr = `${start}-${end}`;

  const headers = new Headers();
  // Ensure upstream User-Agent matches VisionOS client parameters (c=VISIONOS) on signed CDN URLs
  headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15');
  headers.set('Accept-Encoding', 'identity');
  headers.set('Range', `bytes=${boundedRangeStr}`);

  // Only update `range` in query string if it was already present on the URL,
  // avoiding invalidating HMAC signatures on streams (like audio) that don't use query range.
  let upstreamUrl = targetUrl;
  if (parsed.searchParams.has('range')) {
    parsed.searchParams.set('range', boundedRangeStr);
    upstreamUrl = parsed.toString();
  }

  // Bypass CDN connection pacing limits
  if (!parsed.searchParams.has('ratebypass')) {
    parsed.searchParams.set('ratebypass', 'yes');
    upstreamUrl = parsed.toString();
  }

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      headers,
      redirect: 'follow',
    });

    if (upstreamRes.status >= 400) {
      const errText = await upstreamRes.clone().text().catch(() => '');
      const errHeaders: Record<string, string> = {};
      upstreamRes.headers.forEach((v, k) => { errHeaders[k] = v; });
      console.error(`[proxy error ${upstreamRes.status}] itag=${parsed.searchParams.get('itag')} range=${boundedRangeStr} urlRange=${parsed.searchParams.get('range')} body=${errText.slice(0, 100)} headers=${JSON.stringify(errHeaders)}`);
    }

    const responseHeaders = new Headers(cors);
    
    // Pass through essential streaming headers
    const copyHeaders = [
      'Content-Type',
      'Content-Length',
      'Content-Range',
      'Accept-Ranges',
      'Content-Disposition',
    ];

    for (const h of copyHeaders) {
      const val = upstreamRes.headers.get(h);
      if (val) responseHeaders.set(h, val);
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown upstream error';
    return error(`Proxy streaming failed: ${msg}`, 502, cors);
  }
}
