const P = require('../shared/effects.json');

// FFmpeg twins of src/effects.js. Each returns a filter-chain fragment that starts with ',' and
// ends in yuv420p, inserted right after a segment's `setpts`. tau0 converts segment time to clip time.
const f = (v) => Number(v).toFixed(4);
const time = (variable, tau0) => (tau0 >= 0 ? `(${variable}+${f(tau0)})` : `(${variable}-${f(-tau0)})`);
const clamp = (v, lo, hi, fallback) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

function mixer(m) {
  const k = ['rr', 'rg', 'rb', 'gr', 'gg', 'gb', 'br', 'bg', 'bb'];
  return `,colorchannelmixer=${k.map((name, i) => `${name}=${f(m[i])}`).join(':')},format=yuv420p`;
}

// Same matrices as the CSS grayscale() and sepia() filter functions.
const grayscale = (a) => {
  const b = 1 - a;
  return [
    0.2126 + 0.7874 * b, 0.7152 - 0.7152 * b, 0.0722 - 0.0722 * b,
    0.2126 - 0.2126 * b, 0.7152 + 0.2848 * b, 0.0722 - 0.0722 * b,
    0.2126 - 0.2126 * b, 0.7152 - 0.7152 * b, 0.0722 + 0.9278 * b,
  ];
};
const sepia = (a) => {
  const b = 1 - a;
  return [
    0.393 + 0.607 * b, 0.769 - 0.769 * b, 0.189 - 0.189 * b,
    0.349 - 0.349 * b, 0.686 + 0.314 * b, 0.168 - 0.168 * b,
    0.272 - 0.272 * b, 0.534 - 0.534 * b, 0.131 + 0.869 * b,
  ];
};

// CSS saturate() matrix.
const saturate = (s) => [
  0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
];

// CSS hue-rotate() matrix with C = cos, S = sin given as FFmpeg sub-expressions.
function hueRotateGeq(C, S) {
  const m = [
    [`0.213+${C}*0.787-${S}*0.213`, `0.715-${C}*0.715-${S}*0.715`, `0.072-${C}*0.072+${S}*0.928`],
    [`0.213-${C}*0.213+${S}*0.143`, `0.715+${C}*0.285+${S}*0.140`, `0.072-${C}*0.072-${S}*0.283`],
    [`0.213-${C}*0.213-${S}*0.787`, `0.715-${C}*0.715+${S}*0.715`, `0.072+${C}*0.928+${S}*0.072`],
  ];
  const row = (r) => `clip(r(X,Y)*(${r[0]})+g(X,Y)*(${r[1]})+b(X,Y)*(${r[2]}),0,255)`;
  return `,format=gbrp,geq=r='${row(m[0])}':g='${row(m[1])}':b='${row(m[2])}',format=yuv420p`;
}

