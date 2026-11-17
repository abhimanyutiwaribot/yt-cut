import React from 'react';
import type { FormatOption } from '../types/video';

interface FormatSelectorProps {
  format: FormatOption;
  onChange: (format: FormatOption) => void;
  maxQualityLabel: string;
  estimatedSizeMb: number;
}

export default function FormatSelector({
  format,
  onChange,
  maxQualityLabel,
  estimatedSizeMb,
}: FormatSelectorProps) {
  return (
    <div className="bg-zinc-900/50 border border-white/[0.08] rounded-2xl p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-3 text-xs">
        <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">Export Tier</span>
        <span className="text-[11px] font-mono text-zinc-500">
          Est. Size: <strong className="text-zinc-300 font-medium">~{estimatedSizeMb} MB</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {/* Max Quality / 1080p+ */}
        <button
          type="button"
          onClick={() => onChange('best')}
          className={`py-3 px-3.5 rounded-xl border text-left transition-all ${
            format === 'best' || format === '1080p'
              ? 'border-white/40 bg-white/[0.08] text-white shadow-md'
              : 'border-white/[0.06] bg-zinc-900/50 text-zinc-400 hover:border-white/15 hover:text-zinc-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-zinc-100">
            <span>MP4 ({maxQualityLabel})</span>
            <span className="font-mono text-[9px] bg-white/20 text-white font-bold px-1.5 py-0.5 rounded">MAX</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 leading-tight">
            Lossless Stream Copy · Native Bitrate
          </div>
        </button>

        {/* 720p HD */}
        <button
          type="button"
          onClick={() => onChange('720p')}
          className={`py-3 px-3.5 rounded-xl border text-left transition-all ${
            format === '720p'
              ? 'border-white/40 bg-white/[0.08] text-white shadow-md'
              : 'border-white/[0.06] bg-zinc-900/50 text-zinc-400 hover:border-white/15 hover:text-zinc-300'
          }`}
        >
          <div className="text-xs font-medium text-zinc-100">MP4 (720p HD)</div>
          <div className="text-[10px] text-zinc-500 mt-1 leading-tight">
            Faster Download · Smaller File
          </div>
        </button>

        {/* Audio Only */}
        <button
          type="button"
          onClick={() => onChange('audio')}
          className={`py-3 px-3.5 rounded-xl border text-left transition-all ${
            format === 'audio'
              ? 'border-white/40 bg-white/[0.08] text-white shadow-md'
              : 'border-white/[0.06] bg-zinc-900/50 text-zinc-400 hover:border-white/15 hover:text-zinc-300'
          }`}
        >
          <div className="text-xs font-medium text-zinc-100">Audio Only (M4A)</div>
          <div className="text-[10px] text-zinc-500 mt-1 leading-tight">
            Original AAC Audio · Lossless
          </div>
        </button>
      </div>
    </div>
  );
}
