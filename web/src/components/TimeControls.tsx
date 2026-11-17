import React from 'react';
import { formatTime } from '../lib/trimmer';

interface TimeControlsProps {
  startTime: number;
  endTime: number;
  selectedDuration: number;
  onNudge: (target: 'start' | 'end', delta: number) => void;
  onSeek: (seconds: number) => void;
  onPreset: (seconds: number) => void;
}

const PRESETS = [15, 30, 60, 300];

export default function TimeControls({
  startTime,
  endTime,
  selectedDuration,
  onNudge,
  onSeek,
  onPreset,
}: TimeControlsProps) {
  return (
    <div className="space-y-3">
      {/* Timeline Header with Timecode Counters & Presets */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-mono text-zinc-400">
          <span className="text-zinc-600 uppercase text-[10px] tracking-wider">Clip Duration:</span>
          <span className="text-zinc-100 font-semibold bg-white/[0.08] border border-white/10 px-2 py-0.5 rounded">
            {formatTime(selectedDuration)}
          </span>
        </div>

        {/* Quick Preset Chips */}
        <div className="flex items-center gap-1 font-mono text-[10px]">
          <span className="text-zinc-600 hidden sm:inline mr-1">Presets:</span>
          {PRESETS.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => onPreset(sec)}
              className="px-2 py-0.5 rounded bg-zinc-900 border border-white/[0.06] text-zinc-400 hover:text-zinc-100 hover:border-white/20 transition-colors"
            >
              {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
            </button>
          ))}
        </div>
      </div>

      {/* Numerical Timecode Inputs with Precision Nudge Buttons */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        {/* Start Timebox */}
        <div className="bg-zinc-900/60 border border-white/[0.08] rounded-xl p-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">IN</span>
            <button
              type="button"
              onClick={() => onSeek(startTime)}
              className="font-mono text-xs text-zinc-100 hover:text-white font-medium hover:underline tracking-tight"
              title="Click to jump video to this timestamp"
            >
              {formatTime(startTime)}
            </button>
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px]">
            <button
              type="button"
              onClick={() => onNudge('start', -1)}
              className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
              title="Nudge -1 second"
            >
              -1
            </button>
            <button
              type="button"
              onClick={() => onNudge('start', 1)}
              className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
              title="Nudge +1 second"
            >
              +1
            </button>
          </div>
        </div>

        {/* End Timebox */}
        <div className="bg-zinc-900/60 border border-white/[0.08] rounded-xl p-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">OUT</span>
            <button
              type="button"
              onClick={() => onSeek(endTime)}
              className="font-mono text-xs text-zinc-100 hover:text-white font-medium hover:underline tracking-tight"
              title="Click to jump video to this timestamp"
            >
              {formatTime(endTime)}
            </button>
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px]">
            <button
              type="button"
              onClick={() => onNudge('end', -1)}
              className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
              title="Nudge -1 second"
            >
              -1
            </button>
            <button
              type="button"
              onClick={() => onNudge('end', 1)}
              className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
              title="Nudge +1 second"
            >
              +1
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
