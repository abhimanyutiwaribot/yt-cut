import React from 'react';

interface ErrorMessageProps {
  error: string;
  onDismiss: () => void;
}

export default function ErrorMessage({ error, onDismiss }: ErrorMessageProps) {
  return (
    <div className="mb-6 p-3.5 rounded-xl bg-zinc-900/90 border border-white/[0.12] text-xs flex items-start gap-3 backdrop-blur-xl shadow-xl">
      <div className="w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 font-mono text-xs font-semibold mt-0.5">
        !
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-zinc-200">Unable to load stream</div>
        <div className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">{error}</div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-zinc-500 hover:text-zinc-300 text-xs px-1"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
