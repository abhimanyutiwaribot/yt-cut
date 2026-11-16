// src/lib/trimmer.ts
// In-browser WebAssembly video clipping engine via ffmpeg.wasm

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let isLoaded = false;

export interface TrimOptions {
  videoUrl: string;
  audioUrl?: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  totalDuration?: number; // total video duration in seconds
  format: '720p' | '1080p' | 'mp4' | 'audio' | 'webm';
  onProgress?: (progress: number, stage: string) => void;
}

export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance && isLoaded) {
    return ffmpegInstance;
  }

  const ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    console.log('[ffmpeg]:', message);
    if (onLog) onLog(message);
  });

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ffmpeg;
  isLoaded = true;
  return ffmpeg;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Downloads a video or audio stream via HTTP Range chunks to avoid:
 * 1. Google CDN 403 Forbidden (which occurs on requests without Range or on conflicting range params)
 * 2. Cloudflare Worker proxy execution timeouts
 * 3. Browser memory spikes
 */
async function fetchStreamChunked(
  url: string,
  label: string,
  maxBudgetBytes?: number,
  onProgress?: (pct: number, stage: string) => void
): Promise<Uint8Array> {
  // Google CDN enforces burst limits (playback pacing). Audio is ~16KB/s, so asking for
  // 4.6MB (5 minutes of audio) at once triggers pacing 403 Forbidden.
  // 512KB for audio and 2MB for video stays comfortably within Google CDN's allowed burst windows.
  const CHUNK_SIZE = label === 'audio' ? 512 * 1024 : 2 * 1024 * 1024;

  // Parse clen from target url if present
  let knownClen = 0;
  try {
    const parsedUrl = new URL(url);
    const targetParam = parsedUrl.searchParams.get('url');
    if (targetParam) {
      const targetParsed = new URL(targetParam);
      const clen = targetParsed.searchParams.get('clen');
      if (clen) knownClen = parseInt(clen, 10);
    }
  } catch {}

  const initialLimit = (maxBudgetBytes && maxBudgetBytes > 0) ? maxBudgetBytes : (knownClen || CHUNK_SIZE);
  const firstChunkEnd = Math.min(CHUNK_SIZE - 1, initialLimit - 1);

  // First request: download the first chunk directly
  let firstRes: Response | null = null;
  let retries = 2;
  while (retries >= 0) {
    try {
      firstRes = await fetch(url, {
        headers: { Range: `bytes=0-${firstChunkEnd}` },
      });
      if (firstRes.ok || firstRes.status === 206) break;
    } catch (e) {
      if (retries === 0) throw e;
    }
    retries--;
    await new Promise((r) => setTimeout(r, 400));
  }

  if (!firstRes || (!firstRes.ok && firstRes.status !== 206)) {
    throw new Error(`Failed to fetch ${label}: HTTP ${firstRes?.status || 'Unknown'}`);
  }

  const firstData = await firstRes.arrayBuffer();

  // If server responded with 200 OK (returned full content without partial slicing), return it directly
  if (firstRes.status === 200) {
    onProgress?.(100, `Downloaded ${label}`);
    return new Uint8Array(firstData);
  }

  // Determine total bytes from Content-Range header: "bytes 0-5242879/12345678"
  const contentRange = firstRes.headers.get('Content-Range');
  let totalBytes = knownClen;
  if (contentRange) {
    const parts = contentRange.split('/');
    if (parts.length === 2 && !isNaN(parseInt(parts[1], 10))) {
      totalBytes = parseInt(parts[1], 10);
    }
  }

  // Fallback: try to read clen from the target URL
  if (!totalBytes || isNaN(totalBytes)) {
    totalBytes = knownClen;
  }

  // Determine target bytes: if a clip budget is specified and within totalBytes, only download that portion!
  const targetBytes = (maxBudgetBytes && maxBudgetBytes > 0 && maxBudgetBytes < totalBytes)
    ? maxBudgetBytes
    : (totalBytes || firstData.byteLength);

  // If file/budget is covered by the first chunk, we are already done!
  if (targetBytes <= firstData.byteLength) {
    onProgress?.(100, `Downloaded ${label}`);
    return new Uint8Array(firstData);
  }

  // Allocate buffer for multi-chunk streams up to targetBytes
  const buffer = new Uint8Array(targetBytes);
  buffer.set(new Uint8Array(firstData), 0);
  let downloadedBytes = firstData.byteLength;

  const initialPct = Math.min(99, Math.round((downloadedBytes / targetBytes) * 100));
  onProgress?.(initialPct, `Downloading ${label} (${initialPct}%)...`);

  while (downloadedBytes < targetBytes) {
    const start = downloadedBytes;
    const end = Math.min(start + CHUNK_SIZE - 1, targetBytes - 1);

    let chunkRes: Response | null = null;
    let chunkRetries = 2;
    while (chunkRetries >= 0) {
      try {
        chunkRes = await fetch(url, {
          headers: { Range: `bytes=${start}-${end}` },
        });
        if (chunkRes.ok || chunkRes.status === 206) break;
      } catch (e) {
        if (chunkRetries === 0) throw e;
      }
      chunkRetries--;
      await new Promise((r) => setTimeout(r, 400));
    }

    if (chunkRes?.status === 416) {
      console.log(`[trimmer] Reached end of ${label} stream at ${downloadedBytes} bytes`);
      break;
    }

    if (!chunkRes || (!chunkRes.ok && chunkRes.status !== 206)) {
      // If we already downloaded substantial media (at least 80% of budget or >2MB),
      // proceed gracefully with available frames rather than aborting!
      if (downloadedBytes >= Math.min(targetBytes * 0.8, 2 * 1024 * 1024)) {
        console.warn(`[trimmer] Download stopped early at byte ${downloadedBytes}, proceeding with downloaded media`);
        break;
      }
      throw new Error(`Failed to download ${label} segment (${start}-${end}): HTTP ${chunkRes?.status}`);
    }

    const chunkData = await chunkRes.arrayBuffer();
    if (chunkData.byteLength === 0) {
      // Stream reached end
      break;
    }

    buffer.set(new Uint8Array(chunkData), start);
    downloadedBytes += chunkData.byteLength;

    const pct = Math.min(99, Math.round((downloadedBytes / targetBytes) * 100));
    onProgress?.(pct, `Downloading ${label} (${pct}%)...`);
  }

  onProgress?.(100, `Downloaded ${label}`);
  return buffer.subarray(0, downloadedBytes);
}

