import React from 'react';

interface SamplePromptProps {
  onSelect: (url: string) => void;
}

const SAMPLE_URL = 'https://youtu.be/dQw4w9WgXcQ';
const SAMPLE_TITLE = 'Never Gonna Give You Up';

export default function SamplePrompt({ onSelect }: SamplePromptProps) {
  return (
    <div className="flex items-center justify-center text-[11px] text-zinc-500 mb-8">
      <button
        type="button"
        onClick={() => onSelect(SAMPLE_URL)}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900/60 border border-white/[0.08] hover:border-white/20 hover:text-zinc-300 text-zinc-400 transition-colors group"
      >
        <span className="text-zinc-500">Sample:</span>
        <span className="text-zinc-300 font-medium group-hover:underline">{SAMPLE_TITLE}</span>
        <span className="text-zinc-600 font-mono text-[10px]">→</span>
      </button>
    </div>
  );
}
