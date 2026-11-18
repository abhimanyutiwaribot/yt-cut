// src/lib/youtube.ts
// Responsible for extracting stream info from YouTube via youtubei.js

import { Innertube, ClientType } from 'youtubei.js/cf-worker';

const MAX_HEIGHT = 2160;

export interface StreamVideo {
  url: string;
  mimeType: string;
  bitrate: number;
  height: number;
  qualityLabel?: string;
  contentLength?: number;
}

export interface StreamAudio {
  url: string;
  mimeType: string;
  bitrate: number;
  contentLength?: number;
}

export interface StreamInfo {
  videoId: string;
  title: string;
  author: string;
  durationSeconds: number;
  thumbnailUrl: string;
  streams: {
    video720?: StreamVideo;
    video1080?: StreamVideo;
    best: {
      video: StreamVideo;
      audio: StreamAudio;
    };
    progressive?: StreamVideo;
    audioOnly: StreamAudio;
  };
}

export async function getStreamInfo(videoId: string): Promise<StreamInfo> {
  const yt = await Innertube.create({
    fetch: fetch.bind(globalThis),
    client_type: ClientType.VISIONOS,
    retrieve_player: false,
    generate_session_locally: false,
  });

  const info = await yt.getBasicInfo(videoId);
  const details = info.basic_info;

  if (!details) throw new Error('Could not fetch video details');

  if (details.is_live) {
    throw new Error('This stream is currently live. Live streams can be clipped after the broadcast finishes.');
  }
  if (details.is_upcoming) {
    throw new Error('This live stream has not started yet.');
  }

  // ── Video streams (DASH, video-only) ──────────────────────────────
  // Filter to adaptive video streams up to 1080p.
  // Prioritize H.264 (avc1 / mp4) because it supports direct HTTP Range streaming without
  // requiring Google SABR protocol (unlike AV01 on iOS).
  const adaptiveVideos = info.streaming_data?.adaptive_formats
    ?.filter((f) => f.has_video && !f.has_audio && (f.height ?? 0) <= MAX_HEIGHT)
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

  const bestVideo =
    adaptiveVideos?.find((f) => f.mime_type?.includes('avc1') || f.mime_type?.includes('mp4')) ??
    adaptiveVideos?.[0];

  if (!bestVideo) throw new Error('No suitable video stream found');

  // Look for dedicated 720p and 1080p MP4 formats using quality labels or resolutions
  const format720 = adaptiveVideos?.find(
    (f) => (f.quality_label?.includes('720p') || f.height === 720 || ((f.height ?? 0) <= 720 && (f.height ?? 0) >= 600)) &&
      (f.mime_type?.includes('avc1') || f.mime_type?.includes('mp4'))
  );
  const format1080 = adaptiveVideos?.find(
    (f) => (f.quality_label?.includes('1080p') || f.height === 1080 || (f.height ?? 0) >= 960) &&
      (f.mime_type?.includes('avc1') || f.mime_type?.includes('mp4'))
  );

  // ── Audio streams (DASH, audio-only) ──────────────────────────────
  // Prioritize AAC (mp4a) for native, lossless muxing with H.264 into MP4
  const audioStreams = info.streaming_data?.adaptive_formats
    ?.filter((f) => f.has_audio && !f.has_video)
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

  console.log('[youtube debug] video adaptive formats:', adaptiveVideos?.map((f) => ({
    itag: f.itag,
    mime: f.mime_type?.split(';')[0],
    quality: f.quality_label,
    clen: f.content_length,
    hasUrl: !!f.url,
  })));

  console.log('[youtube debug] audio adaptive formats:', audioStreams?.map((f) => ({
    itag: f.itag,
    mime: f.mime_type?.split(';')[0],
    bitrate: f.bitrate,
    clen: f.content_length,
    hasUrl: !!f.url,
  })));

  const bestAudio =
    audioStreams?.find((f) => f.mime_type?.includes('mp4a')) ??
    audioStreams?.[0];
  if (!bestAudio) throw new Error('No audio stream found');

  // ── Progressive combined streams (video + audio in one MP4) ──────
  const progressiveFormats = info.streaming_data?.formats
    ?.filter((f) => f.has_video && f.has_audio)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

  const bestProgressive = progressiveFormats?.[0];
  const progressiveUrl = bestProgressive?.url || (yt.session.player && bestProgressive ? await bestProgressive.decipher(yt.session.player) : '');
  const progressiveClen = bestProgressive ? (bestProgressive.content_length ?? (bestProgressive.url ? Number(new URL(bestProgressive.url).searchParams.get('clen')) || undefined : undefined)) : undefined;

  // ── Thumbnail ─────────────────────────────────────────────────────
  const thumbnail =
    details.thumbnail?.find((t) => (t.width ?? 0) >= 480)?.url ??
    details.thumbnail?.[0]?.url ??
    '';

  // ── Resolve stream URLs ────
  const videoUrl = bestVideo.url || (yt.session.player ? await bestVideo.decipher(yt.session.player) : '');
  const audioUrl = bestAudio.url || (yt.session.player ? await bestAudio.decipher(yt.session.player) : '');

  if (!videoUrl) throw new Error('Could not resolve video stream URL');
  if (!audioUrl) throw new Error('Could not resolve audio stream URL');

  const videoClen = bestVideo.content_length ?? (bestVideo.url ? Number(new URL(bestVideo.url).searchParams.get('clen')) || undefined : undefined);
  const audioClen = bestAudio.content_length ?? (bestAudio.url ? Number(new URL(bestAudio.url).searchParams.get('clen')) || undefined : undefined);

  const video720Clen = format720?.content_length ?? (format720?.url ? Number(new URL(format720.url).searchParams.get('clen')) || undefined : undefined);
  const video1080Clen = format1080?.content_length ?? (format1080?.url ? Number(new URL(format1080.url).searchParams.get('clen')) || undefined : undefined);

  return {
    videoId,
    title: details.title ?? 'Untitled',
    author: details.author ?? 'Unknown',
    durationSeconds: details.duration ?? 0,
    thumbnailUrl: thumbnail,
    streams: {
      video720: format720?.url ? {
        url: format720.url,
        mimeType: format720.mime_type ?? '',
        bitrate: format720.bitrate ?? 0,
        height: format720.height ?? 0,
        qualityLabel: format720.quality_label ?? '720p',
        contentLength: video720Clen,
      } : undefined,
      video1080: format1080?.url ? {
        url: format1080.url,
        mimeType: format1080.mime_type ?? '',
        bitrate: format1080.bitrate ?? 0,
        height: format1080.height ?? 0,
        qualityLabel: format1080.quality_label ?? '1080p',
        contentLength: video1080Clen,
      } : undefined,
      best: {
        video: {
          url: videoUrl,
          mimeType: bestVideo.mime_type ?? '',
          bitrate: bestVideo.bitrate ?? 0,
          height: bestVideo.height ?? 0,
          qualityLabel: bestVideo.quality_label ?? `${bestVideo.height}p`,
          contentLength: videoClen,
        },
        audio: {
          url: audioUrl,
          mimeType: bestAudio.mime_type ?? '',
          bitrate: bestAudio.bitrate ?? 0,
          contentLength: audioClen,
        },
      },
      progressive: (bestProgressive && progressiveUrl) ? {
        url: progressiveUrl,
        mimeType: bestProgressive.mime_type ?? '',
        bitrate: bestProgressive.bitrate ?? 0,
        height: bestProgressive.height ?? 0,
        contentLength: progressiveClen,
      } : undefined,
      audioOnly: {
        url: audioUrl,
        mimeType: bestAudio.mime_type ?? '',
        bitrate: bestAudio.bitrate ?? 0,
        contentLength: audioClen,
      },
    },
  };
}

/** Extract a YouTube video ID from a URL or bare ID string */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Check if input is a bare 11-character video ID
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();

    // Check youtube.com and related domains
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      // Priority 1: ?v= query parameter (e.g. /watch?v=ID)
      const v = url.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) {
        return v;
      }
      // Priority 2: path-based IDs (/live/ID, /shorts/ID, /embed/ID, /v/ID)
      const match = url.pathname.match(/\/(live|shorts|embed|v)\/([A-Za-z0-9_-]{11})/);
      if (match) {
        return match[2];
      }
    }

    // Check youtu.be short links (e.g. youtu.be/ID)
    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      const id = url.pathname.slice(1).split('/')[0];
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) {
        return id;
      }
    }
  } catch {
    // Input is not a valid URL
  }

  return null;
}