export async function trimVideo(options: TrimOptions): Promise<{ blob: Blob; filename: string }> {
  const { videoUrl, audioUrl, startTime, endTime, totalDuration, format, onProgress } = options;
  const duration = Math.max(0.1, endTime - startTime);

  // Compute targeted download budget: only download as much media as needed to cover up to endTime
  const totalDur = (totalDuration && totalDuration > 0) ? totalDuration : Math.max(endTime, 1);
  const targetEndSec = Math.min(totalDur, endTime + 10);
  const fractionNeeded = Math.min(1.0, targetEndSec / totalDur);

  // Estimate needed bytes with 35% safety margin for VBR scene complexity + 1MB container header allowance
  // If clipping near the very end (>95% of video), fractionNeeded is 1.0 (downloads full file)
  const computeBudget = (clenApproxBytes: number) => {
    if (fractionNeeded >= 0.95) return undefined;
    return Math.min(clenApproxBytes, Math.ceil(clenApproxBytes * fractionNeeded * 1.35) + 1024 * 1024);
  };

  // Extract approximate content lengths from URL params if available
  const getUrlClen = (streamUrl: string) => {
    try {
      const parsed = new URL(streamUrl);
      const target = parsed.searchParams.get('url');
      if (target) {
        const clen = new URL(target).searchParams.get('clen');
        if (clen) return parseInt(clen, 10);
      }
    } catch {}
    return undefined;
  };

  const videoBudget = computeBudget(getUrlClen(videoUrl) || (totalDur * 320 * 1024));
  const audioBudget = audioUrl ? computeBudget(getUrlClen(audioUrl) || (totalDur * 20 * 1024)) : undefined;

  onProgress?.(5, 'Initializing WebAssembly engine...');
  const ffmpeg = await getFFmpeg();

  onProgress?.(10, 'Fetching video stream in chunks...');
  const videoData = await fetchStreamChunked(videoUrl, 'video', videoBudget, (pct) => {
    onProgress?.(Math.min(50, 10 + Math.round(pct * 0.4)), `Downloading video (${pct}%)...`);
  });
  await ffmpeg.writeFile('input_video.mp4', videoData);

  let hasAudio = false;
  if (audioUrl && format !== 'audio') {
    onProgress?.(52, 'Fetching audio stream in chunks...');
    const audioData = await fetchStreamChunked(audioUrl, 'audio', audioBudget, (pct) => {
      onProgress?.(Math.min(75, 52 + Math.round(pct * 0.23)), `Downloading audio (${pct}%)...`);
    });
    await ffmpeg.writeFile('input_audio.m4a', audioData);
    hasAudio = true;
  } else if (format === 'audio') {
    onProgress?.(30, 'Fetching audio stream in chunks...');
    const audioData = await fetchStreamChunked(audioUrl || videoUrl, 'audio', audioBudget, (pct) => {
      onProgress?.(Math.min(75, 30 + Math.round(pct * 0.45)), `Downloading audio (${pct}%)...`);
    });
    await ffmpeg.writeFile('input_audio.m4a', audioData);
  }

  onProgress?.(80, 'Trimming and muxing streams (lossless)...');

  const startStr = startTime.toFixed(3);
  const durationStr = duration.toFixed(3);

  let outputFileName = 'output.mp4';
  let mimeType = 'video/mp4';
  let args: string[] = [];

  if (format === 'audio') {
    outputFileName = 'output.m4a';
    mimeType = 'audio/mp4';
    args = [
      '-ss', startStr,
      '-i', 'input_audio.m4a',
      '-t', durationStr,
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      outputFileName,
    ];
  } else {
    // Lossless MP4 mux (direct copy of native H.264 video + AAC audio)
    outputFileName = 'output.mp4';
    mimeType = 'video/mp4';
    if (hasAudio) {
      args = [
        '-ss', startStr,
        '-i', 'input_video.mp4',
        '-ss', startStr,
        '-i', 'input_audio.m4a',
        '-t', durationStr,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        '-movflags', '+faststart',
        outputFileName,
      ];
    } else {
      args = [
        '-ss', startStr,
        '-i', 'input_video.mp4',
        '-t', durationStr,
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        '-movflags', '+faststart',
        outputFileName,
      ];
    }
  }

  try {
    const exitCode = await ffmpeg.exec(args);
    if (exitCode !== 0) {
      throw new Error(`FFmpeg trimming failed with exit code ${exitCode}`);
    }

    const data = await ffmpeg.readFile(outputFileName);
    const fileBytes = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data);
    const blob = new Blob([fileBytes.buffer as ArrayBuffer], { type: mimeType });

    onProgress?.(100, 'Done!');
    return {
      blob,
      filename: `yt-cut-${Date.now()}.${format === 'audio' ? 'm4a' : 'mp4'}`,
    };
  } finally {
    // Cleanup virtual file system to free browser memory
    try {
      await ffmpeg.deleteFile('input_video.mp4');
    } catch {}
    try {
      await ffmpeg.deleteFile('input_audio.m4a');
    } catch {}
    try {
      await ffmpeg.deleteFile(outputFileName);
    } catch {}
  }
}
