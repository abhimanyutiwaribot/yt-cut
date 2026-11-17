import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { VideoData, FormatOption } from '../types/video';
import { trimVideo } from '../lib/trimmer';
import SearchInput from './SearchInput';
import SamplePrompt from './SamplePrompt';
import ErrorMessage from './ErrorMessage';
import VideoPreview from './VideoPreview';
import TimelineScrubber from './TimelineScrubber';
import TimeControls from './TimeControls';
import FormatSelector from './FormatSelector';
import ExportBar from './ExportBar';

const API_BASE = import.meta.env.PUBLIC_API_URL || 'http://localhost:8787';

export default function Cutter() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<VideoData | null>(null);

  // Trimming timeline state (in seconds)
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(30);
  const [format, setFormat] = useState<FormatOption>('best');
  const [isPlayingClip, setIsPlayingClip] = useState(false);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | 'range' | null>(null);

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState('');

  // Refs
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeHandleRef = useRef<'start' | 'end' | 'range' | null>(null);
  const justDraggedRef = useRef<boolean>(false);
  const dragStartOffsetRef = useRef<{ clientX: number; initStart: number; initEnd: number } | null>(null);
  const playheadTimerRef = useRef<number | null>(null);
  const startTimeRef = useRef(startTime);
  const endTimeRef = useRef(endTime);
  startTimeRef.current = startTime;
  endTimeRef.current = endTime;

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
  const fetchVideo = async (targetUrl: string) => {
    const cleanUrl = targetUrl.trim();
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

  const handleFetch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    fetchVideo(url);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        fetchVideo(text);
      }
    } catch {
      const input = document.getElementById('yt-url-input');
      input?.focus();
    }
  };

  // Preview the clipped segment in the player
  const togglePreviewClip = () => {
    if (isPlayingClip) {
      sendPlayerCommand('pauseVideo');
      setIsPlayingClip(false);
      if (playheadTimerRef.current) clearTimeout(playheadTimerRef.current);
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

  // Fluid Window-level pointer dragging logic
  const startDragging = (handle: 'start' | 'end' | 'range') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!videoData || !trackRef.current) return;

    activeHandleRef.current = handle;
    justDraggedRef.current = true;
    setDraggingHandle(handle);

    dragStartOffsetRef.current = {
      clientX: e.clientX,
      initStart: startTimeRef.current,
      initEnd: endTimeRef.current,
    };

    const maxClip = videoData.maxClipDurationSeconds || 600;

    const onPointerMove = (ev: PointerEvent) => {
      if (!trackRef.current || !videoData || !activeHandleRef.current || !dragStartOffsetRef.current) return;
      const currentRect = trackRef.current.getBoundingClientRect();
      const deltaX = ev.clientX - dragStartOffsetRef.current.clientX;
      const deltaSec = (deltaX / currentRect.width) * videoData.durationSeconds;
      const maxClip = videoData.maxClipDurationSeconds || 600;

      if (activeHandleRef.current === 'start') {
        const curEnd = dragStartOffsetRef.current.initEnd;
        let candidateStart = dragStartOffsetRef.current.initStart + deltaSec;
        candidateStart = Math.max(0, Math.min(candidateStart, curEnd - 0.5));
        if (curEnd - candidateStart > maxClip) {
          candidateStart = curEnd - maxClip;
        }
        setStartTime(Math.round(candidateStart * 10) / 10);
      } else if (activeHandleRef.current === 'end') {
        const curStart = dragStartOffsetRef.current.initStart;
        let candidateEnd = dragStartOffsetRef.current.initEnd + deltaSec;
        candidateEnd = Math.min(videoData.durationSeconds, Math.max(candidateEnd, curStart + 0.5));
        if (candidateEnd - curStart > maxClip) {
          candidateEnd = curStart + maxClip;
        }
        setEndTime(Math.round(candidateEnd * 10) / 10);
      } else if (activeHandleRef.current === 'range') {
        const clipLen = dragStartOffsetRef.current.initEnd - dragStartOffsetRef.current.initStart;
        let candidateStart = dragStartOffsetRef.current.initStart + deltaSec;

        if (candidateStart < 0) {
          candidateStart = 0;
        } else if (candidateStart + clipLen > videoData.durationSeconds) {
          candidateStart = videoData.durationSeconds - clipLen;
        }

        const cleanStart = Math.max(0, Math.round(candidateStart * 10) / 10);
        const cleanEnd = Math.min(videoData.durationSeconds, Math.round((cleanStart + clipLen) * 10) / 10);

        setStartTime(cleanStart);
        setEndTime(cleanEnd);
      }
    };

    const onPointerUp = () => {
      const active = activeHandleRef.current;
      activeHandleRef.current = null;
      setDraggingHandle(null);
      dragStartOffsetRef.current = null;

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      if (active === 'start' || active === 'range') {
        seekPlayer(startTimeRef.current);
      } else if (active === 'end') {
        seekPlayer(endTimeRef.current);
      }

      // Suppress trailing click event from modifying handles
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 150);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (justDraggedRef.current || activeHandleRef.current || !trackRef.current || !videoData) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = Math.round(pos * videoData.durationSeconds * 10) / 10;

    const distToStart = Math.abs(targetSec - startTime);
    const distToEnd = Math.abs(targetSec - endTime);
    const maxClip = videoData.maxClipDurationSeconds || 600;

    if (distToStart <= distToEnd) {
      const clean = Math.min(targetSec, endTime - 0.5);
      const bounded = endTime - clean <= maxClip ? clean : endTime - maxClip;
      const finalStart = Math.max(0, Math.round(bounded * 10) / 10);
      setStartTime(finalStart);
      seekPlayer(finalStart);
    } else {
      const clean = Math.max(targetSec, startTime + 0.5);
      const bounded = clean - startTime <= maxClip ? clean : startTime + maxClip;
      const finalEnd = Math.min(videoData.durationSeconds, Math.round(bounded * 10) / 10);
      setEndTime(finalEnd);
      seekPlayer(finalEnd);
    }
  };

  // Preset duration handler
  const handlePresetDuration = (durationSec: number) => {
    if (!videoData) return;
    const maxClip = videoData.maxClipDurationSeconds || 600;
    const boundedDuration = Math.min(durationSec, maxClip, videoData.durationSeconds - startTime);
    const newEnd = Math.round((startTime + boundedDuration) * 10) / 10;
    setEndTime(newEnd);
    seekPlayer(startTime);
  };

  // Nudge handler
  const handleNudge = (target: 'start' | 'end', delta: number) => {
    if (!videoData) return;
    const maxClip = videoData.maxClipDurationSeconds || 600;

    if (target === 'start') {
      const candidate = Math.max(0, Math.min(endTime - 0.5, startTime + delta));
      const bounded = endTime - candidate <= maxClip ? candidate : endTime - maxClip;
      const clean = Math.round(bounded * 10) / 10;
      setStartTime(clean);
      seekPlayer(clean);
    } else {
      const candidate = Math.min(videoData.durationSeconds, Math.max(startTime + 0.5, endTime + delta));
      const bounded = candidate - startTime <= maxClip ? candidate : startTime + maxClip;
      const clean = Math.round(bounded * 10) / 10;
      setEndTime(clean);
      seekPlayer(clean);
    }
  };

  // Keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space' && videoData) {
        e.preventDefault();
        togglePreviewClip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoData, isPlayingClip, startTime, endTime]);

  // Trigger download process
  const handleDownload = async () => {
    if (!videoData) return;

    setError(null);
    setProcessing(true);
    setProgressPercent(0);
    setProgressStage('Initializing stream...');

    try {
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

  const maxQualityLabel = useMemo(() => {
    if (!videoData) return '1080p';
    const best = videoData.streams.best.video;
    if (best.qualityLabel) return best.qualityLabel;
    if (best.height >= 2160) return '4K';
    if (best.height >= 1440) return '1440p';
    if (best.height >= 1080) return '1080p';
    return `${best.height}p`;
  }, [videoData]);

  const estimatedSizeMb = useMemo(() => {
    if (!videoData) return 0;
    const dur = selectedDuration;
    if (format === 'audio') {
      const audioBps = videoData.streams.audioOnly.bitrate || 128000;
      return Math.round((dur * (audioBps / 8)) / (1024 * 1024) * 10) / 10;
    }
    const videoBps = format === '720p'
      ? (videoData.streams.video720?.bitrate || 2500000)
      : (videoData.streams.best.video.bitrate || 4800000);
    const audioBps = videoData.streams.best.audio.bitrate || 128000;
    return Math.round((dur * ((videoBps + audioBps) / 8)) / (1024 * 1024) * 10) / 10;
  }, [videoData, selectedDuration, format]);

  return (
    <div className="w-full">
      {/* Precision Search / Command Bar */}
      <SearchInput
        url={url}
        onChange={setUrl}
        onSubmit={handleFetch}
        onClear={() => { setUrl(''); setVideoData(null); setError(null); }}
        onPaste={handlePasteClipboard}
        loading={loading}
        disabled={processing}
      />

      {/* Single Curated Sample Video Link */}
      {!videoData && !loading && (
        <SamplePrompt
          onSelect={(sampleUrl) => {
            setUrl(sampleUrl);
            fetchVideo(sampleUrl);
          }}
        />
      )}

      {/* Refined Error Notice Box */}
      {error && <ErrorMessage error={error} onDismiss={() => setError(null)} />}

      {/* Studio Editor Deck */}
      {videoData && (
        <div className="space-y-5 animate-in fade-in duration-300">
          <div className="bg-zinc-900/50 border border-white/[0.08] rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl">
            {/* Video Canvas & Preview Slate */}
            <VideoPreview
              videoData={videoData}
              iframeRef={iframeRef}
              maxQualityLabel={maxQualityLabel}
              isPlayingClip={isPlayingClip}
              onTogglePreview={togglePreviewClip}
            />

            {/* NLE Timeline & Timecode Workbench */}
            <div className="p-4 sm:p-5 space-y-4 bg-zinc-950/40 border-t border-white/[0.06]">
              <TimelineScrubber
                trackRef={trackRef}
                startPercent={startPercent}
                endPercent={endPercent}
                startTime={startTime}
                endTime={endTime}
                draggingHandle={draggingHandle}
                onStartDrag={startDragging}
                onTrackClick={handleTrackClick}
              />

              <TimeControls
                startTime={startTime}
                endTime={endTime}
                selectedDuration={selectedDuration}
                onNudge={handleNudge}
                onSeek={seekPlayer}
                onPreset={handlePresetDuration}
              />
            </div>
          </div>

          {/* Segmented Quality / Format Selector */}
          <FormatSelector
            format={format}
            onChange={setFormat}
            maxQualityLabel={maxQualityLabel}
            estimatedSizeMb={estimatedSizeMb}
          />

          {/* Export Action & Progress State */}
          <ExportBar
            processing={processing}
            progressPercent={progressPercent}
            progressStage={progressStage}
            selectedDuration={selectedDuration}
            format={format}
            onDownload={handleDownload}
          />
        </div>
      )}
    </div>
  );
}
