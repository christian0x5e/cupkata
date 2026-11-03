const fs = require('fs');
const path = require('path');

// The sound-effect library: every sound is synthesized here, so there is nothing to download and no
// licence to track. Same seed, same sound: a file can be regenerated at any time.
const RATE = 48000;

function noiseSource(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return (x / 2147483648) - 1;
  };
}

// Band-pass / low-pass state-variable filter; call with a cutoff (Hz) that may change at every sample.
function filter(q = 1) {
  let low = 0;
  let band = 0;
  return (input, hz) => {
    const f = Math.min(0.99, 2 * Math.sin((Math.PI * Math.min(hz, RATE / 4)) / RATE));
    low += f * band;
    const high = input - low - band / q;
    band += f * high;
    return { low, band, high };
  };
}

const render = (seconds, sample) => {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) out[i] = sample(i / RATE, i / out.length);
  return out;
};
const bell = (p, peak = 0.5) => (p < peak ? p / peak : (1 - p) / (1 - peak)) ** 2;
const decay = (t, tau) => Math.exp(-t / tau);

function whoosh(seconds, from, to, seed) {
  const noise = noiseSource(seed);
  const bp = filter(1.6);
  return render(seconds, (t, p) => {
    const sweep = p < 0.55 ? from * (to / from) ** (p / 0.55) : to * (from / to) ** ((p - 0.55) / 0.45);
    return bp(noise(), sweep).band * bell(p, 0.55) * 0.9;
  });
}

function clickAt(out, time, seed, tone = 3500, level = 0.9) {
  const noise = noiseSource(seed);
  const bp = filter(1.2);
  const start = Math.round(time * RATE);
  for (let i = 0; i < 0.03 * RATE && start + i < out.length; i++) {
    const t = i / RATE;
    out[start + i] += bp(noise(), tone).band * decay(t, 0.004) * level;
  }
}

function tones(seconds, list) {
  return render(seconds, (t) => {
    let v = 0;
    for (const { at = 0, hz, tau, level = 0.5 } of list) {
      if (t >= at) v += Math.sin(2 * Math.PI * hz * (t - at)) * decay(t - at, tau) * level * Math.min(1, (t - at) / 0.002);
    }
    return v;
  });
}

