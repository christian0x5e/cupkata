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
let pixelCanvas = null;
function readPictures(W, H, drawA, drawB) {
  if (!pixelCanvas || pixelCanvas.width !== W || pixelCanvas.height !== H) {
    pixelCanvas = document.createElement('canvas');
    pixelCanvas.width = W;
    pixelCanvas.height = H;
  }
  const o = pixelCanvas.getContext('2d', { willReadFrequently: true });
  const read = (draw) => {
    o.fillStyle = '#000';
    o.fillRect(0, 0, W, H);
    draw(o);
    return o.getImageData(0, 0, W, H).data;
  };
  return { o, a: read(drawA), b: read(drawB) };
}

function motionBlur(ctx, W, H, P, drawA, drawB) {
  const { o, a, b } = readPictures(W, H, drawA, drawB);
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
  ctx.drawImage(pixelCanvas, 0, 0);
}

// How far the new picture has arrived at a pixel, before smoothing: xfade's mix(B, A, smoothstep(0, 1, s)).
const SOFT = {
  smoothleft: (x, y, W, H, P) => 1 + x / W - P * 2,
  smoothright: (x, y, W, H, P) => 1 + (W - 1 - x) / W - P * 2,
  smoothup: (x, y, W, H, P) => 1 + y / H - P * 2,
  smoothdown: (x, y, W, H, P) => 1 + (H - 1 - y) / H - P * 2,
  circleclose: (x, y, W, H, P) => Math.hypot(x - W / 2, y - H / 2) / Math.hypot(W / 2, H / 2) + (0.5 - P) * 3,
  radial: (x, y, W, H, P) => Math.atan2(x - W / 2, y - H / 2) - (P - 0.5) * Math.PI * 2.5,
  vertopen: (x, y, W, H, P) => 2 - Math.abs(x - W / 2) / (W / 2) - P * 2,
  vertclose: (x, y, W, H, P) => 1 + Math.abs(x - W / 2) / (W / 2) - P * 2,
  horzopen: (x, y, W, H, P) => 2 - Math.abs(y - H / 2) / (H / 2) - P * 2,
  horzclose: (x, y, W, H, P) => 1 + Math.abs(y - H / 2) / (H / 2) - P * 2,
  diagtl: (x, y, W, H, P) => 1 + (x / W) * (y / H) - P * 2,
  diagtr: (x, y, W, H, P) => 1 + ((W - 1 - x) / W) * (y / H) - P * 2,
  diagbl: (x, y, W, H, P) => 1 + (x / W) * ((H - 1 - y) / H) - P * 2,
  diagbr: (x, y, W, H, P) => 1 + ((W - 1 - x) / W) * ((H - 1 - y) / H) - P * 2,
};

// Direction of the moving picture in the cover and reveal transitions.
const MOVES = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const moveOf = (type, prefix) => (type.startsWith(prefix) ? MOVES[type.slice(prefix.length)] : null);

export const PIXEL_TRANSITIONS = new Set([
  ...Object.keys(SOFT), 'rectcrop', 'pixelize', 'squeezeh',
  ...Object.keys(MOVES).flatMap((d) => [`cover${d}`, `reveal${d}`]),
]);

// Writes one picture of a transition from two RGBA pictures, the formulas of xfade pixel for pixel.
// P runs from 1 (start) to 0 (end). Pure, so that a test can hold it against FFmpeg itself. FFmpeg counts
// in 32-bit floats here, and pixelize's block size depends on them, hence the fround.
export function transitionPixels(type, a, b, out, W, H, progress) {
  const P = Math.fround(progress);
  const soft = SOFT[type];
  const cover = moveOf(type, 'cover');
  const reveal = moveOf(type, 'reveal');
  const [mx, my] = cover || reveal || [0, 0];
  const zmx = Math.trunc(Math.fround(mx * P * W));
  const zmy = Math.trunc(Math.fround(my * P * H));
  const zw = Math.trunc(Math.abs(P - 0.5) * W);
  const zh = Math.trunc(Math.abs(P - 0.5) * H);
  const dist = Math.fround(Math.ceil(Math.fround(Math.fround(Math.min(P, Math.fround(1 - P))) * 50)) / 50);
  const sq = Math.fround(Math.fround(2 * dist * Math.min(W, H)) / 20);
  const put = (i, src, x, y) => {
    const j = (y * W + x) * 4;
    out[i] = src[j];
    out[i + 1] = src[j + 1];
    out[i + 2] = src[j + 2];
  };
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i += 4) {
      out[i + 3] = 255;
      if (soft) {
        const s = smoothstep(0, 1, soft(x, y, W, H, P));
        for (let c = 0; c < 3; c++) out[i + c] = b[i + c] * s + a[i + c] * (1 - s);
      } else if (type === 'rectcrop') {
        if (Math.abs(x - W / 2) < zw && Math.abs(y - H / 2) < zh) put(i, P < 0.5 ? b : a, x, y);
        else out[i] = out[i + 1] = out[i + 2] = 0;
      } else if (type === 'pixelize') {
        const sx = dist > 0 ? Math.trunc(Math.min(Math.fround((Math.floor(Math.fround(x / sq)) + 0.5) * sq), W - 1)) : x;
        const sy = dist > 0 ? Math.trunc(Math.min(Math.fround((Math.floor(Math.fround(y / sq)) + 0.5) * sq), H - 1)) : y;
        const j = (sy * W + sx) * 4;
        for (let c = 0; c < 3; c++) out[i + c] = a[j + c] * P + b[j + c] * (1 - P);
      } else if (type === 'squeezeh') {
        // Flattens the old picture into a horizontal band, so it works on the rows.
        const z = 0.5 + (y / H - 0.5) / P;
        if (z < 0 || z > 1) put(i, b, x, y);
        else put(i, a, x, Math.round(z * (H - 1)));
      } else {
        const zx = x + zmx;
        const zy = y + zmy;
        const inside = zx >= 0 && zx < W && zy >= 0 && zy < H;
        if (cover) {
          if (inside) put(i, b, zx, zy);
          else put(i, a, x, y);
        } else if (inside) put(i, b, x, y);
        else put(i, a, (zx + W) % W, (zy + H) % H);
      }
    }
  }
}

function pixelTransition(ctx, W, H, type, P, drawA, drawB) {
  const { o, a, b } = readPictures(W, H, drawA, drawB);
  const out = o.createImageData(W, H);
  transitionPixels(type, a, b, out.data, W, H, P);
  o.putImageData(out, 0, 0);
  ctx.drawImage(pixelCanvas, 0, 0);
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

  if (PIXEL_TRANSITIONS.has(type)) {
    pixelTransition(ctx, W, H, type, P, drawA, drawB);
    return;
  }

  additive(ctx, W, H, drawA, drawB, P, 1 - P);
}
