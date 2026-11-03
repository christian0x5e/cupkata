// Automatic reframing: the picture zoomed to cover the frame, its crop following a path through the
// source. The points are in seconds of the source, so they stay on the same picture when the clip is
// split or trimmed. Same formula as reframeCrop in electron/media.cjs.
export const hasReframe = (c) => (c?.reframe?.length ?? 0) > 0;

function along(points, key, t) {
  if (t <= points[0].t) return points[0][key];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    if (t <= b.t) return a[key] + ((b[key] - a[key]) * (t - a.t)) / (b.t - a.t);
  }
  return points[points.length - 1][key];
}

// Draws the source covering the W×H frame, centred on where the path is at source time t.
export function drawReframed(c, source, w, h, W, H, points, t) {
  const k = Math.max(W / w, H / h);
  const dw = w * k;
  const dh = h * k;
  const left = Math.min(0, Math.max(W - dw, W / 2 - along(points, 'x', t) * dw));
  const top = Math.min(0, Math.max(H - dh, H / 2 - along(points, 'y', t) * dh));
  c.drawImage(source, left, top, dw, dh);
}
