import React from 'react';
import type { VideoData } from '../types/video';
import { formatTime } from '../lib/trimmer';

interface VideoPreviewProps {
  videoData: VideoData;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  maxQualityLabel: string;
  isPlayingClip: boolean;
  onTogglePreview: () => void;
}

export default function VideoPreview({
  videoData,
  iframeRef,
  maxQualityLabel,
  isPlayingClip,
  onTogglePreview,
}: VideoPreviewProps) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoData.videoId}?enablejsapi=1&origin=${encodeURIComponent(origin)}&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1`;

  return (
    <div>
      {/* Header Slate */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-3 bg-zinc-950/60">
        <div className="min-w-0 flex-1">
          <h2 className="text-xs sm:text-sm font-medium text-zinc-100 truncate" title={videoData.title}>
            {videoData.title}
          </h2>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] font-mono text-zinc-500">
            <span className="truncate">{videoData.author}</span>
            <span>·</span>
            <span>{formatTime(videoData.durationSeconds)}</span>
          </div>
        </div>

        {/* Quality & Preview Clip Button */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] text-zinc-300 bg-white/[0.06] border border-white/10 px-2 py-0.5 rounded-md uppercase">
            {maxQualityLabel}
          </span>

          <button
            type="button"
            onClick={onTogglePreview}
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all flex items-center gap-1.5 ${
              isPlayingClip
                ? 'bg-white text-zinc-950 border-white font-medium shadow-sm'
                : 'bg-zinc-800/80 border-white/[0.08] text-zinc-200 hover:border-white/20'
            }`}
            title="Play isolated clip segment (Space)"
          >
            <span>{isPlayingClip ? '⏸' : '▶'}</span>
            <span>{isPlayingClip ? 'Playing' : 'Preview'}</span>
          </button>
        </div>
      </div>

      {/* Embedded 16:9 Video Canvas */}
      <div className="relative aspect-video w-full bg-black">
        <iframe
          ref={iframeRef}
          src={embedUrl}
          title={videoData.title}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}
