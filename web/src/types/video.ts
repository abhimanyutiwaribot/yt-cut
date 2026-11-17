// src/types/video.ts
// Shared domain types for video streams, formats, and cutter state

export interface StreamVideo {
  url: string;
  mimeType: string;
  bitrate: number;
  height: number;
  qualityLabel?: string;
  contentLength?: number;
}

export interface StreamAudio {
  url: string;
  mimeType: string;
  bitrate: number;
  contentLength?: number;
}

export interface VideoData {
  videoId: string;
  title: string;
  author: string;
  durationSeconds: number;
  thumbnailUrl: string;
  maxClipDurationSeconds: number;
  streams: {
    video720?: StreamVideo;
    video1080?: StreamVideo;
    best: {
      video: StreamVideo;
      audio: StreamAudio;
    };
    progressive?: StreamVideo;
    audioOnly: StreamAudio;
  };
}

export type FormatOption = 'best' | '1080p' | '720p' | 'audio';
