// One-click export settings. video / audio are target bitrates in kbit/s, which is also what makes
// the size shown before exporting reliable. Without a preset the export keeps its constant quality.
export const EXPORT_PRESETS = [
  { id: 'custom', name: 'Réglages du projet' },
  { id: 'tiktok', name: 'TikTok', ratio: '9:16', resolution: '1080p', video: 8000, audio: 192 },
  { id: 'reels', name: 'Instagram Reels', ratio: '9:16', resolution: '1080p', video: 8000, audio: 192 },
  { id: 'instagram-portrait', name: 'Instagram portrait', ratio: '4:5', resolution: '1080p', video: 6000, audio: 192 },
  { id: 'instagram-square', name: 'Instagram carré', ratio: '1:1', resolution: '1080p', video: 6000, audio: 192 },
  { id: 'shorts', name: 'YouTube Shorts', ratio: '9:16', resolution: '1080p', video: 10000, audio: 192 },
  { id: 'youtube', name: 'YouTube 1080p', ratio: '16:9', resolution: '1080p', video: 10000, audio: 192 },
  { id: 'youtube-2k', name: 'YouTube 2K', ratio: '16:9', resolution: '1440p', video: 16000, audio: 192 },
];

// Constant quality has no fixed bitrate: an average for ordinary footage, scaled to the picture's size.
const CONSTANT_QUALITY_BITS_PER_PIXEL = 0.12;

export function estimateBytes(preset, width, height, fps, seconds) {
  const video = preset?.video ? preset.video * 1000 : width * height * fps * CONSTANT_QUALITY_BITS_PER_PIXEL;
  const audio = (preset?.audio ?? 192) * 1000;
  return ((video + audio) * seconds) / 8;
}

export function formatBytes(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1).replace('.', ',')} Go`;
  return `${Math.max(1, Math.round(bytes / 1e6))} Mo`;
}
