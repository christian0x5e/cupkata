export const FPS = 30;

const pad = (v) => String(v).padStart(2, '0');

// A time that cannot be shown (not yet known, or before the start) reads as 0.
const seconds = (t) => (Number.isFinite(t) ? Math.max(0, t) : 0);

export function formatTime(t) {
  const total = seconds(t);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = Math.floor(total % 60);
  const f = Math.floor((total % 1) * FPS);
  return `${h ? `${h}:` : ''}${pad(m)}:${pad(s)}:${pad(f)}`;
}

export function formatShort(t) {
  const total = Math.round(seconds(t));
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  return `${h ? `${h}:${pad(m)}` : m}:${pad(total % 60)}`;
}
