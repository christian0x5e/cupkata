// YouTube chapters from the timeline's named markers, ready to paste into a video description.
// YouTube wants at least 3 chapters, the first at 0:00, each lasting 10 seconds or more.
import { T } from './i18n.js';
const MIN_CHAPTERS = 3;
const MIN_LENGTH = 10;

const pad = (v) => String(v).padStart(2, '0');

function formatChapterTime(t) {
  const total = Math.floor(t);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function markersToChapters(markers, duration) {
  const sorted = markers
    .filter((m) => !m.beat && m.time < duration)
    .map((m) => ({ time: m.time < 1 ? 0 : m.time, label: (m.label ?? '').trim().replace(/\s+/g, ' ') }))
    .sort((a, b) => a.time - b.time);
  const chapters = sorted[0]?.time === 0 ? [] : [{ time: 0, label: T('Début') }];
  for (const marker of sorted) {
    if (!chapters.length || marker.time - chapters.at(-1).time >= MIN_LENGTH) chapters.push(marker);
  }
  while (chapters.length > 1 && duration - chapters.at(-1).time < MIN_LENGTH) chapters.pop();
  if (chapters.length < MIN_CHAPTERS) return '';
  return chapters.map((c, i) => `${formatChapterTime(c.time)} ${c.label || `Chapitre ${i + 1}`}`).join('\n');
}
