import React from 'react';
import { formatTime } from '../lib/trimmer';

interface TimelineScrubberProps {
  trackRef: React.RefObject<HTMLDivElement | null>;
  startPercent: number;
  endPercent: number;
  startTime: number;
  endTime: number;
  draggingHandle: 'start' | 'end' | 'range' | null;
  onStartDrag: (handle: 'start' | 'end' | 'range') => (e: React.PointerEvent) => void;
  onTrackClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export default function TimelineScrubber({
  trackRef,
  startPercent,
  endPercent,
  startTime,
  endTime,
  draggingHandle,
  onStartDrag,
  onTrackClick,
}: TimelineScrubberProps) {
  return (
    <div className="relative pt-2 pb-1 select-none">
      {/* Visual Tick Mark Ruler along the Track */}
      <div className="flex justify-between items-end h-2 px-1 mb-1.5 opacity-30 pointer-events-none">
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
        onClick={onTrackClick}
        className="relative h-12 bg-zinc-900/90 border border-white/[0.1] rounded-xl cursor-pointer flex items-center overflow-visible touch-none shadow-inner"
      >
        {/* Subtle simulated waveform texture in background */}
        <div className="absolute inset-0 rounded-xl overflow-hidden opacity-[0.07] flex items-center justify-between px-2 pointer-events-none">
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

        {/* Unified Selection Assembly: The Slider Window and Both Handles move in absolute lockstep */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-0 bottom-0 select-none touch-none z-10"
          style={{
            left: `${startPercent}%`,
            width: `${Math.max(0, endPercent - startPercent)}%`,
          }}
        >
          {/* Middle Highlight Selection Zone (Draggable Slider Window) */}
          <div
            onPointerDown={onStartDrag('range')}
            className={`w-full h-full border-y-2 border-white/70 bg-white/[0.14] backdrop-blur-[2px] ${
              draggingHandle === 'range'
                ? 'cursor-grabbing bg-white/[0.22] border-white'
                : 'cursor-grab hover:bg-white/[0.18]'
            }`}
            title="Drag to slide clip window"
          >
            {/* Center Knurled/Grip indicator */}
            <div className="w-full h-full flex items-center justify-center opacity-40 pointer-events-none">
              <div className="flex gap-1 items-center">
                <div className="w-1 h-3 rounded-full bg-white/60" />
                <div className="w-1 h-3 rounded-full bg-white/60" />
                <div className="w-1 h-3 rounded-full bg-white/60" />
              </div>
            </div>

            {/* Floating Duration / Range Badge when sliding range */}
            {draggingHandle === 'range' && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-zinc-950 font-mono text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xl whitespace-nowrap pointer-events-none after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-white">
                {formatTime(startTime)} – {formatTime(endTime)}
              </div>
            )}
          </div>

          {/* Left (Start) In-Point Handle */}
          <div
            onPointerDown={onStartDrag('start')}
            className={`absolute top-0 bottom-0 left-0 -translate-x-1/2 w-6 bg-gradient-to-b from-white via-zinc-100 to-zinc-200 text-zinc-950 rounded-xl cursor-ew-resize flex items-center justify-center z-20 shadow-[0_2px_8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] border border-white/80 select-none ${
              draggingHandle === 'start'
                ? 'ring-2 ring-white shadow-[0_0_16px_rgba(255,255,255,0.5)] scale-105'
                : 'hover:scale-105 active:scale-105'
            }`}
            style={{ touchAction: 'none' }}
            title="Drag to adjust Start timestamp"
          >
            {/* Tactile Knurled Grip Ridges (3 Embossed Grooves) */}
            <div className="flex gap-[2px] items-center pointer-events-none">
              <div className="w-[1.5px] h-4 bg-zinc-600 rounded-full shadow-[0.5px_0.5px_0_rgba(255,255,255,0.8)]" />
              <div className="w-[1.5px] h-4 bg-zinc-600 rounded-full shadow-[0.5px_0.5px_0_rgba(255,255,255,0.8)]" />
              <div className="w-[1.5px] h-4 bg-zinc-600 rounded-full shadow-[0.5px_0.5px_0_rgba(255,255,255,0.8)]" />
            </div>

            {/* Floating Timestamp Badge with downward arrow */}
            {draggingHandle === 'start' && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-zinc-950 font-mono text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xl whitespace-nowrap pointer-events-none after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-white">
                {formatTime(startTime)}
              </div>
            )}
          </div>

          {/* Right (End) Out-Point Handle */}
          <div
            onPointerDown={onStartDrag('end')}
            className={`absolute top-0 bottom-0 right-0 translate-x-1/2 w-6 bg-gradient-to-b from-white via-zinc-100 to-zinc-200 text-zinc-950 rounded-xl cursor-ew-resize flex items-center justify-center z-20 shadow-[0_2px_8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] border border-white/80 select-none ${
              draggingHandle === 'end'
                ? 'ring-2 ring-white shadow-[0_0_16px_rgba(255,255,255,0.5)] scale-105'
                : 'hover:scale-105 active:scale-105'
            }`}
            style={{ touchAction: 'none' }}
            title="Drag to adjust End timestamp"
          >
            {/* Tactile Knurled Grip Ridges (3 Embossed Grooves) */}
            <div className="flex gap-[2px] items-center pointer-events-none">
              <div className="w-[1.5px] h-4 bg-zinc-600 rounded-full shadow-[0.5px_0.5px_0_rgba(255,255,255,0.8)]" />
              <div className="w-[1.5px] h-4 bg-zinc-600 rounded-full shadow-[0.5px_0.5px_0_rgba(255,255,255,0.8)]" />
              <div className="w-[1.5px] h-4 bg-zinc-600 rounded-full shadow-[0.5px_0.5px_0_rgba(255,255,255,0.8)]" />
            </div>

            {/* Floating Timestamp Badge with downward arrow */}
            {draggingHandle === 'end' && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-zinc-950 font-mono text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xl whitespace-nowrap pointer-events-none after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-white">
                {formatTime(endTime)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
