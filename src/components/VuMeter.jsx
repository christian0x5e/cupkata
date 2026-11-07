import { useEffect, useRef } from 'react';
import { T } from '../i18n.js';

const SEGMENTS = 14;
const FLOOR_DB = -48;

// Level meter of the preview's sound: two columns (left / right) of lit segments, green then
// yellow then red near 0 dB, with a peak mark that holds a moment and falls back.
// `read()` returns the current [left, right] peak levels (0..1) of the mix being heard.
export default function VuMeter({ read }) {
  const cols = useRef([]);
  useEffect(() => {
    let raf;
    const level = [0, 0];
    const peak = [0, 0];
    const peakAge = [0, 0];
    const tick = () => {
      const now = read() || [0, 0];
      for (let ch = 0; ch < 2; ch++) {
        const db = 20 * Math.log10(Math.max(1e-5, now[ch]));
        const v = Math.min(1, Math.max(0, (db - FLOOR_DB) / -FLOOR_DB));
        // Fast rise, slower fall, like a real meter.
        level[ch] = v > level[ch] ? v : Math.max(v, level[ch] - 0.025);
        if (level[ch] >= peak[ch]) {
          peak[ch] = level[ch];
          peakAge[ch] = 0;
        } else if (++peakAge[ch] > 40) peak[ch] = Math.max(0, peak[ch] - 0.015);
        const col = cols.current[ch];
        if (!col) continue;
        const lit = Math.round(level[ch] * SEGMENTS);
        const top = Math.min(SEGMENTS - 1, Math.round(peak[ch] * SEGMENTS) - 1);
        for (let i = 0; i < SEGMENTS; i++) {
          col.children[i].className = `vu-seg ${i < lit ? 'on' : i === top && peak[ch] > 0.05 ? 'peak' : ''}`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [read]);

  return (
    <div className="vu" title={T('Niveau du son (gauche / droite)')}>
      {[0, 1].map((ch) => (
        <div key={ch} className="vu-col" ref={(el) => (cols.current[ch] = el)}>
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span key={i} className="vu-seg" data-zone={i >= SEGMENTS - 2 ? 'red' : i >= SEGMENTS - 5 ? 'yellow' : 'green'} />
          ))}
        </div>
      ))}
    </div>
  );
}
