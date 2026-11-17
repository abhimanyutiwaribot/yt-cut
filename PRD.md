# Product Requirements Document (PRD)

## YT-CUT

| Field | Detail |
|---|---|
| **Project Name** | YT-CUT |
| **Version** | 1.0 |
| **Date** | 2026-11-16 |
| **Status** | Draft |

---

## 1. Overview

**YT-CUT** is a zero-infrastructure, browser-based utility that lets users trim any YouTube video or live stream by pasting a link, selecting a time range via a draggable timeline, and instantly downloading the clipped segment — with no sign-up, no account, and no server handling video bytes.

---

## 2. Problem Statement

Users who want to save a specific clip from a YouTube video or live stream face a fragmented, ad-cluttered, login-walled experience across existing tools. YT-CUT solves this with a single, frictionless, in-browser experience that delivers lossless quality at zero infrastructure cost.

---

## 3. Goals & Non-Goals

### Goals
- Allow anyone to clip a YouTube video or live stream with zero friction.
- Provide a draggable, visual timeline for timestamp selection.
- Deliver the clipped video at the **highest quality without re-encoding** (lossless).
- Cap maximum quality at **1080p** for browser memory safety.
- No authentication, no account, no sign-up.
- Zero server-side video processing — all trimming happens in the browser.

### Non-Goals
- 4K / HDR support (out of scope for v1.0).
- Supporting platforms other than YouTube (v1.0 scope).
- Editing features beyond trimming (subtitles, filters, overlays, etc.).
- Mobile native apps (web-first for v1.0).
- Server-side video storage or processing.

---

## 4. Target Users

| Persona | Description |
|---|---|
| **Casual viewer** | Wants to save a memorable moment quickly, no technical know-how. |
| **Content creator** | Clips reference material or repurposes segments. |
| **Researcher / journalist** | Needs an exact excerpt from a video or live stream archive. |

---

## 5. User Flow

```
1. User lands on YT-CUT homepage
2. User pastes a YouTube video or live stream URL
3. App calls Cloudflare Worker → extracts direct stream URL from YouTube
4. Browser fetches video metadata and renders a preview player + timeline
5. User drags Start and End handles on the timeline to select a clip range
6. User clicks "Download"
7. ffmpeg.wasm (running in-browser) fetches only the selected byte range,
   merges video + audio streams, and saves the file to the user's device
```

> [!IMPORTANT]
> Video bytes **never pass through any server**. The browser fetches directly from YouTube's CDN. The Cloudflare Worker only extracts and returns the stream URL.

---

## 6. Architecture

### High-Level

```
┌──────────────────────────────────────────────────────┐
│                    User's Browser                    │
│                                                      │
│  1. Paste URL                                        │
│  2. Call CF Worker → receives stream URL             │
│  3. Fetch video + audio chunks from YouTube CDN ─────│──► YouTube CDN
│  4. ffmpeg.wasm trims & muxes in-browser             │    (direct, no proxy)
│  5. File saved to user's Downloads                   │
└──────────────────────────────────────────────────────┘
              │
              │ only URL extraction (no video bytes)
              ▼
┌──────────────────────────────────────────────────────┐
│           Cloudflare Worker (free tier)              │
│  - Receives YouTube URL                              │
│  - Uses youtubei.js to call YouTube's internal API   │
│  - Decodes stream signatures                         │
│  - Returns direct VP9/Opus stream URLs               │
└──────────────────────────────────────────────────────┘
```

### Stack

| Layer | Technology | Cost |
|---|---|---|
| Frontend | React + ffmpeg.wasm | Free |
| Static hosting | Cloudflare Pages / Vercel | Free |
| Stream URL extraction | Cloudflare Worker + `youtubei.js` | Free (100k req/day) |
| Video trimming & muxing | `ffmpeg.wasm` (in-browser WebAssembly) | Free |
| Video delivery | YouTube's CDN (direct browser fetch) | Free |
| Domain | Cloudflare / Namecheap | ~\$10/year |

**Total infra cost: ~\$10/year**

---

## 7. Functional Requirements

### 7.1 URL Input
- Accept any valid `youtube.com/watch?v=` or `youtu.be/` URL.
- Accept YouTube live stream URLs.
- Validate the URL and show a clear error if unsupported or private.

### 7.2 Stream Extraction (Cloudflare Worker)
- Use `youtubei.js` (pure JS, runs in CF Workers) to extract DASH stream URLs.
- Return the best available video stream ≤ 1080p and the best audio stream.
- Handle signature decryption transparently.

