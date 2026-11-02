import { end, overlaps } from './project.js';

// Splits transcribed segments into short on-screen captions.
// Idea adapted from OpenCut's buildCaptionChunks (MIT) — see THIRD_PARTY_NOTICES.md:
// cut each segment into groups of words and share its time out in proportion to the word count.
export function buildCaptions(segments, { maxWords = 7, maxChars = 42, minDuration = 0.8 } = {}) {
  const captions = [];
  let lastEnd = 0;
  for (const seg of segments) {
    const words = seg.text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;

    const lines = [];
    let line = [];
    for (const w of words) {
      const next = [...line, w];
      if (line.length && (next.length > maxWords || next.join(' ').length > maxChars)) {
        lines.push(line);
        line = [w];
      } else line = next;
    }
    if (line.length) lines.push(line);

    const span = Math.max(0.1, seg.end - seg.start);
    let t = seg.start;
    for (const l of lines) {
      const share = (span * l.length) / words.length;
      const start = Math.max(t, lastEnd);
      const duration = Math.max(minDuration, share);
      captions.push({ text: l.join(' '), start, duration });
      lastEnd = start + duration;
      t += share;
    }
  }
  return captions;
}

// Replaces earlier auto-subtitles in the covered range and never overwrites hand-made texts.
export function placeCaptions(clips, captions, style) {
  if (!captions.length) return { clips, added: 0, skipped: 0 };
  const from = captions[0].start;
  const to = captions.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  const kept = clips.filter((c) => !(c.track === 'text' && c.auto && c.start < to && end(c) > from));
  const next = [...kept];
  let added = 0;
  let skipped = 0;
  for (const cap of captions) {
    if (overlaps(next, 'text', cap.start, cap.duration)) {
      skipped += 1;
      continue;
    }
    next.push({
      id: crypto.randomUUID(), mediaId: null, track: 'text', start: cap.start, in: 0, duration: cap.duration,
      text: cap.text, style: { ...style }, auto: true,
    });
    added += 1;
  }
  return { clips: next, added, skipped };
}
