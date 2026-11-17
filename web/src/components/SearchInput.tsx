import React from 'react';

interface SearchInputProps {
  url: string;
  onChange: (value: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onClear: () => void;
  onPaste: () => void;
  loading: boolean;
  disabled: boolean;
}

export default function SearchInput({
  url,
  onChange,
  onSubmit,
  onClear,
  onPaste,
  loading,
  disabled,
}: SearchInputProps) {
  return (
    <form onSubmit={onSubmit} className="relative z-10 mb-3">
      <div className="group relative flex items-center bg-zinc-900/90 border border-white/[0.1] rounded-2xl p-1.5 focus-within:border-white/30 focus-within:ring-2 focus-within:ring-white/[0.06] transition-all shadow-xl backdrop-blur-xl">
        {/* Link Icon */}
        <div className="pl-3.5 pr-2 text-zinc-500 group-focus-within:text-zinc-200 transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </div>

        <input
          id="yt-url-input"
          type="text"
          value={url}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste YouTube link (video, stream, shorts)..."
          className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none px-2 py-2 font-normal appearance-none"
          style={{ backgroundColor: 'transparent', colorScheme: 'dark' }}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled || loading}
        />

        {/* Quick Paste Clipboard Button */}
        {!url && (
          <button
            type="button"
            onClick={onPaste}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-all mr-1.5 shrink-0"
            title="Paste from clipboard"
          >
            <span>Paste</span>
            <kbd className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-white/10 font-mono">⌘V</kbd>
          </button>
        )}

        {/* Clear button if URL present */}
        {url && !loading && (
          <button
            type="button"
            onClick={onClear}
            className="text-zinc-500 hover:text-zinc-300 px-2 py-1.5 text-xs mr-1"
            title="Clear input"
          >
            ✕
          </button>
        )}

        {/* Submit Action (mobile-responsive) */}
        <button
          type="submit"
          disabled={loading || disabled}
          className="shrink-0 px-3 sm:px-4 py-2 bg-white text-zinc-950 hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-50 text-xs font-medium rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
          aria-label="Load video"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-zinc-950" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="hidden sm:inline">Loading...</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">Load</span>
              <span className="font-mono text-xs">↵</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
