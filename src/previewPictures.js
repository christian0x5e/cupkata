// The pictures of the Transitions, Filters and Effects tiles: the user's own media when there are some, sample photos otherwise.
import { useEffect, useState } from 'react';
import day from './samples/day.jpg?inline';
import night from './samples/night.jpg?inline';

export const TILE_W = 240;
export const TILE_H = 135;
const SAMPLES = [day, night];
const SWEEP = 2400;

// Thumbnails to show, best first: the media asked for, then the ones in the montage, then the rest of the bin.
export function previewFiles(clips, media, wanted = []) {
  const byId = new Map(media.map((m) => [m.id, m]));
  const montage = clips.filter((c) => c.track === 'video').sort((a, b) => a.start - b.start).map((c) => c.mediaId);
  return [...new Set([...wanted, ...montage, ...media.map((m) => m.id)])]
    .map((id) => byId.get(id))
    .filter((m) => m?.thumb && !m.missing && m.type !== 'audio')
    .map((m) => m.thumb);
}

const loaded = new Map();

// Loaded once per picture and cropped to the tile, without distortion. Cross-origin mode keeps the canvas readable.
function loadPicture(url) {
  if (!loaded.has(url)) {
    loaded.set(url, new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = TILE_W;
        canvas.height = TILE_H;
        const scale = Math.max(TILE_W / img.naturalWidth, TILE_H / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        canvas.getContext('2d').drawImage(img, (TILE_W - w) / 2, (TILE_H - h) / 2, w, h);
        resolve(canvas);
      };
      img.onerror = () => {
        loaded.delete(url);
        reject(new Error(url));
      };
      img.src = url;
    }));
  }
  return loaded.get(url);
}

// True once the element has come near the visible area, so that long lists only draw what is looked at.
export function useSeen(ref) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return undefined;
    const watcher = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setSeen(true);
    }, { rootMargin: '200px' });
    watcher.observe(ref.current);
    return () => watcher.disconnect();
  }, [ref, seen]);
  return seen;
}

// A line sweeps across what ctx holds, with the original picture on its left, to compare before and after.
// Returns the function that stops it.
export function playComparison(ctx, original) {
  const after = document.createElement('canvas');
  after.width = TILE_W;
  after.height = TILE_H;
  after.getContext('2d').drawImage(ctx.canvas, 0, 0);
  let raf;
  const t0 = performance.now();
  const loop = () => {
    const x = TILE_W * (0.5 - 0.5 * Math.cos((2 * Math.PI * (performance.now() - t0)) / SWEEP));
    ctx.drawImage(after, 0, 0);
    ctx.drawImage(original, 0, 0, x, TILE_H, 0, 0, x, TILE_H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 1, 0, 2, TILE_H);
    raf = requestAnimationFrame(loop);
  };
  loop();
  return () => cancelAnimationFrame(raf);
}

// One picture per slot; a file that is missing or cannot be read leaves the sample photo of its slot.
export function usePreviewPictures(files, count) {
  const [pictures, setPictures] = useState(null);
  const key = files.slice(0, count).join('\n');
  useEffect(() => {
    let live = true;
    const wanted = key ? key.split('\n') : [];
    Promise.all(SAMPLES.slice(0, count).map(async (sample, i) => {
      if (wanted[i]) {
        try {
          return await loadPicture(window.cupkata.mediaUrl(wanted[i]));
        } catch {
          // Falls through to the sample.
        }
      }
      return loadPicture(sample);
    })).then((list) => {
      if (live) setPictures(list);
    });
    return () => {
      live = false;
    };
  }, [key, count]);
  return pictures;
}
