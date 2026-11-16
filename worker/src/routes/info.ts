// src/routes/info.ts
// GET /api/info?url=<youtube_url>
// Returns video metadata + resolved stream URLs to the browser.
// The browser then fetches the streams DIRECTLY from YouTube CDN.

import { extractVideoId, getStreamInfo } from '../lib/youtube';
import { json, error } from '../lib/response';
import { getCorsHeaders } from '../lib/cors';

export async function handleInfo(request: Request, env?: Env): Promise<Response> {
  const cors = getCorsHeaders(request);
  const MAX_DURATION_SECONDS = Number(env?.MAX_CLIP_DURATION_SECONDS ?? 600);
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get('url');

  if (!rawUrl) {
    return error('Missing required query param: url', 400, cors);
  }

  const videoId = extractVideoId(rawUrl);
  if (!videoId) {
    return error('Invalid or unsupported YouTube URL', 400, cors);
  }

  let info;
  try {
    info = await getStreamInfo(videoId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';

    // Distinguish known failure modes for better frontend UX
    if (msg.includes('private') || msg.includes('unavailable')) {
      return error('This video is private or unavailable', 403, cors);
    }
    if (msg.includes('No suitable video stream')) {
      return error('No 1080p stream available for this video', 422, cors);
    }

    console.error('[yt-cut] getStreamInfo failed:', msg);
    return error('Failed to fetch video info. The video may be region-locked or unavailable.', 502, cors);
  }

  // Enforce duration cap
  if (info.durationSeconds > MAX_DURATION_SECONDS) {
    // We still return the info but flag that clips must be under the cap
    // The frontend enforces the 10-min clip window; the full video can be longer
  }

  return json(
    {
      ok: true,
      data: {
        videoId: info.videoId,
        title: info.title,
        author: info.author,
        durationSeconds: info.durationSeconds,
        thumbnailUrl: info.thumbnailUrl,
        maxClipDurationSeconds: MAX_DURATION_SECONDS,
        streams: info.streams,
      },
    },
    200,
    cors
  );
}
