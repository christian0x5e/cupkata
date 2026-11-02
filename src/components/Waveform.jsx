import { memo, useEffect, useRef } from 'react';

const PEAKS_PER_SECOND = 100;
const MAX_CANVAS = 8000;

// Draws the visible part [in, in + duration] of a media's peaks across the clip's width.
// memo: while one clip is being trimmed, the other clips' waveforms are not redrawn.
export default memo(function Waveform({ peaks, from, duration, width }) {
  const ref = useRef(null);
  const w = Math.max(1, Math.min(MAX_CANVAS, Math.round(width)));

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !peaks) return;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    const perPixel = (duration * PEAKS_PER_SECOND) / w;
    for (let x = 0; x < w; x++) {
      const a = Math.floor(from * PEAKS_PER_SECOND + x * perPixel);
      const b = Math.max(a + 1, Math.floor(from * PEAKS_PER_SECOND + (x + 1) * perPixel));
      let max = 0;
      for (let i = a; i < b && i < peaks.length; i++) if (peaks[i] > max) max = peaks[i];
      const bar = Math.max(1, (max / 255) * h);
      ctx.fillRect(x, (h - bar) / 2, 1, bar);
    }
  }, [peaks, from, duration, w]);

  if (!peaks) return null;
  return <canvas ref={ref} className="waveform" width={w} height={40} />;
});
