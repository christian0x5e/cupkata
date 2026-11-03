import { useEffect, useRef, useState } from 'react';
import { clipBackground, clipColor, clipGain, clipSpeed, clipTransform, sourceTime, end, isOverlay, laneOf, overlayBox, totalDuration, videoTransitions } from '../project.js';
import OverlayBox, { hitTest, startTransformDrag } from './OverlayBox.jsx';
import VuMeter from './VuMeter.jsx';
import EFFECT_PARAMS from '../../shared/effects.json';

const BGP = EFFECT_PARAMS.background;
import { DEFAULT_RATIO, frameSize, RATIOS } from '../ratio.js';
import { IconCamera, IconFullscreen, IconLoop, IconNextFrame, IconPrevFrame } from './icons.jsx';
import { drawText } from '../text.js';
import { drawTransition } from '../transitions.js';
import { applyEffectItem, clipEffect, drawEffectOverlay, renderClipEffect } from '../effects.js';
import { effectEnvelope } from '../project.js';
import { applyFilterItem, clipFilter } from '../filters.js';
import { gpuEngine } from '../gpu/engine.js';
import { clipDuck, duckGain } from '../ducking.js';
import { drawMoved, hasMotion } from '../keyframes.js';
import { drawReframed, hasReframe } from '../reframe.js';

const layerCanvases = new Map();
function layerContext(key) {
  let c = layerCanvases.get(key);
  if (c && (c.width !== W || c.height !== H)) c = null;
  if (!c) {
    c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    layerCanvases.set(key, c);
  }
  return c.getContext('2d');
}
import { formatTime } from '../format.js';

// Size of the preview picture: 720 pixels on its short side, the other one from the project's format.
// Every drawing function reads these, so changing the format takes effect on the next frame.
let W = 1280;
let H = 720;

// rate: the clip speed (the browser keeps the pitch of the voice while it speeds up or slows down).
function syncElement(el, srcTime, playing, rate = 1) {
  if (el.playbackRate !== rate) el.playbackRate = rate;
  if (playing) {
    if (Math.abs(el.currentTime - srcTime) > 0.3) el.currentTime = srcTime;
    if (el.paused) el.play().catch(() => {});
  } else {
    if (!el.paused) el.pause();
    if (!el.seeking && Math.abs(el.currentTime - srcTime) > 0.03) el.currentTime = srcTime;
  }
}

