export const FPS = 30;

const pad = (v) => String(v).padStart(2, '0');

export function formatTime(t) {
  const total = Math.max(0, t);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const f = Math.floor((total % 1) * FPS);
  return `${pad(m)}:${pad(s)}:${pad(f)}`;
}

export function formatShort(t) {
  const total = Math.max(0, Math.round(t));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}
