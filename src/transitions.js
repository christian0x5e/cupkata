// Canvas versions of FFmpeg's xfade transitions, so the preview matches the export.
// In xfade, P runs from 1 (start) to 0 (end) and mix(a, b, m) = a*m + b*(1-m).

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

let scratch = null;
function scratchCanvas(W, H) {
  if (!scratch || scratch.width !== W || scratch.height !== H) {
    scratch = document.createElement('canvas');
    scratch.width = W;
    scratch.height = H;
  }
  return scratch;
}

// Additive blend on black: result = A*wA + B*wB + white*wWhite.
function additive(ctx, W, H, drawA, drawB, wA, wB, wWhite = 0) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (wA > 0) {
    ctx.globalAlpha = wA;
    drawA(ctx);
  }
  if (wB > 0) {
    ctx.globalAlpha = wB;
    drawB(ctx);
  }
  if (wWhite > 0) {
    ctx.globalAlpha = wWhite;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

export function drawTransition(ctx, W, H, type, progress, drawA, drawB) {
  const p = Math.min(1, Math.max(0, progress));
  const P = 1 - p;

  if (type === 'fadeblack' || type === 'fadewhite') {
    const s1 = smoothstep(0.8, 1, P);
    const s2 = smoothstep(0.2, 1, P);
    const white = type === 'fadewhite' ? (1 - s1) * P + s2 * (1 - P) : 0;
    additive(ctx, W, H, drawA, drawB, s1 * P, (1 - s2) * (1 - P), white);
    return;
  }

  if (type === 'wipeleft') {
    drawA(ctx);
    ctx.save();
    ctx.beginPath();
    ctx.rect(W * P, 0, W - W * P, H);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawB(ctx);
    ctx.restore();
    return;
  }

  if (type === 'slideleft') {
    for (const [dx, draw] of [[-p * W, drawA], [P * W, drawB]]) {
      ctx.save();
      ctx.translate(dx, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      draw(ctx);
      ctx.restore();
    }
    return;
  }

  if (type === 'circleopen') {
    drawA(ctx);
    // B weight = 1 - smoothstep(0, 1, r/z + (P - 0.5) * 3), drawn through a radial alpha mask.
    const z = Math.hypot(W / 2, H / 2);
    const rMax = z * (1 - (P - 0.5) * 3);
    if (rMax <= 0) return;
    const off = scratchCanvas(W, H);
    const o = off.getContext('2d');
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, W, H);
    o.fillStyle = '#000';
    o.fillRect(0, 0, W, H);
    drawB(o);
    const g = o.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, rMax);
    for (let i = 0; i <= 8; i++) {
      const r = (rMax * i) / 8;
      g.addColorStop(i / 8, `rgba(0,0,0,${1 - smoothstep(0, 1, r / z + (P - 0.5) * 3)})`);
    }
    o.globalCompositeOperation = 'destination-in';
    o.fillStyle = g;
    o.fillRect(0, 0, W, H);
    ctx.drawImage(off, 0, 0);
    return;
  }

  additive(ctx, W, H, drawA, drawB, P, 1 - P);
}