export default function Preview({
  media, clips, filters, voice, time, playing, muted, zone, selectedId, dispatch, onTime, onEnded, onTogglePlay,
  onStep, loop, onToggleLoop, onSnapshot, ratio = DEFAULT_RATIO, onRatio, captureRef,
}) {
  [W, H] = frameSize(ratio, 720);
  const [ratioOpen, setRatioOpen] = useState(false);
  const canvasRef = useRef(null);
  const sectionRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement === sectionRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const [frameWidth, setFrameWidth] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width));
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);
  const pool = useRef(new Map());
  const gains = useRef(new Map());
  const audioCtx = useRef(null);
  const props = useRef(null);
  props.current = { media, clips, filters, voice, time, playing, muted, zone, onTime, onEnded };
  const clock = useRef({ t: 0, wall: 0 });
  const lastEmitted = useRef(0);
  const bus = useRef(null);

  // Every sound of the preview goes through one bus: to the speakers, and to a left / right
  // analyser that feeds the level meter.
  function mixBus() {
    if (!bus.current) {
      audioCtx.current ??= new AudioContext();
      const ctx = audioCtx.current;
      const input = ctx.createGain();
      // Stereo bus: a mono sound is heard (and measured) on both sides.
      input.channelCount = 2;
      input.channelCountMode = 'explicit';
      input.channelInterpretation = 'speakers';
      input.connect(ctx.destination);
      const split = ctx.createChannelSplitter(2);
      input.connect(split);
      const meters = [0, 1].map((ch) => {
        const a = ctx.createAnalyser();
        a.fftSize = 1024;
        split.connect(a, ch);
        return a;
      });
      bus.current = { ctx, input, meters, buf: new Float32Array(1024) };
    }
    return bus.current;
  }
  const readLevels = useRef(() => {
    const b = bus.current;
    if (!b || b.ctx.state !== 'running') return [0, 0];
    return b.meters.map((a) => {
      a.getFloatTimeDomainData(b.buf);
      let peak = 0;
      for (let i = 0; i < b.buf.length; i++) peak = Math.max(peak, Math.abs(b.buf[i]));
      return peak;
    });
  }).current;

  useEffect(() => {
    clock.current = { t: time, wall: performance.now() };
  }, [playing]);

  useEffect(() => {
    if (Math.abs(time - lastEmitted.current) > 0.05) clock.current = { t: time, wall: performance.now() };
  }, [time]);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    let raf;

    const element = (key, m, kind) => {
      let el = pool.current.get(key);
      if (!el) {
        el = kind === 'image' ? new Image() : document.createElement(kind);
        if (kind !== 'image') {
          el.preload = 'auto';
          el.crossOrigin = 'anonymous';
          const gain = mixBus().ctx.createGain();
          mixBus().ctx.createMediaElementSource(el).connect(gain).connect(mixBus().input);
          gains.current.set(key, gain);
        }
        el.src = window.cupkata.mediaUrl(m.path);
        pool.current.set(key, el);
      }
      return el;
    };

    const setGain = (key, value) => {
      const g = gains.current.get(key);
      // Muted while a voice-over is recorded, so the speakers don't leak into the microphone.
      if (g) g.gain.value = props.current.muted ? 0 : value;
    };

    const drawFit = (c, src, w, h) => {
      if (!w || !h) return;
      const s = Math.min(W / w, H / h);
      const dw = w * s;
      const dh = h * s;
      c.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    };

    // A main-track frame with its background (same constants and order as the export's backgroundChain):
    // blur = the picture zoomed past the frame, blurred and dimmed, under the fitted picture;
    // fill = the picture zoomed to cover the frame; color = a plain colour under the fitted picture.
    const paintFrame = (c, clip, [src, w, h], css, sourceAt) => {
      if (!w || !h) return;
      const bg = clipBackground(clip);
      const filter = (extra) => [extra, css].filter((f) => f && f !== 'none').join(' ') || 'none';
      if (hasReframe(clip) && sourceAt != null) {
        c.filter = filter('');
        drawReframed(c, src, w, h, W, H, clip.reframe, sourceAt);
        c.filter = 'none';
        return;
      }
      if (bg.mode === 'color') {
        c.fillStyle = bg.color;
        c.fillRect(0, 0, W, H);
      }
      if (bg.mode === 'blur' || bg.mode === 'fill') {
        const k = Math.max(W / w, H / h) * (bg.mode === 'blur' ? BGP.margin : 1);
        const sigma = (BGP.sigmaMin + BGP.sigmaRange * bg.blur) * Math.min(W, H);
        c.filter = filter(bg.mode === 'blur' ? `blur(${sigma.toFixed(2)}px) brightness(${BGP.dim})` : '');
        c.drawImage(src, (W - w * k) / 2, (H - h * k) / 2, w * k, h * k);
      }
      if (bg.mode !== 'fill') {
        c.filter = filter('');
        drawFit(c, src, w, h);
      }
      c.filter = 'none';
    };

    const cssFilter = (clip) => {
      const { brightness, contrast, saturation } = clipColor(clip);
      return brightness === 1 && contrast === 1 && saturation === 1
        ? 'none'
        : `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
    };

    // Syncs a video clip's element to time t and returns a function that draws its frame on a context.
    // Outside the source range (transition handles) the frame is held, like FFmpeg's clone padding.
    function layer(clip, t, slot, audible, byId, active, playing, canvasKey) {
      const m = byId.get(clip.mediaId);
      if (!m) return () => {};
      if (m.missing) {
        return (c) => {
          c.fillStyle = '#8b919c';
          c.font = '28px "Segoe UI", sans-serif';
          c.textAlign = 'center';
          c.fillText(`Média introuvable : ${m.name}`, W / 2, H / 2);
        };
      }
      const base = cssFilter(clip);
      let source = null;
      if (m.type === 'image') {
        const img = element('i:' + m.path, m, 'image');
        if (img.complete) source = [img, img.naturalWidth, img.naturalHeight];
      } else {
        const key = slot + m.path;
        const el = element(key, m, 'video');
        active.add(key);
        const raw = sourceTime(clip, t);
        const held = raw < 0 || raw > m.duration - 0.05;
        setGain(key, audible ? clipGain(clip, t) : 0);
        syncElement(el, Math.min(Math.max(raw, 0), Math.max(0, m.duration - 0.05)), playing && !held, clipSpeed(clip));
        if (el.readyState >= 2) source = [el, el.videoWidth, el.videoHeight];
      }
      // A colour filter is applied to the fitted, colour-adjusted frame before any effect (same order as the export).
      let colorCss = base;
      let painted = false;
      const look = source && clipFilter(clip, props.current.filters);
      if (look) {
        const graded = layerContext(`graded-${canvasKey}`);
        graded.fillStyle = '#000';
        graded.fillRect(0, 0, W, H);
        paintFrame(graded, clip, source, base, m.type === 'video' ? sourceTime(clip, t) : null);
        source = [gpuEngine(W, H, 'lut').renderLut(graded.canvas, look.id, look.data, look.size, look.amount), W, H];
        colorCss = 'none';
        painted = true;
      }
      const drawFrame = (c, extra) => {
        if (!source) return;
        const filter = [colorCss, extra].filter((f) => f && f !== 'none').join(' ');
        if (painted) {
          c.filter = filter || 'none';
          drawFit(c, ...source);
          c.filter = 'none';
        } else paintFrame(c, clip, source, filter, m.type === 'video' ? sourceTime(clip, t) : null);
      };
      // Each layer is rendered with its effect into its own canvas first, so transitions
      // can blend it like a plain frame.
      return (c) => {
        const off = layerContext(canvasKey);
        renderClipEffect(off, W, H, clipEffect(clip), t - clip.start, drawFrame);
        if (hasMotion(clip)) drawMoved(c, off.canvas, W, H, clipTransform(clip, t - clip.start));
        else c.drawImage(off.canvas, 0, 0);
      };
    }

    // Draws an overlay clip: colour settings and filter, then placed, scaled, rotated and faded.
    function drawOverlay(c, t, p, byId, active) {
      const m = byId.get(c.mediaId);
      if (!m || m.missing) return;
      let source = null;
      if (m.type === 'image') {
        const img = element('i:' + m.path, m, 'image');
        if (img.complete && img.naturalWidth) source = [img, img.naturalWidth, img.naturalHeight];
      } else {
        const key = `o${laneOf(c)}:${m.path}`;
        const el = element(key, m, 'video');
        active.add(key);
        const raw = sourceTime(c, t);
        setGain(key, clipGain(c, t));
        syncElement(el, Math.min(Math.max(raw, 0), Math.max(0, m.duration - 0.05)), p.playing, clipSpeed(c));
        if (el.readyState >= 2) source = [el, el.videoWidth, el.videoHeight];
      }
      if (!source) return;
      const [src, sw, sh] = source;
      const box = overlayBox(c, m.width || sw, m.height || sh, W, H, t - c.start);
      let image = src;
      let crop = [0, 0, sw, sh];
      let css = cssFilter(c);
      const look = clipFilter(c, p.filters);
      if (look) {
        // Same grading path as the main track: colour, then the LUT on the fitted frame.
        const graded = layerContext(`overlay-${laneOf(c)}`);
        graded.fillStyle = '#000';
        graded.fillRect(0, 0, W, H);
        graded.filter = css;
        drawFit(graded, src, sw, sh);
        graded.filter = 'none';
        image = gpuEngine(W, H, 'lut').renderLut(graded.canvas, look.id, look.data, look.size, look.amount);
        const fit = Math.min(W / sw, H / sh);
        crop = [(W - sw * fit) / 2, (H - sh * fit) / 2, sw * fit, sh * fit];
        css = 'none';
      }
      ctx.save();
      ctx.globalAlpha = box.opacity;
      ctx.translate(box.cx, box.cy);
      ctx.rotate((box.rotation * Math.PI) / 180);
      ctx.filter = css;
      ctx.drawImage(image, ...crop, -box.w / 2, -box.h / 2, box.w, box.h);
      ctx.restore();
    }

    function render(t, p) {
      const byId = new Map(p.media.map((m) => [m.id, m]));
      const active = new Set();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      const tr = videoTransitions(p.clips).find((x) => t >= x.from && t < x.to);
      if (tr) {
        const ownerIsA = t < tr.b.start;
        const pathA = byId.get(tr.a.mediaId)?.path;
        const pathB = byId.get(tr.b.mediaId)?.path;
        const drawA = layer(tr.a, t, 'v:', ownerIsA, byId, active, p.playing, 'A');
        const drawB = layer(tr.b, t, pathA === pathB ? 'v2:' : 'v:', !ownerIsA, byId, active, p.playing, 'B');
        drawTransition(ctx, W, H, tr.type, (t - tr.from) / tr.d, drawA, drawB);
      } else {
        const vclip = p.clips.find((c) => c.track === 'video' && laneOf(c) === 0 && t >= c.start && t < end(c));
        if (vclip) layer(vclip, t, 'v:', true, byId, active, p.playing, 'A')(ctx);
      }

      // Overlays (video lanes above the main track), from the lowest lane up.
      const overlaysNow = p.clips
        .filter((c) => isOverlay(c) && t >= c.start && t < end(c))
        .sort((a, b) => laneOf(a) - laneOf(b));
      for (const c of overlaysNow) drawOverlay(c, t, p, byId, active);

      for (const c of p.clips) {
        if (c.track === 'video' && laneOf(c) === 0 && t >= c.start && t < end(c)) drawEffectOverlay(ctx, c, t - c.start, W, H);
      }

      // Track items: filters first, then effects (texts stay on top); stacked lanes apply from the
      // bottom lane up, so an upper lane acts on the result of the lanes below it.
      const stacked = [...p.clips].sort((a, b) => laneOf(a) - laneOf(b));
      for (const c of stacked) {
        if (c.track === 'filter' && t >= c.start && t < end(c)) {
          applyFilterItem(ctx, W, H, c, effectEnvelope(c, t - c.start), p.filters, gpuEngine(W, H, 'lut-track'));
        }
      }
      for (const c of stacked) {
        if (c.track === 'fx' && t >= c.start && t < end(c)) applyEffectItem(ctx, W, H, c, t - c.start, effectEnvelope(c, t - c.start));
      }

      for (const c of stacked) {
        if (c.track === 'text' && t >= c.start && t < end(c)) drawText(ctx, c, W, H, t - c.start);
      }

      for (const c of p.clips) {
        if (c.track !== 'audio' || t < c.start || t >= end(c)) continue;
        const m = byId.get(c.mediaId);
        if (m.missing) continue;
        // One player per lane: the same file may play on two lanes at once.
        const key = `a${laneOf(c)}:${m.path}`;
        active.add(key);
        const el = element(key, m, 'audio');
        const duck = clipDuck(c);
        setGain(key, clipGain(c, t) * (duck ? duckGain(t, p.voice || [], duck.level) : 1));
        syncElement(el, sourceTime(c, t), p.playing, clipSpeed(c));
      }

      if (p.playing && audioCtx.current?.state === 'suspended') audioCtx.current.resume().catch(() => {});

      for (const [key, el] of pool.current) {
        if (!key.startsWith('i:') && !active.has(key) && !el.paused) el.pause();
      }
    }

    function frame() {
      const p = props.current;
      let t = p.time;
      if (p.playing) {
        // A play zone stops playback at its end; otherwise at the end of the montage.
        const stop = p.zone ? Math.min(p.zone[1], totalDuration(p.clips)) : totalDuration(p.clips);
        t = clock.current.t + (performance.now() - clock.current.wall) / 1000;
        const ended = t >= stop;
        if (ended) t = stop;
        lastEmitted.current = t;
        p.onTime(t);
        // After the time update, so a loop's jump back to the start isn't overwritten by the end time.
        if (ended) p.onEnded();
      }
      // A frame that fails to draw must not stop the preview loop for good.
      try {
        render(t, p);
      } catch (err) {
        if (window.cupkataLastPreviewError !== String(err)) console.error('Aperçu :', err);
        window.cupkataLastPreviewError = String(err);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      for (const el of pool.current.values()) if (el.pause) el.pause();
      audioCtx.current?.close();
    };
  }, []);

  const total = totalDuration(clips);
  const mediaOf = (c) => media.find((m) => m.id === c.mediaId);
  // Items that can be picked on the picture: texts (on top) and overlays, at the playhead.
  const movable = (c) =>
    time >= c.start && time < end(c) && ((c.track === 'text' && (c.text || '').trim()) || (isOverlay(c) && mediaOf(c)?.width));
  const selected = clips.find((c) => c.id === selectedId && movable(c));

  // A click on a text or an overlay selects it (and can drag it straight away); elsewhere it plays / pauses.
  function onCanvasDown(e) {
    if (e.button !== 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    const order = (c) => (c.track === 'text' ? 1000 : 0) + laneOf(c);
    const hit = clips
      .filter(movable)
      .sort((a, b) => order(b) - order(a))
      .find((c) => hitTest(c, mediaOf(c), W, H, px, py, time - c.start));
    if (!hit || playing) {
      onTogglePlay();
      return;
    }
    dispatch({ type: 'SELECT', id: hit.id });
    startTransformDrag(e, hit, 'move', rect, W, H, mediaOf(hit), dispatch, time - hit.start);
  }

  // Full screen: the whole preview (picture and its control bar) fills the screen; Échap leaves.
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else sectionRef.current?.requestFullscreen().catch(() => {});
  };

  // For the local API: the picture once every file has reached the wanted time. Several calm frames in
  // a row are required, because the preview only starts a seek on the frame after a time change.
  if (captureRef) {
    captureRef.current = {
      capture: async () => {
        const ready = (el) => (el instanceof HTMLImageElement ? el.complete : el.preload !== 'auto' || (!el.seeking && el.readyState >= 2));
        const limit = performance.now() + 5000;
        let calm = 0;
        while (calm < 4 && performance.now() < limit) {
          await new Promise((resolve) => {
            const fallback = setTimeout(resolve, 100);
            requestAnimationFrame(() => {
              clearTimeout(fallback);
              resolve();
            });
          });
          calm = [...pool.current.values()].every(ready) ? calm + 1 : 0;
        }
        return {
          png_base64: canvasRef.current.toDataURL('image/png').slice('data:image/png;base64,'.length),
          width: canvasRef.current.width,
          height: canvasRef.current.height,
          settled: calm >= 4,
        };
      },
    };
  }

  // Photo of the picture shown now (what you see in the preview), saved as a PNG and added to Médias.
  const snapshot = () =>
    canvasRef.current.toBlob(async (blob) => {
      if (blob) onSnapshot(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/png');

  return (
    <section className={`panel preview ${fullscreen ? 'is-full' : ''}`} ref={sectionRef} onDoubleClick={(e) => e.target === canvasRef.current && toggleFullscreen()}>
      <div className="preview-stage">
        <div className="preview-frame" style={{ aspectRatio: `${W} / ${H}`, width: `min(100cqw, 100cqh * ${W / H})` }}>
          <canvas ref={canvasRef} width={W} height={H} onPointerDown={onCanvasDown} />
          {selected && !playing && (
            <OverlayBox clip={selected} media={mediaOf(selected)} canvas={canvasRef.current} width={frameWidth} W={W} H={H} dispatch={dispatch} tau={time - selected.start} />
          )}
          {clips.length === 0 && (
            <div className="preview-hint">
              <strong>L'aperçu montre ta timeline</strong>
              <span>Double-clique sur un média, ou glisse-le sur la timeline, pour le voir ici.</span>
            </div>
          )}
        </div>
      </div>
      <div className="preview-controls">
        <div className="pc-left">
          <span className="tc current">{formatTime(time)}</span>
          <span className="tc sep">/</span>
          <span className="tc">{formatTime(total)}</span>
          <VuMeter read={readLevels} />
        </div>
        <div className="pc-center">
          <button className="pc-btn" onClick={() => onStep(-1)} disabled={total <= 0} title="Image précédente (←)">
            <IconPrevFrame />
          </button>
          <button className="play" onClick={onTogglePlay} disabled={total <= 0} aria-label={playing ? 'Pause' : 'Lecture'} title="Lecture / pause (Espace)">
            {playing ? '❚❚' : '▶'}
          </button>
          <button className="pc-btn" onClick={() => onStep(1)} disabled={total <= 0} title="Image suivante (→)">
            <IconNextFrame />
          </button>
        </div>
        <div className="pc-right">
          <div className="ratio-wrap">
            <button className={`pc-btn ratio-btn ${ratioOpen ? 'on' : ''}`} onClick={() => setRatioOpen((v) => !v)} title="Format de la vidéo (aperçu et export)">
              {ratio}
            </button>
            {ratioOpen && (
              <div className="ratio-menu" onMouseLeave={() => setRatioOpen(false)}>
                {RATIOS.map((r) => (
                  <button
                    key={r.id}
                    className={r.id === ratio ? 'active' : ''}
                    onClick={() => {
                      onRatio(r.id);
                      setRatioOpen(false);
                    }}
                  >
                    <span className="ratio-shape" style={{ width: r.w >= r.h ? 18 : (18 * r.w) / r.h, height: r.w >= r.h ? (18 * r.h) / r.w : 18 }} />
                    <span className="ratio-id">{r.id}</span>
                    <span className="ratio-hint">{r.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className={`pc-btn ${loop ? 'on' : ''}`} onClick={onToggleLoop} title="Lecture en boucle (la zone de lecture si elle existe)">
            <IconLoop />
          </button>
          <button className="pc-btn" onClick={snapshot} disabled={clips.length === 0} title="Capture de l'image : enregistrée en PNG et ajoutée aux médias">
            <IconCamera />
          </button>
          <button className="pc-btn" onClick={toggleFullscreen} title={fullscreen ? 'Quitter le plein écran (Échap)' : 'Plein écran (double-clic sur l’image)'}>
            <IconFullscreen exit={fullscreen} />
          </button>
        </div>
      </div>
    </section>
  );
}
