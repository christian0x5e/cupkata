// Picture formats of a project. The export resolution (720p / 1080p / 1440p) is the length of the short side.
// Same ids as RATIOS in electron/project.cjs.
import { T } from './i18n.js';
export const RATIOS = [
  { id: '16:9', hint: T('YouTube, écran large'), w: 16, h: 9 },
  { id: '9:16', hint: 'TikTok, Reels, Shorts', w: 9, h: 16 },
  { id: '1:1', hint: T('Carré'), w: 1, h: 1 },
  { id: '4:5', hint: T('Portrait Instagram'), w: 4, h: 5 },
  { id: '4:3', hint: T('Ancienne télé'), w: 4, h: 3 },
  { id: '3:4', hint: T('Portrait classique'), w: 3, h: 4 },
  { id: '21:9', hint: T('Cinémascope'), w: 21, h: 9 },
];
export const DEFAULT_RATIO = '16:9';

// Width × height for a format, with the given short side (sizes even, as video encoders need).
export function frameSize(ratioId, short) {
  const r = RATIOS.find((x) => x.id === ratioId) || RATIOS[0];
  const even = (v) => 2 * Math.round(v / 2);
  return r.w >= r.h ? [even((short * r.w) / r.h), short] : [short, even((short * r.h) / r.w)];
}