const SOUNDS = [
  { id: 'whoosh', name: 'Whoosh', group: 'Mouvement', make: () => whoosh(0.8, 300, 3200, 11) },
  { id: 'whoosh-court', name: 'Whoosh court', group: 'Mouvement', make: () => whoosh(0.35, 500, 5000, 12) },
  { id: 'whoosh-grave', name: 'Whoosh grave', group: 'Mouvement', make: () => whoosh(1.2, 120, 1100, 13) },
  {
    id: 'montee', name: 'Montée', group: 'Mouvement',
    make: () => {
      const noise = noiseSource(14);
      const bp = filter(2.5);
      let phase = 0;
      return render(2.5, (t, p) => {
        const hz = 180 * 2 ** (p * 3);
        phase += hz / RATE;
        return (bp(noise(), 400 * 2 ** (p * 3.5)).band * 0.7 + Math.sin(2 * Math.PI * phase) * 0.18) * p ** 2 * (p > 0.98 ? (1 - p) / 0.02 : 1);
      });
    },
  },
  {
    id: 'clic', name: 'Clic', group: 'Interface',
    make: () => {
      const out = new Float32Array(0.08 * RATE);
      clickAt(out, 0, 21);
      return out;
    },
  },
  {
    id: 'double-clic', name: 'Double clic', group: 'Interface',
    make: () => {
      const out = new Float32Array(0.25 * RATE);
      clickAt(out, 0, 22);
      clickAt(out, 0.12, 23);
      return out;
    },
  },
  {
    id: 'clavier', name: 'Clavier', group: 'Interface',
    make: () => {
      const out = new Float32Array(2 * RATE);
      const random = noiseSource(24);
      for (let t = 0.02, k = 0; t < 1.9; k++) {
        clickAt(out, t, 100 + k, 2200 + 1500 * Math.abs(random()), 0.45 + 0.3 * Math.abs(random()));
        t += 0.08 + 0.13 * Math.abs(random());
      }
      return out;
    },
  },
  {
    id: 'pop', name: 'Pop', group: 'Interface',
    make: () => {
      let phase = 0;
      return render(0.16, (t) => {
        phase += (220 + 760 * decay(t, 0.02)) / RATE;
        return Math.sin(2 * Math.PI * phase) * decay(t, 0.035) * 0.85;
      });
    },
  },
  { id: 'ding', name: 'Ding', group: 'Interface', make: () => tones(1.4, [{ hz: 1318, tau: 0.35 }, { hz: 2637, tau: 0.18, level: 0.2 }, { hz: 3951, tau: 0.09, level: 0.1 }]) },
  { id: 'notification', name: 'Notification', group: 'Interface', make: () => tones(0.8, [{ hz: 880, tau: 0.12 }, { at: 0.14, hz: 1319, tau: 0.2 }]) },
  { id: 'erreur', name: 'Erreur', group: 'Interface', make: () => tones(0.6, [{ hz: 311, tau: 0.09, level: 0.6 }, { at: 0.16, hz: 233, tau: 0.16, level: 0.6 }]) },
  {
    id: 'impact', name: 'Impact', group: 'Impacts',
    make: () => {
      const noise = noiseSource(31);
      const lp = filter(0.9);
      let phase = 0;
      return render(1.1, (t) => {
        phase += (42 + 90 * decay(t, 0.05)) / RATE;
        return Math.sin(2 * Math.PI * phase) * decay(t, 0.28) * 0.8 + lp(noise(), 1400).low * decay(t, 0.05) * 0.8;
      });
    },
  },
  {
    id: 'boum', name: 'Boum', group: 'Impacts',
    make: () => {
      let phase = 0;
      return render(1.8, (t) => {
        phase += (32 + 60 * decay(t, 0.08)) / RATE;
        return Math.sin(2 * Math.PI * phase) * decay(t, 0.55);
      });
    },
  },
  {
    id: 'glitch', name: 'Glitch', group: 'Impacts',
    make: () => {
      const noise = noiseSource(33);
      const random = noiseSource(34);
      let hold = 0;
      let gate = 1;
      let tone = 500;
      let phase = 0;
      return render(0.6, (t, p) => {
        if (hold-- <= 0) {
          hold = 400 + Math.abs(random()) * 2600;
          gate = random() > -0.3 ? 1 : 0;
          tone = 200 + Math.abs(random()) * 2400;
        }
        phase += tone / RATE;
        return gate * (Math.sign(Math.sin(2 * Math.PI * phase)) * 0.28 + noise() * 0.16) * (1 - p);
      });
    },
  },
  {
    id: 'pluie', name: 'Pluie', group: 'Ambiances',
    make: () => {
      const noise = noiseSource(41);
      const hp = filter(0.7);
      const drops = noiseSource(42);
      let drop = 0;
      return render(20, (t) => {
        if (drops() > 0.9992) drop = 0.45 * Math.abs(drops());
        drop *= 0.994;
        return hp(noise(), 2400).high * 0.09 + noise() * drop * 0.5;
      });
    },
  },
  {
    id: 'vent', name: 'Vent', group: 'Ambiances',
    make: () => {
      const noise = noiseSource(43);
      const bp = filter(2);
      return render(20, (t) => {
        const gust = 0.55 + 0.25 * Math.sin(2 * Math.PI * 0.11 * t) + 0.2 * Math.sin(2 * Math.PI * 0.27 * t + 1);
        return bp(noise(), 240 + 420 * gust).band * gust * 0.55;
      });
    },
  },
  {
    id: 'souffle', name: 'Souffle doux', group: 'Ambiances',
    make: () => {
      const noise = noiseSource(44);
      const lp = filter(0.7);
      return render(20, () => lp(noise(), 900).low * 0.28);
    },
  },
];

function wavBytes(samples) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.9 / peak : 0;
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(v * gain * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

// Writes the sounds missing from the folder; returns the catalogue with each sound's file.
async function ensureSounds(dir) {
  const list = [];
  for (const { id, name, group, make } of SOUNDS) {
    const file = path.join(dir, `${name}.wav`);
    if (!fs.existsSync(file)) await fs.promises.writeFile(file, wavBytes(make()));
    list.push({ id, name, group, file });
  }
  return list;
}

module.exports = { ensureSounds };