function effectFilter(c, k, W, H, fps, tau0) {
  const type = c.effect?.type;
  if (!P.ids.includes(type)) return '';
  const A = clamp(c.effect.intensity, 0, 1, 0.7);
  if (A <= 0) return '';
  const s = H / 720;

  switch (type) {
    case 'blur':
      return `,gblur=sigma=${f(P.blur.radius * A * s)},format=yuv420p`;
    case 'bw':
      return mixer(grayscale(A));
    case 'sepia':
      return mixer(sepia(A));
    case 'glow':
    case 'dream': {
      const g = P[type];
      return (
        `,format=gbrp,split[gA${k}][gB${k}];[gB${k}]gblur=sigma=${f(g.radius * A * s)}[gC${k}];` +
        `[gA${k}][gC${k}]blend=all_mode=screen:all_opacity=${f(g.opacity * A)},format=yuv420p`
      );
    }
    case 'shake': {
      const p = P.shake;
      const t = time('t', tau0);
      const z = 1 + 2 * p.amp * A;
      const dx = `${f(p.amp * A * W)}*(${p.w[0]}*sin(2*PI*${p.fx[0]}*${t}+${p.px[0]})+${p.w[1]}*sin(2*PI*${p.fx[1]}*${t}+${p.px[1]}))`;
      const dy = `${f(p.amp * A * H)}*(${p.w[0]}*sin(2*PI*${p.fy[0]}*${t}+${p.py[0]})+${p.w[1]}*sin(2*PI*${p.fy[1]}*${t}+${p.py[1]}))`;
      const sw = 2 * Math.round((W * z) / 2);
      const sh = 2 * Math.round((H * z) / 2);
      return `,scale=${sw}:${sh},crop=${W}:${H}:x='(iw-${W})/2+${dx}':y='(ih-${H})/2+${dy}',format=yuv420p`;
    }
    case 'pulse': {
      const z = `1+${f(P.pulse.amp * A)}*(0.5-0.5*cos(2*PI*${P.pulse.freq}*${time('it', tau0)}))`;
      return `,zoompan=z='${z}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${fps},format=yuv420p`;
    }
    case 'wave': {
      const w = P.wave;
      const dx = `${f(w.amp * A)}*W*sin(2*PI*(Y/H*${w.waves}+${w.freq}*${time('T', tau0)}))`;
      return `,format=gbrp,geq=r='r(X-${dx},Y)':g='g(X-${dx},Y)':b='b(X-${dx},Y)',format=yuv420p`;
    }
    case 'rgb':
    case 'vhs': {
      const d = Math.round((type === 'rgb' ? P.rgb.amp : P.vhs.shift) * A * W);
      return d ? `,format=gbrp,rgbashift=rh=${-d}:bh=${d},format=yuv420p` : '';
    }
    case 'oldfilm':
      return mixer(sepia(P.oldfilm.sepia * A));
    case 'invert': {
      const e = `clip(val*${f(1 - 2 * A)}+${f(255 * A)},0,255)`;
      return `,lutrgb=r='${e}':g='${e}':b='${e}',format=yuv420p`;
    }
    case 'pop': {
      const k2 = 1 + P.pop.contrast * A;
      const e = `clip((val-127.5)*${f(k2)}+127.5,0,255)`;
      return `,lutrgb=r='${e}':g='${e}':b='${e}'${mixer(saturate(1 + P.pop.saturation * A))}`;
    }
    case 'rainbow': {
      const speed = P.rainbow.minSpeed + (P.rainbow.maxSpeed - P.rainbow.minSpeed) * A;
      const angle = `(2*PI*${f(speed)}*${time('T', tau0)})`;
      return hueRotateGeq(`cos${angle}`, `sin${angle}`);
    }
    case 'zoomslow': {
      const dur = Math.max(0.01, c.duration);
      const z = `1+${f(P.zoomslow.amount * A)}*min(1,max(0,${time('it', tau0)}/${f(dur)}))`;
      return `,zoompan=z='${z}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${fps},format=yuv420p`;
    }
    case 'sway': {
      const z = 1 + P.sway.zoom * A;
      const rad = (P.sway.angle * A * Math.PI) / 180;
      const sw = 2 * Math.round((W * z) / 2);
      const sh = 2 * Math.round((H * z) / 2);
      return `,scale=${sw}:${sh},rotate=a='${f(rad)}*sin(2*PI*${P.sway.freq}*${time('t', tau0)})':ow=${W}:oh=${H}:c=black,format=yuv420p`;
    }
    case 'flash': {
      const ph = `(${P.flash.freq}*${time('T', tau0)})`;
      const a = `(${f(A)}*pow(max(0,1-(${ph}-floor(${ph}))/${P.flash.width}),2))`;
      const ch = (n) => `${n}(X,Y)+(255-${n}(X,Y))*${a}`;
      return `,format=gbrp,geq=r='${ch('r')}':g='${ch('g')}':b='${ch('b')}',format=yuv420p`;
    }
    case 'mirror': {
      const half = Math.floor(W / 2);
      return (
        `,split[mA${k}][mB${k}];[mA${k}]crop=${half}:${H}:0:0[mL${k}];` +
        `[mB${k}]crop=${half}:${H}:0:0,hflip[mR${k}];[mL${k}][mR${k}]hstack,format=yuv420p`
      );
    }
    case 'pixel': {
      const b = Math.max(1, Math.round((P.pixel.min + (P.pixel.max - P.pixel.min) * A) * (H / 720)));
      const sw = Math.max(1, Math.floor(W / b));
      const sh = Math.max(1, Math.floor(H / b));
      return `,format=rgb24,scale=${sw}:${sh}:flags=area,scale=${W}:${H}:flags=neighbor,format=yuv420p`;
    }
    default:
      return '';
  }
}

module.exports = { effectFilter, EFFECT_IDS: P.ids, mixer, saturate };
