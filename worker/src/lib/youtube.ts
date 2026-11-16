// src/lib/youtube.ts
// Responsible for extracting stream info from YouTube via youtubei.js

import { Innertube } from 'youtubei.js';

const MAX_HEIGHT = 1080;

export interface StreamInfo {
  videoId: string;
  title: string;
  author: string;
  durationSeconds: number;
  thumbnailUrl: string;
  streams: {
    best: {
      video: { url: string; mimeType: string; bitrate: number; height: number };
      audio: { url: string; mimeType: string; bitrate: number };
    };
    audioOnly: {
      url: string;
      mimeType: string;
      bitrate: number;
    };
  };
}

export async function getStreamInfo(videoId: string): Promise<StreamInfo> {
  const yt = await Innertube.create({
    retrieve_player: true,
    generate_session_locally: true,
  });

  const info = await yt.getInfo(videoId);
  const details = info.basic_info;

  if (!details) throw new Error('Could not fetch video details');

  // ── Video streams (DASH, video-only) ──────────────────────────────
  // Filter to VP9 or AV1 video-only streams up to 1080p, pick best
  const videoStreams = info.streaming_data?.adaptive_formats
    ?.filter(
      (f) =>
        f.has_video &&
        !f.has_audio &&
        (f.mime_type?.includes('vp9') || f.mime_type?.includes('av01')) &&
        (f.height ?? 0) <= MAX_HEIGHT
    )
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

  const bestVideo = videoStreams?.[0];
  if (!bestVideo) throw new Error('No suitable video stream found (≤1080p VP9/AV1)');

  // ── Audio streams (DASH, audio-only) ──────────────────────────────
  // Prefer Opus, fall back to any audio-only
  const audioStreams = info.streaming_data?.adaptive_formats
    ?.filter((f) => f.has_audio && !f.has_video)
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

  const bestAudio = audioStreams?.find((f) => f.mime_type?.includes('opus')) ?? audioStreams?.[0];
  if (!bestAudio) throw new Error('No audio stream found');

  // ── Thumbnail ─────────────────────────────────────────────────────
  const thumbnail =
    details.thumbnail?.find((t) => (t.width ?? 0) >= 480)?.url ??
    details.thumbnail?.[0]?.url ??
    '';

  // ── Resolve stream URLs (youtubei.js decodes signatures) ──────────
  const videoUrl = await bestVideo.decipher(yt.session.player);
  const audioUrl = await bestAudio.decipher(yt.session.player);

  return {
    videoId,
    title: details.title ?? 'Untitled',
    author: details.author ?? 'Unknown',
    durationSeconds: details.duration ?? 0,
    thumbnailUrl: thumbnail,
    streams: {
      best: {
        video: {
          url: videoUrl,
          mimeType: bestVideo.mime_type ?? '',
          bitrate: bestVideo.bitrate ?? 0,
          height: bestVideo.height ?? 0,
        },
        audio: {
          url: audioUrl,
          mimeType: bestAudio.mime_type ?? '',
          bitrate: bestAudio.bitrate ?? 0,
        },
      },
      audioOnly: {
        url: audioUrl,
        mimeType: bestAudio.mime_type ?? '',
        bitrate: bestAudio.bitrate ?? 0,
      },
    },
  };
}

/** Extract a YouTube video ID from a URL or bare ID string */
export function extractVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    // youtube.com/watch?v=ID
    if (url.hostname.includes('youtube.com')) {
      return url.searchParams.get('v');
    }
    // youtu.be/ID
    if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1) || null;
    }
    // youtube.com/live/ID or /shorts/ID
    const match = url.pathname.match(/\/(live|shorts|embed)\/([A-Za-z0-9_-]{11})/);
    if (match) return match[2];
  } catch {
    // Not a URL — treat as bare video ID if it looks right
    if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  }
  return null;
}
