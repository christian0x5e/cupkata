// Keeps a playing video or sound on the timeline's clock. A small gap is closed by playing a little
// faster or slower, which nobody sees or hears; only a big one needs a visible jump.
export const SEEK_ABOVE = 0.25;
const IGNORE_BELOW = 0.02;
const STEP = 0.01;
const MAX_CORRECTION = 0.05;

// drift: seconds the element is ahead of the timeline (behind if negative).
export function correctedRate(drift, rate) {
  if (Math.abs(drift) < IGNORE_BELOW) return rate;
  const wanted = Math.min(MAX_CORRECTION, Math.abs(drift));
  const correction = Math.round(wanted / STEP) * STEP * Math.sign(drift);
  return rate * (1 - correction);
}

// The part of the timeline worth drawing, in pixels. It moves by half a window at a time, so
// scrolling only redraws the timeline when new clips can come into view.
export function visibleWindow(scrollLeft, width) {
  if (!(width > 0)) return { from: -Infinity, to: Infinity };
  const half = width / 2;
  const block = Math.floor(scrollLeft / half);
  return { from: (block - 1) * half, to: (block + 4) * half };
}

export const inWindow = (clip, pps, { from, to }) => (clip.start + clip.duration) * pps >= from && clip.start * pps <= to;
