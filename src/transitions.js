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

// Motion blur, as in xfade's hblur: each pixel averages the size pixels from it to the right (fewer
// at the right edge), in both pictures, then the two are mixed.
let blurCanvas = null;
function motionBlur(ctx, W, H, P, drawA, drawB) {
  if (!blurCanvas || blurCanvas.width !== W || blurCanvas.height !== H) {
    blurCanvas = document.createElement('canvas');
    blurCanvas.width = W;
    blurCanvas.height = H;
  }
  const o = blurCanvas.getContext('2d', { willReadFrequently: true });
  const read = (draw) => {
    o.fillStyle = '#000';
    o.fillRect(0, 0, W, H);
    draw(o);
    return o.getImageData(0, 0, W, H).data;
  };
  const a = read(drawA);
  const b = read(drawB);
  const out = o.createImageData(W, H);
  const size = 1 + Math.floor((W / 2) * (P <= 0.5 ? P * 2 : (1 - P) * 2));
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let c = 0; c < 3; c++) {
      let sumA = 0;
      let sumB = 0;
      let count = Math.min(size, W);
      for (let x = 0; x < count; x++) {
        sumA += a[row + x * 4 + c];
        sumB += b[row + x * 4 + c];
      }
      for (let x = 0; x < W; x++) {
        out.data[row + x * 4 + c] = (sumA / count) * P + (sumB / count) * (1 - P);
        sumA -= a[row + x * 4 + c];
        sumB -= b[row + x * 4 + c];
        if (x + size < W) {
          sumA += a[row + (x + size) * 4 + c];
          sumB += b[row + (x + size) * 4 + c];
        } else count -= 1;
      }
    }
    for (let x = 0; x < W; x++) out.data[row + x * 4 + 3] = 255;
  }
  o.putImageData(out, 0, 0);
  ctx.drawImage(blurCanvas, 0, 0);
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

  // The part of the frame where the new picture has already arrived.
  const wipes = {
    wipeleft: [W * P, 0, W - W * P, H],
    wiperight: [0, 0, W * p, H],
    wipeup: [0, H * P, W, H - H * P],
    wipedown: [0, 0, W, H * p],
  };
  if (wipes[type]) {
    drawA(ctx);
    ctx.save();
    ctx.beginPath();
    ctx.rect(...wipes[type]);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawB(ctx);
    ctx.restore();
    return;
  }

  // Direction the old picture leaves in; the new one follows it in.
  const slides = { slideleft: [-1, 0], slideright: [1, 0], slideup: [0, -1], slidedown: [0, 1] };
  if (slides[type]) {
    const [ux, uy] = slides[type];
    for (const [k, draw] of [[p, drawA], [p - 1, drawB]]) {
      ctx.save();
      ctx.translate(k * ux * W, k * uy * H);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      draw(ctx);
      ctx.restore();
    }
    return;
  }

  if (type === 'zoomin') {
    // The old picture zooms towards its centre and dissolves: A*s + B*(1-s), A cropped to zf of the frame.
    const zf = Math.max(0.002, smoothstep(0.5, 1, P));
    const s = smoothstep(0, 0.5, P);
    drawB(ctx);
    const off = scratchCanvas(W, H);
    const o = off.getContext('2d');
    o.globalCompositeOperation = 'source-over';
    o.fillStyle = '#000';
    o.fillRect(0, 0, W, H);
    drawA(o);
    ctx.save();
    ctx.globalAlpha = s;
    ctx.drawImage(off, (W * (1 - zf)) / 2, (H * (1 - zf)) / 2, W * zf, H * zf, 0, 0, W, H);
    ctx.restore();
    return;
  }

  if (type === 'hblur') {
    motionBlur(ctx, W, H, P, drawA, drawB);
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
