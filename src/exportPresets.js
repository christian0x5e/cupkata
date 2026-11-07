// One-click export settings. video / audio are target bitrates in kbit/s, which is also what makes
// the size shown before exporting reliable. Without a preset the export keeps its constant quality.
import { DECIMAL, T } from './i18n.js';
export const EXPORT_PRESETS = [
  { id: 'custom', name: T('Réglages du projet') },
  { id: 'tiktok', name: 'TikTok', ratio: '9:16', resolution: '1080p', video: 8000, audio: 192 },
  { id: 'reels', name: 'Instagram Reels', ratio: '9:16', resolution: '1080p', video: 8000, audio: 192 },
  { id: 'instagram-portrait', name: T('Instagram portrait'), ratio: '4:5', resolution: '1080p', video: 6000, audio: 192 },
  { id: 'instagram-square', name: T('Instagram carré'), ratio: '1:1', resolution: '1080p', video: 6000, audio: 192 },
  { id: 'shorts', name: 'YouTube Shorts', ratio: '9:16', resolution: '1080p', video: 10000, audio: 192 },
  { id: 'youtube', name: 'YouTube 1080p', ratio: '16:9', resolution: '1080p', video: 10000, audio: 192 },
  { id: 'youtube-2k', name: 'YouTube 2K', ratio: '16:9', resolution: '1440p', video: 16000, audio: 192 },
];

export const EXPORT_CODECS = [
  { id: 'h264', name: T('H.264 — lisible partout') },
  { id: 'hevc', name: T('H.265 — plus léger') },
  { id: 'av1', name: T('AV1 — plus léger, moins de lecteurs') },
];
// Size at the same quality compared with H.264, measured on a test picture only.
const CODEC_SHARE = { hevc: 0.65, av1: 0.65 };

// Constant quality has no fixed bitrate: an average for ordinary footage, scaled to the picture's size.
const CONSTANT_QUALITY_BITS_PER_PIXEL = 0.12;

export function estimateBytes(preset, width, height, fps, seconds, codec = 'h264') {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  const video = preset?.video ? preset.video * 1000 : width * height * fps * CONSTANT_QUALITY_BITS_PER_PIXEL * (CODEC_SHARE[codec] ?? 1);
  const audio = (preset?.audio ?? 192) * 1000;
  return ((video + audio) * seconds) / 8;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  // From 999.5 Mo the megabytes would round to « 1000 Mo ».
  if (bytes >= 999.5e6) return T('{0} Go', (bytes / 1e9).toFixed(1).replace('.', DECIMAL));
  return T('{0} Mo', Math.max(1, Math.round(bytes / 1e6)));
}
