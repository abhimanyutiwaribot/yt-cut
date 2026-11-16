import React, { useState, useRef, useEffect, useCallback } from 'react';
import { trimVideo, formatTime } from '../lib/trimmer';

interface StreamVideo {
  url: string;
  mimeType: string;
  bitrate: number;
  height: number;
  qualityLabel?: string;
  contentLength?: number;
}

interface StreamAudio {
  url: string;
  mimeType: string;
  bitrate: number;
}

interface VideoData {
  videoId: string;
  title: string;
  author: string;
  durationSeconds: number;
  thumbnailUrl: string;
  maxClipDurationSeconds: number;
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

const API_BASE = import.meta.env.PUBLIC_API_URL || 'http://localhost:8787';

export default function Cutter() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<VideoData | null>(null);

  // Trimming timeline state (in seconds)
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(60);
  const [format, setFormat] = useState<'best' | '1080p' | '720p' | 'audio'>('best');
  const [isPlayingClip, setIsPlayingClip] = useState(false);

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState('');

  // Refs
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeHandleRef = useRef<'start' | 'end' | null>(null);
  const playheadTimerRef = useRef<number | null>(null);

  // Send command to embedded YouTube player
  const sendPlayerCommand = useCallback((func: string, args: any[] = []) => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*'
    );
  }, []);

  const seekPlayer = useCallback((seconds: number) => {
    sendPlayerCommand('seekTo', [seconds, true]);
  }, [sendPlayerCommand]);

  // Fetch video stream data from worker
  const handleFetch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setError('Please enter a YouTube video URL.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const endpoint = `${API_BASE}/api/info?url=${encodeURIComponent(cleanUrl)}`;
      const res = await fetch(endpoint);
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to fetch video stream info.');
      }

      const info: VideoData = data.data;
      setVideoData(info);

      // Default trim window: first 30 seconds or full video if shorter
      const defaultDuration = Math.min(30, info.durationSeconds);
      setStartTime(0);
      setEndTime(defaultDuration);
    } catch (err: any) {
      setError(err.message || 'Unable to load video. Ensure the URL is valid.');
      setVideoData(null);
    } finally {
      setLoading(false);
    }
  };

  // Preview the clipped segment in the player
  const togglePreviewClip = () => {
    if (isPlayingClip) {
      sendPlayerCommand('pauseVideo');
      setIsPlayingClip(false);
      if (playheadTimerRef.current) clearInterval(playheadTimerRef.current);
    } else {
      seekPlayer(startTime);
      sendPlayerCommand('playVideo');
      setIsPlayingClip(true);

      const clipDurationMs = (endTime - startTime) * 1000;
      if (playheadTimerRef.current) clearTimeout(playheadTimerRef.current);
      playheadTimerRef.current = window.setTimeout(() => {
        sendPlayerCommand('pauseVideo');
        setIsPlayingClip(false);
      }, clipDurationMs);
    }
  };

  // Keep latest timestamps in refs for pointerUp seeking without re-binding
  const startTimeRef = useRef(startTime);
  const endTimeRef = useRef(endTime);
  startTimeRef.current = startTime;
  endTimeRef.current = endTime;

  // Timeline dragging logic — only update UI state during drag, seek player on release
  const handlePointerDown = (handle: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault();
    activeHandleRef.current = handle;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!activeHandleRef.current || !trackRef.current || !videoData) return;

    const rect = trackRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSeconds = pos * videoData.durationSeconds;
    const maxClip = videoData.maxClipDurationSeconds || 600;

    if (activeHandleRef.current === 'start') {
      const newStart = Math.min(targetSeconds, endTime - 0.5);
      const boundedStart = endTime - newStart <= maxClip ? newStart : endTime - maxClip;
      const cleanStart = Math.max(0, Math.round(boundedStart * 10) / 10);
      setStartTime(cleanStart);
      // Do NOT seek player on every mouse pixel to prevent API spam
    } else if (activeHandleRef.current === 'end') {
      const newEnd = Math.max(targetSeconds, startTime + 0.5);
      const boundedEnd = newEnd - startTime <= maxClip ? newEnd : startTime + maxClip;
      const cleanEnd = Math.min(videoData.durationSeconds, Math.round(boundedEnd * 10) / 10);
      setEndTime(cleanEnd);
      // Do NOT seek player on every mouse pixel to prevent API spam
    }
  }, [endTime, startTime, videoData]);

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeHandleRef.current) {
      const handle = activeHandleRef.current;
      activeHandleRef.current = null;

      // Seek player once on release
      if (handle === 'start') {
        seekPlayer(startTimeRef.current);
      } else {
        seekPlayer(endTimeRef.current);
      }

      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Trigger download process
  const handleDownload = async () => {
    if (!videoData) return;

    setError(null);
    setProcessing(true);
    setProgressPercent(0);
    setProgressStage('Preparing stream...');

    try {
      // Determine stream URLs based on selected format
      let rawVideoUrl: string;
      let rawAudioUrl: string | undefined;

      if (format === '720p') {
        if (videoData.streams.progressive) {
          rawVideoUrl = videoData.streams.progressive.url;
          rawAudioUrl = undefined;
        } else if (videoData.streams.video720) {
          rawVideoUrl = videoData.streams.video720.url;
          rawAudioUrl = videoData.streams.best.audio.url;
        } else {
          rawVideoUrl = videoData.streams.best.video.url;
          rawAudioUrl = videoData.streams.best.audio.url;
        }
      } else if (format === 'audio') {
        rawVideoUrl = videoData.streams.audioOnly.url;
        rawAudioUrl = undefined;
      } else {
        // Best / Max Quality (4K, 1440p, 1080p) dual-stream adaptive mux
        rawVideoUrl = videoData.streams.best.video.url;
        rawAudioUrl = videoData.streams.best.audio.url;
      }

      const videoStreamUrl = `${API_BASE}/api/proxy?url=${encodeURIComponent(rawVideoUrl)}`;
      const audioStreamUrl = rawAudioUrl ? `${API_BASE}/api/proxy?url=${encodeURIComponent(rawAudioUrl)}` : undefined;

      const result = await trimVideo({
        videoUrl: videoStreamUrl,
        audioUrl: audioStreamUrl,
        startTime,
        endTime,
        totalDuration: videoData.durationSeconds,
        format,
        onProgress: (pct, stage) => {
          setProgressPercent(pct);
          setProgressStage(stage);
        },
      });

      // Trigger automatic file download
      const downloadUrl = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const ext = format === 'audio' ? 'm4a' : 'mp4';
      a.download = `${videoData.title.replace(/[^\w\s-]/gi, '').slice(0, 40) || 'yt-clip'}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
    } catch (err: any) {
      console.error('[Cutter download error]:', err);
      setError(err.message || 'Error occurred while processing clip in browser.');
    } finally {
      setProcessing(false);
    }
  };

  const duration = videoData ? videoData.durationSeconds : 0;
  const startPercent = duration > 0 ? (startTime / duration) * 100 : 0;
  const endPercent = duration > 0 ? (endTime / duration) * 100 : 100;
  const selectedDuration = Math.max(0, endTime - startTime);
  const maxQualityLabel = videoData?.streams.best.video.qualityLabel || 
    (videoData?.streams.best.video.height ? `${videoData.streams.best.video.height}p` : '1080p');

  return (
    <div className="w-full max-w-[640px] mx-auto">
      {/* URL Input Form */}
      <form onSubmit={handleFetch} className="mb-6">
        <label htmlFor="yt-url" className="sr-only">YouTube Video Link</label>
        <div className="relative flex items-center bg-[#12151e] border border-[#23293a] rounded-xl p-1.5 focus-within:border-[#3b82f6] transition-colors shadow-sm">
          <input
            id="yt-url"
            type="text"
            placeholder="Paste YouTube link (e.g. https://youtu.be/...)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading || processing}
            className="flex-1 bg-transparent px-3.5 py-2 text-sm md:text-base text-[#f8fafc] placeholder-[#64748b] outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || processing || !url.trim()}
            className="px-5 py-2.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] text-white text-sm font-semibold tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Loading</span>
              </>
            ) : (
              <span>Load Video</span>
            )}
          </button>
        </div>
      </form>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-3.5 bg-red-950/40 border border-red-800/60 rounded-lg text-red-200 text-sm flex items-start justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-3 text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Unified Video & Scrubber Workbench Deck */}
      {videoData && (
        <div className="bg-[#12151e] border border-[#23293a] rounded-2xl overflow-hidden shadow-2xl mb-8">
          
          {/* Integrated 16:9 Video Player */}
          <div className="relative w-full aspect-video bg-black">
            <iframe
              ref={iframeRef}
              src={`https://www.youtube-nocookie.com/embed/${videoData.videoId}?enablejsapi=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}&rel=0&modestbranding=1`}
              title={videoData.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0"
            />
          </div>

          {/* Scrubber & Controls Panel */}
          <div className="p-5 md:p-6 space-y-6">
            
            {/* Video Header & Preview Button */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-[#f8fafc] truncate leading-tight">
                  {videoData.title}
                </h2>
                <p className="text-xs text-[#94a3b8] mt-1 truncate">
                  {videoData.author} · {formatTime(videoData.durationSeconds)} duration
                </p>
              </div>

              {/* Play Selection Preview Button */}
              <button
                type="button"
                onClick={togglePreviewClip}
                className="shrink-0 px-3.5 py-1.5 rounded-lg border border-[#23293a] bg-[#090a0f] hover:border-[#3b82f6] text-xs font-medium text-[#f8fafc] transition-colors flex items-center gap-1.5"
                title="Preview only the selected segment"
              >
                <span>{isPlayingClip ? '⏸ Pause Clip' : '▶ Preview Clip'}</span>
              </button>
            </div>

            {/* Draggable Timeline Workbench */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs font-medium">
                <span className="text-[#94a3b8]">Trim Window</span>
                <span className="text-[#60a5fa] font-mono tabular-nums bg-blue-950/60 border border-blue-900/60 px-2.5 py-0.5 rounded-full">
                  {formatTime(selectedDuration)} selected
                </span>
              </div>

              {/* Interactive Scrubber Track */}
              <div
                ref={trackRef}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="relative h-11 bg-[#090a0f] border border-[#23293a] rounded-lg select-none cursor-pointer flex items-center touch-none"
              >
                {/* Active Clip Region */}
                <div
                  className="absolute top-0 bottom-0 bg-[#2563eb]/25 border-y-2 border-[#3b82f6]"
                  style={{
                    left: `${startPercent}%`,
                    width: `${endPercent - startPercent}%`,
                  }}
                />

                {/* Left (Start) Grab Handle */}
                <div
                  onPointerDown={handlePointerDown('start')}
                  style={{ left: `${startPercent}%` }}
                  className="absolute top-0 bottom-0 -ml-3 w-6 bg-[#3b82f6] rounded-l-md cursor-ew-resize flex items-center justify-center shadow-md active:bg-[#60a5fa] z-10"
                  title="Drag to adjust clip start (scrubs video)"
                >
                  <div className="w-0.5 h-4 bg-white/80"></div>
                </div>

                {/* Right (End) Grab Handle */}
                <div
                  onPointerDown={handlePointerDown('end')}
                  style={{ left: `${endPercent}%` }}
                  className="absolute top-0 bottom-0 -ml-3 w-6 bg-[#3b82f6] rounded-r-md cursor-ew-resize flex items-center justify-center shadow-md active:bg-[#60a5fa] z-10"
                  title="Drag to adjust clip end (scrubs video)"
                >
                  <div className="w-0.5 h-4 bg-white/80"></div>
                </div>
              </div>

              {/* Precise Timecode Displays with Seek Buttons */}
              <div className="flex items-center justify-between text-xs text-[#94a3b8]">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider">Start:</span>
                  <button
                    type="button"
                    onClick={() => seekPlayer(startTime)}
                    className="font-mono tabular-nums text-[#f8fafc] bg-[#090a0f] border border-[#23293a] hover:border-[#3b82f6] px-2.5 py-1 rounded"
                    title="Click to jump player to start"
                  >
                    {formatTime(startTime)}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider">End:</span>
                  <button
                    type="button"
                    onClick={() => seekPlayer(endTime)}
                    className="font-mono tabular-nums text-[#f8fafc] bg-[#090a0f] border border-[#23293a] hover:border-[#3b82f6] px-2.5 py-1 rounded"
                    title="Click to jump player to end"
                  >
                    {formatTime(endTime)}
                  </button>
                </div>
              </div>
            </div>

            {/* Output Format Pills */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-2.5">
                Output Format
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setFormat('best')}
                  className={`py-2.5 px-3 rounded-lg border text-left transition-all ${
                    format === 'best' || format === '1080p'
                      ? 'border-[#3b82f6] bg-[#2563eb]/10 text-white shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                      : 'border-[#23293a] bg-[#090a0f] text-[#94a3b8] hover:border-[#333d54]'
                  }`}
                >
                  <div className="text-xs font-semibold flex items-center justify-between">
                    <span>MP4 ({maxQualityLabel})</span>
                    <span className="text-[10px] bg-blue-500/25 text-blue-300 font-mono px-1 py-0.2 rounded uppercase">MAX</span>
                  </div>
                  <div className="text-[11px] text-[#64748b] mt-0.5">Highest Bitrate · Full Res</div>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('720p')}
                  className={`py-2.5 px-3 rounded-lg border text-left transition-all ${
                    format === '720p'
                      ? 'border-[#3b82f6] bg-[#2563eb]/10 text-white shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                      : 'border-[#23293a] bg-[#090a0f] text-[#94a3b8] hover:border-[#333d54]'
                  }`}
                >
                  <div className="text-xs font-semibold">MP4 (720p HD)</div>
                  <div className="text-[11px] text-[#64748b] mt-0.5">Fast Download · Smaller File</div>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('audio')}
                  className={`py-2.5 px-3 rounded-lg border text-left transition-all ${
                    format === 'audio'
                      ? 'border-[#3b82f6] bg-[#2563eb]/10 text-white shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                      : 'border-[#23293a] bg-[#090a0f] text-[#94a3b8] hover:border-[#333d54]'
                  }`}
                >
                  <div className="text-xs font-semibold">Audio Only (M4A)</div>
                  <div className="text-[11px] text-[#64748b] mt-0.5">Original AAC · Lossless</div>
                </button>
              </div>
            </div>

            {/* Action Button & Processing Bar */}
            <div className="pt-2">
              {processing ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-[#94a3b8]">
                    <span>{progressStage}</span>
                    <span className="font-mono tabular-nums">{progressPercent}%</span>
                  </div>
                  <div className="h-2 w-full bg-[#090a0f] border border-[#23293a] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#3b82f6] transition-all duration-200"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] text-white font-semibold text-base transition-colors shadow-lg shadow-blue-900/20"
                >
                  Trim & Download Clip
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
