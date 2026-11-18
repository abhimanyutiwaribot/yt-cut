# Product Requirements Document (PRD)

## YTcut

| Field | Detail |
|---|---|
| **Project Name** | YTcut |
| **Version** | 1.0 (Live / Production) |
| **Date** | 2026-11-17 |
| **Status** | Implemented |
| **Live Frontend** | [https://yt-cut.pages.dev](https://yt-cut.pages.dev) |
| **Repository** | [github.com/abhimanyutiwaribot/yt-cut](https://github.com/abhimanyutiwaribot/yt-cut) |

---

## 1. Overview

**YTcut** is a zero-infrastructure, browser-based web utility that lets users trim YouTube videos by pasting a link, interactively adjusting an in/out clip range on a responsive timeline scrubber, and instantly downloading the trimmed excerpt. 

YTcut requires **no sign-up, no login, no extensions, and no cloud rendering fees**. Video clipping and container muxing are executed directly on the user's client hardware via WebAssembly (`ffmpeg.wasm`), while a lightweight Cloudflare Worker backend resolves stream URLs and proxies byte-range chunks without storing any video data.

---

## 2. Problem Statement

Standard online video downloaders and trimming utilities suffer from:
1. **Ad clutter, scam redirects, and intrusive popups.**
2. **Mandatory sign-ups, subscriptions, or waitlists.**
3. **Heavy backend rendering infrastructure** requiring expensive GPU/CPU servers that store user video clips, creating high maintenance costs and privacy risks.
4. **Poor mobile support**, with timeline scrubber handles that conflict with page scrolling and touch gestures.

YTcut solves this by moving video processing entirely to client-side WebAssembly, paired with a modern, distraction-free minimalist interface that runs seamlessly across both mobile and desktop browsers.

---

## 3. Goals & Non-Goals

### Goals (Implemented in v1.0)
- **Zero-Friction Access:** No authentication, account creation, or payment.
- **In-Browser Client-Side Processing:** All trimming and muxing occurs in the browser using WebAssembly. The server never persists or renders video files.
- **DASH & Progressive Support:** Support clipping 1080p, 720p, 360p video, and standalone audio extraction (`.m4a`).
- **NLE Studio Timeline:** Knurled dual-handle draggable scrubber with lockstep middle sliding window, synchronous YouTube preview seeking, micro-nudge buttons (`±1s`, `±0.1s`), and duration presets (`15s`, `30s`, `60s`, `90s`).
- **Cross-Platform & Mobile-Optimized:** Full touch event support (`touch-none`) on iOS Safari and Android Chrome with zero drag latency or scroll conflicts.
- **Bandwidth-Optimized Range Fetching:** Calculate byte budgets based on selected timestamps, fetching only the necessary chunks via HTTP Range headers rather than whole multi-gigabyte video files.
- **Automated CI/CD:** Push-to-deploy pipeline targeting Cloudflare Workers (API) and Cloudflare Pages (Frontend) with automated Vitest suites.

### Non-Goals (v1.0 Scope)
- 4K / 8K / HDR video processing (capped at 1080p for browser memory safety).
- Video editing features beyond trimming (subtitles, filters, overlays, transitions).
- Non-YouTube platforms (e.g., Vimeo, TikTok, Instagram).
- Cloud storage or shareable shortlinks.
- Native mobile applications (iOS App Store / Android APK).

---

## 4. Target Users

| Persona | Description | Primary Use Case |
|---|---|---|
| **Casual Viewer** | Wants a funny or memorable excerpt for messaging or status updates. | Fast 15s–30s mobile clip downloads without ads. |
| **Content Creator / Editor** | Sources B-roll, interview citations, or podcast soundbites. | Exact timestamp clipping with micro-nudge precision (`±0.1s`). |
| **Researcher / Student** | Cites specific timestamps in lectures or conference streams. | Audio-only or 720p/1080p clip archiving. |

---

## 5. System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Client Browser (Mobile / Desktop)                    │
│                                                                                  │
│  1. Paste YouTube URL                                                            │
│  2. GET /api/info?url=...  ─────────────────────────┐                            │
│  3. Embedded YouTube Preview (IFrame API)           │                            │
│  4. Select Clip Window (Timeline Scrubber)          │                            │
│  5. Click "Download Cut"                            │                            │
│  6. Smart Byte Budget Range Fetch                   ▼                            │
│     GET /api/proxy?url=... (Range: bytes=...) ───► Cloudflare Worker             │
│  7. WebAssembly Engine (@ffmpeg/ffmpeg)             │  • Extract DASH info       │
│     Trims & muxes chunks in-memory                  │  • Stream proxy with       │
│  8. Native File Download (Blob URL)                 │    Range pass-through      │
└─────────────────────────────────────────────────────┼────────────────────────────┘
                                                      │
                                                      ▼
                                       ┌─────────────────────────────┐
                                       │   YouTube / Google CDN      │
                                       │   (*.googlevideo.com)       │
                                       └─────────────────────────────┘
```

### Technology Stack

| Layer | Component | Technology | Role |
|---|---|---|---|
| **Frontend** | Framework | Astro 5 + React 19 | Static site generator & reactive UI components |
| **Frontend** | Styling | Tailwind CSS v4 | Minimalist dark theme, typography, layout |
| **Frontend** | Branding | Kaushan Script + Geist | Brand identity (`YTcut`) & mono timecode display |
| **Frontend** | Clipping Engine | `@ffmpeg/ffmpeg` + `@ffmpeg/core` (v0.12.6) | Single-threaded WebAssembly video/audio muxing |
| **Backend** | Serverless Edge | Cloudflare Workers | TypeScript runtime for API routes |
| **Backend** | YouTube Extractor | `@distube/ytdl-core` / `youtubei.js` | Resolves YouTube DASH & progressive stream URLs |
| **Backend** | Security & Limits | In-Memory Sliding Window Rate Limiter | IP rate-limiting (10 req/min, 5,000 max entries) |
| **Hosting** | Edge Hosting | Cloudflare Pages & Workers | Global edge CDN distribution |
| **CI/CD** | Pipeline | GitHub Actions | Vitest unit testing, Astro build, Wrangler deploy |

---

## 6. Functional Implementation Details

### 6.1 URL Extraction & Metadata (`/api/info`)
- Validates YouTube input links (`youtube.com/watch?v=`, `youtu.be/`, shorts, and raw 11-character video IDs).
- Enforces YouTube video duration safeguards (rejects live or unparseable URLs).
- Extracts:
  - Video title, author, duration, and high-res thumbnail.
  - Progressive streams (combined video + audio up to 720p).
  - DASH separate streams (1080p, 720p video-only + best audio stream).
  - Dedicated audio-only streams (`.m4a` / Opus).
- Sanitizes upstream YouTube errors (handles private, region-blocked, or removed videos gracefully).

### 6.2 Zero-Storage Streaming Proxy (`/api/proxy`)
- Solves YouTube CDN strict IP-binding and CORS restrictions.
- Relays HTTP `Range`, `Accept-Ranges`, and `Content-Range` headers transparently.
- **Security Hardening:**
  - Enforces strict `https:` scheme.
  - Whitelists target hostnames to verified Google video CDNs (`*.googlevideo.com`).
  - Sets `redirect: 'manual'` and blocks 3xx responses to eliminate Open Redirect / SSRF vectors.
  - Strips internal upstream error stacks from client responses.

### 6.3 Studio Video Preview & Interactive Timeline
- **Embedded Player:** YouTube IFrame Player API loaded via `https://www.youtube.com/embed/{id}` with `enablejsapi=1` and `playsinline=1`.
- **Bidirectional Player Sync:** Dragging handles or clicking presets dispatches synchronous `seekTo` postMessages to the player.
- **Unified Timeline Scrubber:**
  - Start handle, end handle, and selection window assembled in a single absolute flex container to eliminate grab-offset lag.
  - CSS transitions removed on drag to ensure 60fps real-time tracking.
  - Dual knurled grips on handles and center window.
  - `justDraggedRef` guard with `stopPropagation` to prevent trailing click events from shifting handles on touch release.
- **Precision Controls:**
  - Micro-nudge buttons (`-1s`, `+1s`, `-0.1s`, `+0.1s`).
  - Direct numerical timecode inputs.
  - Duration quick-presets (`15s`, `30s`, `60s`, `90s`).
  - Spacebar keyboard shortcut for clip preview toggle.

### 6.4 Client-Side WebAssembly Clipping (`trimmer.ts`)
- **Single-Threaded WASM:** Uses `@ffmpeg/core@0.12.6` without `SharedArrayBuffer` requirements, removing the need for strict COEP headers and ensuring YouTube iframes render without browser connection refusals.
- **Smart Chunk Downloader:**
  - Queries byte length (`Content-Range` or `clen`).
  - Estimates clip byte budget based on `(endTime - startTime) / totalDuration * totalBytes`.
  - Downloads only relevant byte chunks sequentially (default `2 MB` chunks with automatic 3x retry on network dropouts).
- **Fast Stream Copy (`-c copy`):**
  - Trims progressive streams without re-encoding in seconds.
  - Muxes DASH 1080p/720p video with separate audio tracks directly into `.mp4`.
  - Extracts audio-only clips as clean `.m4a` files.
- **Native Download Trigger:** Automatically creates a temporary object URL, attaches a sanitized filename (`{title}.mp4`), triggers native browser saving (Files app on iOS, Downloads on Android/Desktop), and revokes the URL.

---

## 7. Security & Non-Functional Specifications

| Category | Specification | Implementation Status |
|---|---|---|
| **CORS Policy** | Whitelisted origins (`https://yt-cut.pages.dev`, `https://yt-cut.com`, localhost) | Implemented & verified |
| **Rate Limiting** | 10 requests / minute per client IP with automatic TTL cleanup | Implemented & verified |
| **SSRF Protection** | Strict scheme check (`https:`) + hostname regex (`^([a-z0-9-]+\.)*googlevideo\.com$`) | Implemented & verified |
| **COEP / Frame Compatibility** | Removed COEP blocking headers; set `X-Frame-Options: SAMEORIGIN` | Implemented & verified |
| **Memory Limit** | Maximum clip length capped at 10 minutes (`600s`) to prevent browser crash | Implemented & verified |
| **Privacy** | Zero user analytics, zero cookies, zero video data logged or stored on server | Implemented & verified |
| **Testing** | 18 automated Vitest unit & integration tests covering routes, CORS, proxy, rate limits | 100% passing |

---

## 8. Deployment & CI/CD Pipeline

- **Automated Workflow:** `.github/workflows/deploy.yml` triggers on push to `master`.
- **Stages:**
  1. `test`: Runs Vitest test suite (18 tests) and builds Astro frontend to guarantee zero compile errors.
  2. `deploy-backend`: Deploys Worker edge code via `wrangler-action`.
  3. `deploy-frontend`: Auto-creates Cloudflare Pages project if missing, builds static assets with `PUBLIC_API_URL`, and publishes to Cloudflare Pages.

---

## 9. Future Roadmap (v1.1+)

As outlined in `2_INSTRUCTIONS.md`, planned enhancements include:
1. **CI/CD Cache Optimization:** Unify build and deploy runner steps with GitHub npm caching to reduce deploy duration from 3 minutes to under 45 seconds.
2. **Audio Waveform Visualization:** Real-time canvas audio waveform rendered across the timeline scrubber bar.
3. **Smart Keyframe / GOP Snapping:** Visual indicators for nearest I-frame / keyframe to ensure instantaneous zero-artifact cuts.
4. **Custom Domain:** Link production domain (e.g., `yt-cut.com`) with Cloudflare DNS & SSL.
5. **Format Converter Options:** Optional WebM/GIF generation directly in-browser.
