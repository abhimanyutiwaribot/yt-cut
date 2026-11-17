import React from 'react';
import type { FormatOption } from '../types/video';
import { formatTime } from '../lib/trimmer';

interface ExportBarProps {
  processing: boolean;
  progressPercent: number;
  progressStage: string;
  selectedDuration: number;
  format: FormatOption;
  onDownload: () => void;
}

export default function ExportBar({
  processing,
  progressPercent,
  progressStage,
  selectedDuration,
  format,
  onDownload,
}: ExportBarProps) {
  return (
    <div className="pt-1">
      {processing ? (
        <div className="bg-zinc-900/80 border border-white/[0.1] rounded-2xl p-5 space-y-3 backdrop-blur-xl shadow-xl">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-300 font-medium flex items-center gap-2">
              <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{progressStage}</span>
            </span>
            <span className="font-mono text-zinc-400 tabular-nums font-semibold">{progressPercent}%</span>
          </div>

          <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="text-[11px] text-zinc-500 font-mono text-center">
            Executing in client WebAssembly · 0 bytes stored on server
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onDownload}
          className="w-full py-3.5 px-6 rounded-2xl bg-white text-zinc-950 hover:bg-zinc-100 active:scale-[0.99] font-medium text-sm transition-all shadow-[0_2px_12px_rgba(255,255,255,0.1)] flex items-center justify-center gap-2 cursor-pointer"
        >
          <svg className="w-4 h-4 text-zinc-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Export {formatTime(selectedDuration)} Clip</span>
          <span className="text-zinc-500 font-mono text-xs font-normal">({format === 'audio' ? 'M4A' : 'MP4'})</span>
        </button>
      )}
    </div>
  );
}