### 7.3 Video Preview & Timeline
- Render a seekable video preview player in the browser.
- Display a draggable timeline with **Start** and **End** handles.
- Show selected duration in real-time (e.g., `00:12 → 01:45 | 1m 33s`).
- Allow typing exact timestamps for precision.

### 7.4 Quality
- Default to best available stream **up to 1080p** (VP9 or AV1 codec).
- **No quality cap below 1080p** — always use the highest available within the limit.
- 4K and HDR are explicitly out of scope.

### 7.5 Clip Processing (In-Browser via ffmpeg.wasm)
- Fetch only the byte range corresponding to the selected time window (HTTP range requests).
- Merge video-only and audio-only DASH streams using `ffmpeg -c copy` — **no re-encoding**.
- Output format: **`.webm`** (VP9 + Opus) — lossless, instant, no generation loss.
- Optional: `.mp4` (H.264 + AAC) mode with a warning that it requires re-encoding and will be slower.
- Show an in-browser progress indicator during fetch + mux.
- Trigger browser file download on completion.

### 7.6 Audio-Only Mode
- Offer an audio-only download option (Opus or MP3).
- Processes instantly — tiny file, zero quality loss in Opus mode.

### 7.7 Error Handling
- Private / region-locked / unavailable video → clear error message.
- Processing failure → retry option with descriptive error.
- Clip duration limit: enforce a **10-minute maximum** to protect browser memory.
- Warn users if the browser memory may be insufficient for the selected clip.

---

## 8. Quality Tiers

| Tier | Codec | Output | Method | Quality |
|---|---|---|---|---|
| 🥇 **Best Quality** (default) | VP9 / AV1 + Opus | `.webm` | `-c copy`, no re-encode | **Lossless** |
| 🥈 **MP4 Compatible** (optional) | H.264 + AAC | `.mp4` | Re-encoded | Slight loss, slower |
| 🎵 **Audio Only** | Opus / MP3 | `.opus` / `.mp3` | `-c copy` | Lossless |

> [!NOTE]
> The default `.webm` output is **identical in quality to what YouTube streams**. The MP4 option introduces one generation of re-compression and is significantly slower to process in-browser.

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Quality** | Default output is lossless — no re-encoding of video stream. |
| **Performance** | Clip muxing should complete within seconds for clips ≤ 10 min at 1080p. |
| **Privacy** | No user data stored. No logs tied to identity. Video bytes never touch any server. |
| **Availability** | Cloudflare Worker free tier (100k req/day); Cloudflare Pages 99.9%+ uptime. |
| **Compatibility** | Support Chrome, Firefox, Edge, Safari (desktop). |
| **Legal / ToS** | Display a disclaimer that users are responsible for compliance with YouTube's ToS and applicable copyright law. |

---

## 10. UI / UX Requirements

- **Minimal, single-page design** — no distractions, no ads, no signup prompts.
- Dark or neutral theme — video-focused aesthetic.
- Timeline handles must be drag-friendly on desktop.
- Responsive layout (desktop-first, mobile-friendly).
- Show clear progress states: fetching → processing → ready to download.

---

## 11. Constraints & Risks

| Risk | Mitigation |
|---|---|
| YouTube updates signature algorithm | Monitor `youtubei.js` releases; update Worker promptly when broken. |
| CF Worker 10ms CPU limit | `youtubei.js` is lightweight JS — URL extraction fits well within the limit. |
| Browser memory limits on long clips | Enforce 10-minute clip cap; fetch only the needed byte range, not the full video. |
| YouTube CORS blocking direct browser fetch | Route the initial stream fetch through the CF Worker as a lightweight proxy if needed. |
| `.webm` compatibility on older iOS / legacy apps | Surface the optional `.mp4` re-encode mode with a clear warning. |

---

## 12. Success Metrics

| Metric | Target |
|---|---|
| Clip processed successfully (% of valid requests) | ≥ 95% |
| Time from "Download" click to file saved (short clip, 1080p) | < 30 seconds |
| Bounce rate | < 40% |
| User-reported errors per 100 sessions | < 5 |

---

## 13. Out of Scope (Future Versions)

- 4K / HDR support.
- Multi-platform support (Vimeo, Twitch, Twitter/X).
- Cloud save / shareable clip links.
- Batch clipping (multiple clips from one video).
- Browser extension.
- Mobile native app.
- Frame-precise trimming (smart GOP-aware trim).

---

> [!IMPORTANT]
> Core architectural principle: **the server never touches video bytes**. All video fetching, trimming, and muxing happens inside the user's browser via ffmpeg.wasm. The Cloudflare Worker's sole responsibility is YouTube stream URL extraction.
