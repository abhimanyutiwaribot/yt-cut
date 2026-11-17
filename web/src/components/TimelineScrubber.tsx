import React from 'react';
import { formatTime } from '../lib/trimmer';

interface TimelineScrubberProps {
  trackRef: React.RefObject<HTMLDivElement | null>;
  startPercent: number;
  endPercent: number;
  startTime: number;
  endTime: number;
  draggingHandle: 'start' | 'end' | null;
  onPointerDown: (handle: 'start' | 'end') => (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

export default function TimelineScrubber({
  trackRef,
  startPercent,
  endPercent,
  startTime,
  endTime,
  draggingHandle,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: TimelineScrubberProps) {
  return (
    <div className="relative pt-2 pb-1 select-none">
      {/* Visual Tick Mark Ruler along the Track */}
      <div className="flex justify-between items-end h-2 px-1 mb-1.5 opacity-30">
        {Array.from({ length: 21 }).map((_, i) => (
          <div
            key={i}
            className={`w-[1px] bg-white ${i % 5 === 0 ? 'h-2 opacity-100' : 'h-1 opacity-50'}`}
          />
        ))}
      </div>

      {/* Interactive Scrubber Track Bar */}
      <div
        ref={trackRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative h-12 bg-zinc-900/90 border border-white/[0.1] rounded-xl cursor-pointer flex items-center overflow-visible touch-none shadow-inner"
      >
        {/* Subtle simulated waveform texture in background */}
        <div className="absolute inset-0 opacity-[0.07] flex items-center justify-between px-2 pointer-events-none">
          {Array.from({ length: 48 }).map((_, i) => {
            const heights = [30, 60, 40, 80, 50, 90, 70, 45, 65, 85];
            const h = heights[i % heights.length];
            return (
              <div
                key={i}
                style={{ height: `${h}%` }}
                className="w-[2px] bg-white rounded-full"
              />
            );
          })}
        </div>

        {/* Active Highlight Selection Zone */}
        <div
          className="absolute top-0 bottom-0 bg-white/[0.12] border-y border-white/50 backdrop-blur-[1px]"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        />

        {/* Left (Start) In-Point Handle */}
        <div
          onPointerDown={onPointerDown('start')}
          style={{ left: `${startPercent}%` }}
          className="absolute top-0 bottom-0 -ml-3.5 w-7 bg-zinc-100 text-zinc-950 rounded-l-lg cursor-ew-resize flex items-center justify-center shadow-lg active:scale-105 transition-transform z-20 group"
          title="Drag to adjust Start timestamp"
        >
          {/* Knurled Grip Ridges */}
          <div className="flex gap-[2px]">
            <div className="w-[1px] h-4 bg-zinc-500"></div>
            <div className="w-[1px] h-4 bg-zinc-500"></div>
          </div>

          {/* Floating Hover/Drag Badge */}
          {draggingHandle === 'start' && (
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-white text-zinc-950 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shadow-md whitespace-nowrap pointer-events-none">
              {formatTime(startTime)}
            </div>
          )}
        </div>

        {/* Right (End) Out-Point Handle */}
        <div
          onPointerDown={onPointerDown('end')}
          style={{ left: `${endPercent}%` }}
          className="absolute top-0 bottom-0 -ml-3.5 w-7 bg-zinc-100 text-zinc-950 rounded-r-lg cursor-ew-resize flex items-center justify-center shadow-lg active:scale-105 transition-transform z-20 group"
          title="Drag to adjust End timestamp"
        >
          {/* Knurled Grip Ridges */}
          <div className="flex gap-[2px]">
            <div className="w-[1px] h-4 bg-zinc-500"></div>
            <div className="w-[1px] h-4 bg-zinc-500"></div>
          </div>

          {/* Floating Hover/Drag Badge */}
          {draggingHandle === 'end' && (
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-white text-zinc-950 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shadow-md whitespace-nowrap pointer-events-none">
              {formatTime(endTime)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
