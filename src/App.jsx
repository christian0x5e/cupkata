import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { initialState, laneOf, overlaps, reducer, selectionOf, sourceTime, totalDuration } from './project.js';
import GroupInspector from './components/GroupInspector.jsx';

const FREEZE_DURATION = 3;
import { FPS } from './format.js';
import { DEFAULT_RATIO, frameSize } from './ratio.js';
import MediaBin from './components/MediaBin.jsx';
import Preview from './components/Preview.jsx';
import Timeline from './components/Timeline.jsx';
import Inspector from './components/Inspector.jsx';
import SubtitlesModal from './components/SubtitlesModal.jsx';
import EffectsPanel from './components/EffectsPanel.jsx';
import FiltersPanel from './components/FiltersPanel.jsx';
import VoiceoverPanel from './components/VoiceoverPanel.jsx';
import Splitter from './components/Splitter.jsx';
import TextPanel from './components/TextPanel.jsx';
import CaptionsPanel from './components/CaptionsPanel.jsx';
import TransitionsPanel from './components/TransitionsPanel.jsx';
import { IconAudio, IconCaptions, IconEffects, IconFilters, IconMedia, IconText, IconTransitions } from './components/icons.jsx';

// Tabs of the left panel (only the ones Cupkata has tools for).
const LEFT_TABS = [
  ['media', 'Médias', IconMedia],
  ['audio', 'Audio', IconAudio],
  ['text', 'Texte', IconText],
  ['effects', 'Effets', IconEffects],
  ['transitions', 'Transitions', IconTransitions],
  ['captions', 'Sous-titres', IconCaptions],
  ['filters', 'Filtres', IconFilters],
];
import { buildCaptions, placeCaptions } from './captions.js';
import { DEFAULT_TEXT_STYLE } from './text.js';
import { voiceIntervals } from './ducking.js';
import { prerenderGpu } from './gpu/exporter.js';
import { drawText, isAnimated, renderTextPng } from './text.js';
import { applyEffectItem, clipEffect, drawEffectOverlay, SEQUENCE_EFFECTS, STILL_EFFECTS } from './effects.js';
import { effectEnvelope } from './project.js';
import { applyFilterItem, clipFilter, filterInfo } from './filters.js';
import { gpuEngine } from './gpu/engine.js';
import { installControl } from './control.js';
import AiControlPanel from './components/AiControlPanel.jsx';

// Merges [start, end] ranges that overlap or touch, so stacked track items are processed together.
function mergeRanges(ranges, gap) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + gap) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function stillPng(W, H, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  draw(canvas.getContext('2d'));
  return canvas.toDataURL('image/png');
}

async function canvasBytes(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

const api = window.cupkata;
// Export resolution: the length of the picture's short side (the format gives the other one).
const SHORT_SIDE = { '720p': 720, '1080p': 1080, '1440p': 1440 };
const cleanError = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
// Panel sizes (media column, inspector column, timeline height), remembered between sessions.
const LAYOUT_KEY = 'cupkata.layout.v2';
const DEFAULT_LAYOUT = { left: 440, right: 300, timeline: 400 };
function loadLayout() {
  try {
    return { ...DEFAULT_LAYOUT, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

const fileName = (p) => (p ? p.split(/[\\/]/).pop().replace(/\.cupkata$/i, '') : 'Sans titre');

function ExportModal({ exp, onClose, onCancelPrepare }) {
  if (!exp) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        {exp.status === 'preparing' && (
          <>
            <h2>Préparation des effets…</h2>
            <div className="progress">
              <div style={{ width: `${Math.round(exp.progress * 100)}%` }} />
            </div>
            <p className="muted">{Math.round(exp.progress * 100)} %</p>
            <div className="modal-actions">
              <button className="btn" onClick={onCancelPrepare}>
                Annuler
              </button>
            </div>
          </>
        )}
        {exp.status === 'running' && (
          <>
            <h2>Export en cours…</h2>
            <div className="progress">
              <div style={{ width: `${Math.round(exp.progress * 100)}%` }} />
            </div>
            <p className="muted">{Math.round(exp.progress * 100)} %</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => api.cancelExport()}>
                Annuler
              </button>
            </div>
          </>
        )}
        {exp.status === 'done' && (
          <>
            <h2>Vidéo exportée</h2>
            <p className="muted path">{exp.out}</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => api.showInFolder(exp.out)}>
                Ouvrir le dossier
              </button>
              <button className="btn primary" onClick={onClose}>
                Fermer
              </button>
            </div>
          </>
        )}
        {exp.status === 'error' && (
          <>
            <h2>L'export a échoué</h2>
            <pre className="error-text">{exp.message}</pre>
            <div className="modal-actions">
              <button className="btn primary" onClick={onClose}>
                Fermer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RecoveryModal({ recovery, onResume, onDiscard }) {
  if (!recovery) return null;
  const when = new Date(recovery.savedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Reprendre ton dernier montage ?</h2>
        <p className="muted">
          « {fileName(recovery.filePath)} » — {recovery.clips.length} clip{recovery.clips.length > 1 ? 's' : ''}, sauvegardé
          automatiquement le {when}.
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={onDiscard}>
            Nouveau projet
          </button>
          <button className="btn primary" onClick={onResume}>
            Reprendre
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pps, setPps] = useState(60);
  const [resolution, setResolution] = useState('1080p');
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [normalize, setNormalize] = useState(false);
  const [exp, setExp] = useState(null);
  const [projectPath, setProjectPath] = useState(null);
  const [saved, setSaved] = useState({ media: initialState.media, clips: initialState.clips, resolution: '1080p' });
  const [recovery, setRecovery] = useState(null);
  const [ready, setReady] = useState(false);
  const [notice, showNotice] = useState(null);
  // The local API reads the last message to report a tool's failure to its caller.
  const notices = useRef({ last: null }).current;
  const setNotice = useCallback((n) => {
    if (n) notices.last = n;
    showNotice(n);
  }, [notices]);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState({ enabled: false });
  const [aiLog, setAiLog] = useState([]);
  const previewCapture = useRef(null);
  const exportCancelled = useRef(false);
  const [subtitlesOpen, setSubtitlesOpen] = useState(false);
  const [leftTab, setLeftTab] = useState('media');
  const [peaks, setPeaks] = useState(() => new Map());
  const [hoverTime, setHoverTime] = useState(null);
  const [magnet, setMagnet] = useState(true);
  const [link, setLink] = useState(true);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(false);
  const [zone, setZone] = useState(null);
  const [busy, setBusy] = useState(null);
  const [loop, setLoop] = useState(false);
  const [aiJob, setAiJob] = useState(null);
  useEffect(() => api.onAiProgress((p) => setAiJob((j) => (j ? { ...j, ...p } : j))), []);
  const [layout, setLayout] = useState(loadLayout);
  const resize = (key) => (v) => setLayout((l) => ({ ...l, [key]: v }));
  const resetSize = (key) => () => setLayout((l) => ({ ...l, [key]: DEFAULT_LAYOUT[key] }));
  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      // Sizes are only a convenience: without storage they simply reset next time.
    }
  }, [layout]);

  // Load waveform peaks once per audio-bearing media file.
  useEffect(() => {
    for (const m of state.media) {
      if (!m.hasAudio || m.missing || peaks.has(m.path)) continue;
      setPeaks((prev) => new Map(prev).set(m.path, null));
      api
        .getPeaks(m.path)
        .then((p) => setPeaks((prev) => new Map(prev).set(m.path, p)))
        .catch(() => {});
    }
  }, [state.media, peaks]);

  const total = totalDuration(state.clips);
  const dirty =
    state.media !== saved.media || state.clips !== saved.clips || resolution !== saved.resolution || ratio !== saved.ratio ||
    (state.filters.length > 0 && state.filters !== saved.filters);
  const hasContent = state.media.length > 0 || state.clips.length > 0;
  const selectedClip = state.clips.find((c) => c.id === state.selectedId);
  const voice = useMemo(() => voiceIntervals(state.clips, state.media, peaks), [state.clips, state.media, peaks]);
  const selectedHasPrev =
    selectedClip?.track === 'video' &&
    state.clips.some((c) => c.track === 'video' && c.id !== selectedClip.id && Math.abs(c.start + c.duration - selectedClip.start) < 1e-3);

  useEffect(() => {
    if (time > total) setTime(total);
  }, [total, time]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const showError = (err) => setNotice({ kind: 'error', text: cleanError(err) });

  const serialize = useCallback(
    () => ({
      settings: { resolution, normalize, ratio },
      media: state.media.map(({ id, path, name, type, duration, width, height, hasAudio }) => ({
        id, path, name, type, duration, width, height, hasAudio,
      })),
      clips: state.clips,
      filters: state.filters.map(({ id, name, size, data }) => ({ id, name, size, data: Array.from(data, (v) => Math.round(v * 1e4) / 1e4) })),
    }),
    [state.media, state.clips, state.filters, resolution, normalize, ratio],
  );

  // Track unsaved changes in the window title and for the close prompt.
  useEffect(() => {
    document.title = `${dirty && hasContent ? '• ' : ''}${fileName(projectPath)} — Cupkata`;
    api.setDirty(dirty && hasContent);
  }, [dirty, hasContent, projectPath]);

  useEffect(() => {
    api
      .recoverAutosave()
      .then((r) => (r && (r.media.length || r.clips.length) ? setRecovery(r) : setReady(true)))
      .catch(() => setReady(true));
  }, []);

  // Autosave only once the recovery choice is made, so an empty startup state never overwrites the backup.
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => api.autosave({ filePath: projectPath, project: serialize() }).catch(() => {}), 800);
    return () => clearTimeout(id);
  }, [ready, serialize, projectPath]);

  function applyProject(p, markSaved) {
    setPlaying(false);
    setTime(0);
    setZone(null);
    dispatch({ type: 'LOAD_PROJECT', media: p.media, clips: p.clips, filters: p.filters || [] });
    setResolution(p.settings.resolution);
    setRatio(p.settings.ratio || DEFAULT_RATIO);
    setNormalize(p.settings.normalize === true);
    setProjectPath(p.filePath);
    setSaved(
      markSaved
        ? { media: p.media, clips: p.clips, filters: p.filters, resolution: p.settings.resolution, ratio: p.settings.ratio || DEFAULT_RATIO }
        : { media: null, clips: null, resolution: null, ratio: null },
    );
    const missing = p.media.filter((m) => m.missing).length;
    if (missing) {
      setNotice({ kind: 'error', text: `${missing} média${missing > 1 ? 's' : ''} introuvable${missing > 1 ? 's' : ''} : clique dessus dans « Médias » pour le${missing > 1 ? 's' : ''} retrouver.` });
    }
  }

  async function confirmDiscard() {
    if (!dirty || !hasContent) return true;
    return api.confirm('Ton montage a des modifications non enregistrées. Continuer sans enregistrer ?');
  }

  async function newProject() {
    if (!(await confirmDiscard())) return;
    applyProject({ media: [], clips: [], settings: { resolution: '1080p' }, filePath: null }, true);
  }

  async function openProject() {
    if (!(await confirmDiscard())) return;
    try {
      const p = await api.openProject();
      if (p) applyProject(p, true);
    } catch (err) {
      showError(err);
    }
  }

  async function saveProject(saveAs = false) {
    try {
      const target = await api.saveProject(serialize(), saveAs ? null : projectPath);
      if (!target) return;
      setProjectPath(target);
      setSaved({ media: state.media, clips: state.clips, filters: state.filters, resolution, ratio });
      setNotice({ kind: 'ok', text: 'Projet enregistré' });
    } catch (err) {
      showError(err);
    }
  }

  // After a paste the playhead goes to its end, so pasting again continues the sequence.
  useEffect(() => {
    if (state.pasted) setTime(state.pasted.end);
  }, [state.pasted]);

  const seek = useCallback((t) => setTime(Math.max(0, Math.min(t, total))), [total]);

  // With a play zone, playback starts at its beginning (unless the playhead is already inside it).
  const togglePlay = useCallback(() => {
    if (total <= 0) return;
    if (!playing && zone && (time < zone[0] || time >= Math.min(zone[1], total) - 1e-3)) setTime(zone[0]);
    else if (!playing && time >= total - 1e-3) setTime(0);
    setPlaying(!playing);
  }, [total, time, playing, zone]);

  // Freeze frame: the selected video clip (or the main-track clip under the playhead) is cut at the
  // playhead and a 3 s still of that frame is inserted.
  async function freezeFrame(clip) {
    const inside = (c) => time > c.start + 0.05 && time < c.start + c.duration - 0.05;
    const isVideo = (c) => c?.track === 'video' && state.media.find((m) => m.id === c.mediaId)?.type === 'video';
    const target = [clip, selectedClip, state.clips.find((c) => c.track === 'video' && laneOf(c) === 0 && inside(c))].find(
      (c) => isVideo(c) && inside(c),
    );
    if (!target) {
      setNotice({ kind: 'error', text: 'Place la tête de lecture sur un clip vidéo pour figer son image.' });
      return;
    }
    const m = state.media.find((x) => x.id === target.mediaId);
    setPlaying(false);
    setBusy('freeze');
    try {
      const item = await api.freezeFrame(m.path, sourceTime(target, time));
      const id = crypto.randomUUID();
      dispatch({ type: 'ADD_MEDIA', items: [{ ...item, id }] });
      dispatch({ type: 'FREEZE', id: target.id, time, mediaId: id, duration: FREEZE_DURATION });
      setNotice({ kind: 'ok', text: 'Image figée insérée (3 s) — tire ses bords pour changer sa durée.' });
    } catch (err) {
      showError(err);
    } finally {
      setBusy(null);
    }
  }

  // Reverse: a reversed copy of the part of the source the clip uses (a second click puts it back).
  async function reverseClip(clip) {
    const speed = clip.speed ?? 1;
    if (clip.reversed) {
      const { mediaId, in: in0, span } = clip.reversed;
      const back = Math.max(0, in0 + span - clip.in - clip.duration * speed);
      dispatch({ type: 'SET_SOURCE', id: clip.id, mediaId, in: back, reversed: null });
      return;
    }
    const m = state.media.find((x) => x.id === clip.mediaId);
    const span = clip.duration * speed;
    setPlaying(false);
    setBusy('reverse');
    try {
      const item = await api.reverseMedia(m.path, clip.in, span);
      const id = crypto.randomUUID();
      dispatch({ type: 'ADD_MEDIA', items: [{ ...item, id }] });
      dispatch({ type: 'SET_SOURCE', id: clip.id, mediaId: id, in: 0, reversed: { mediaId: m.id, in: clip.in, span } });
      setNotice({ kind: 'ok', text: 'Clip inversé : il se lit maintenant à l’envers.' });
    } catch (err) {
      showError(err);
    } finally {
      setBusy(null);
    }
  }

  // ── AI tools (run on this computer; see electron/ai.cjs) ──
  async function runAi(label, work) {
    setPlaying(false);
    setAiJob({ label, phase: 'model', progress: 0 });
    try {
      return await work();
    } catch (err) {
      if (cleanError(err) !== 'Opération annulée') showError(err);
      return null;
    } finally {
      setAiJob(null);
    }
  }

  // Background removal: the clip plays a copy without its background (a second click puts it back).
  async function cutoutClip(clip) {
    if (clip.cutout) {
      dispatch({ type: 'SET_SOURCE', id: clip.id, mediaId: clip.cutout.mediaId, in: clip.cutout.in, extra: { cutout: null } });
      return;
    }
    const m = state.media.find((x) => x.id === clip.mediaId);
    const isImage = m.type === 'image';
    const item = await runAi('Détourage (suppression de l’arrière-plan)', () =>
      api.aiCutout({ path: m.path, isImage, start: clip.in, span: clip.duration * (clip.speed ?? 1), width: m.width, height: m.height }),
    );
    if (!item) return;
    const id = crypto.randomUUID();
    dispatch({ type: 'ADD_MEDIA', items: [{ ...item, id }] });
    dispatch({ type: 'SET_SOURCE', id: clip.id, mediaId: id, in: 0, extra: { cutout: { mediaId: m.id, in: clip.in } } });
    setNotice({
      kind: 'ok',
      text: laneOf(clip) > 0
        ? 'Arrière-plan supprimé : ce qui est en dessous apparaît maintenant autour.'
        : 'Arrière-plan supprimé. Mets le clip sur une piste d’incrustation, ou choisis un fond (Couleur, Flou) dans Propriétés.',
    });
  }

  // Cut out the silences of a clip with sound (speech found by Silero VAD).
  async function cutSilences(clip, minSilence = 0.5) {
    const m = state.media.find((x) => x.id === clip.mediaId);
    const speed = clip.speed ?? 1;
    const keep = await runAi('Recherche des silences', () =>
      api.aiSilences({ path: m.path, start: clip.in, span: clip.duration * speed, minSilence }),
    );
    if (!keep) return;
    const parts = keep.map(([a, b]) => [a / speed, Math.min(clip.duration, b / speed)]);
    const kept = parts.reduce((n, [a, b]) => n + b - a, 0);
    if (!parts.length) {
      setNotice({ kind: 'error', text: 'Aucune parole trouvée dans ce clip : rien n’a été coupé.' });
      return;
    }
    if (clip.duration - kept < 0.2) {
      setNotice({ kind: 'ok', text: 'Pas de silence assez long à couper dans ce clip.' });
      return;
    }
    dispatch({ type: 'CUT_SILENCES', id: clip.id, keep: parts });
    setNotice({ kind: 'ok', text: `${(clip.duration - kept).toFixed(1).replace('.', ',')} s de silence retirées (${parts.length} morceaux). Ctrl+Z pour annuler.` });
  }

  // Text to speech: the text of a text clip, read by a voice, placed on the Audio track at its start.
  async function speakText(clip, lang, rate) {
    const item = await runAi('Création de la voix', () => api.aiSpeak({ text: clip.text, lang, rate }));
    if (!item) return;
    const id = crypto.randomUUID();
    dispatch({ type: 'ADD_MEDIA', items: [{ ...item, id }] });
    dispatch({ type: 'ADD_CLIP', mediaId: id, track: 'audio', start: clip.start });
    setNotice({ kind: 'ok', text: 'Voix ajoutée sur la piste Audio, au début du texte.' });
  }

  // Translation of the texts (all, or only the automatic subtitles).
  async function translateTexts(from, to, onlyAuto) {
    const targets = state.clips.filter((c) => c.track === 'text' && (c.text || '').trim() && (!onlyAuto || c.auto));
    if (!targets.length) {
      setNotice({ kind: 'error', text: onlyAuto ? 'Aucun sous-titre automatique à traduire.' : 'Aucun texte à traduire.' });
      return;
    }
    const out = await runAi('Traduction', () => api.aiTranslate({ texts: targets.map((c) => c.text), from, to }));
    if (!out) return;
    const byId = new Map(targets.map((c, i) => [c.id, out[i]]));
    dispatch({ type: 'REPLACE_CLIPS', clips: state.clips.map((c) => (byId.has(c.id) ? { ...c, text: byId.get(c.id) } : c)) });
    setNotice({ kind: 'ok', text: `${targets.length} texte${targets.length > 1 ? 's' : ''} traduit${targets.length > 1 ? 's' : ''}. Ctrl+Z pour revenir.` });
  }

  // I / O: start / end of the play zone at the playhead; X: no zone.
  const setZoneEdge = (edge) => {
    if (edge === 'in') setZone((z) => (z && z[1] > time + 0.05 ? [time, z[1]] : total > time + 0.05 ? [time, total] : z));
    else setZone((z) => (z && z[0] < time - 0.05 ? [z[0], time] : time > 0.05 ? [0, time] : z));
  };

  const latest = useRef(null);
  // Q / W: cut the start or the end of the selected clip (or the video clip under the playhead) at the playhead.
  const trimToPlayhead = (side) => {
    if (state.multi.length) {
      dispatch({ type: 'TRIM_MANY', ids: state.multi, side, time });
      return;
    }
    const target =
      state.clips.find((c) => c.id === state.selectedId) ||
      state.clips.find((c) => c.track === 'video' && time > c.start && time < c.start + c.duration);
    if (!target) {
      setNotice({ kind: 'error', text: 'Sélectionne un clip, ou place la tête de lecture sur un clip.' });
      return;
    }
    if (time <= target.start || time >= target.start + target.duration) {
      setNotice({ kind: 'error', text: 'Place la tête de lecture à l’intérieur du clip à raccourcir.' });
      return;
    }
    dispatch({ type: 'TRIM_TO', id: target.id, side, time });
  };

  latest.current = { magnet, link, clips: state.clips, chosen: selectionOf(state), togglePlay, seek, time, selectedId: state.selectedId, saveProject, openProject, newProject, startExport, trimToPlayhead, setZoneEdge };

  // Lets automated checks export to a known path without the save dialog.
  useEffect(() => {
    window.cupkataDebug = { exportTo: (filePath) => latest.current.startExport(filePath) };
  }, []);

  // What the local API works with (see control.js), as of this render.
  const control = useRef(null);
  control.current = {
    state, time, playing, zone, total, resolution, ratio, normalize, projectPath, recovery, exp, aiJob, busy, dirty, hasContent, notices,
    preview: previewCapture, serialize, applyProject, seek, togglePlay, setPlaying, setHoverTime, setZone, setResolution, setRatio, setNormalize,
    freezeFrame, reverseClip, cutoutClip, cutSilences, speakText, translateTexts, startExport, cleanError,
    generateSubtitles: async (options) => {
      setBusy('subtitles');
      try {
        await generateSubtitles(options);
      } catch (err) {
        showError(err);
      } finally {
        setBusy(null);
      }
    },
    cancelExport: () => {
      exportCancelled.current = true;
      api.cancelExport();
    },
    markSaved: (target) => {
      setProjectPath(target);
      setSaved({ media: state.media, clips: state.clips, filters: state.filters, resolution, ratio });
    },
    chooseRecovery: (resume) => {
      if (resume) applyProject(recovery, false);
      setRecovery(null);
      setReady(true);
    },
  };

  useEffect(() => {
    api.controlStatus().then(setAiStatus);
    const offStatus = api.onControlStatus(setAiStatus);
    let seq = 0;
    const offControl = installControl(control, dispatch, (entry) => setAiLog((log) => [{ ...entry, seq: ++seq }, ...log].slice(0, 30)));
    return () => {
      offStatus();
      offControl();
    };
  }, []);

  useEffect(() => {
    const block = (e) => e.preventDefault();
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);

    function onKey(e) {
      const l = latest.current;
      const key = e.key.toLowerCase();
      if (e.ctrlKey && key === 's') {
        e.preventDefault();
        l.saveProject(e.shiftKey);
        return;
      }
      if (e.ctrlKey && key === 'o') {
        e.preventDefault();
        l.openProject();
        return;
      }
      if (e.ctrlKey && key === 'n') {
        e.preventDefault();
        l.newProject();
        return;
      }
      if (e.target.closest?.('input, select, textarea')) return;
      if (e.key === ' ') {
        e.preventDefault();
        l.togglePlay();
      } else if (e.ctrlKey && key === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' });
      } else if (e.ctrlKey && key === 'y') {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      } else if (!e.ctrlKey && key === 's') {
        dispatch({ type: 'SPLIT', time: l.time });
      } else if (!e.ctrlKey && key === 't') {
        dispatch({ type: 'ADD_TEXT', start: l.time });
      } else if (!e.ctrlKey && (key === 'i' || key === 'o')) {
        l.setZoneEdge(key === 'i' ? 'in' : 'out');
      } else if (!e.ctrlKey && key === 'x') {
        setZone(null);
      } else if (!e.ctrlKey && (key === 'q' || key === 'w')) {
        l.trimToPlayhead(key === 'q' ? 'start' : 'end');
      } else if (!e.ctrlKey && key === 'm') {
        dispatch({ type: 'TOGGLE_MUTE', ids: l.chosen });
      } else if (e.ctrlKey && key === 'c') {
        e.preventDefault();
        dispatch({ type: 'COPY', ids: l.chosen });
      } else if (e.ctrlKey && key === 'x') {
        e.preventDefault();
        dispatch({ type: 'COPY', ids: l.chosen });
        dispatch({ type: 'DELETE_MANY', ids: l.chosen, ripple: l.magnet, link: l.link });
      } else if (e.ctrlKey && key === 'v') {
        e.preventDefault();
        dispatch({ type: 'PASTE', time: l.time, plain: e.shiftKey, link: l.link });
      } else if (e.ctrlKey && key === 'd') {
        e.preventDefault();
        dispatch({ type: 'DUPLICATE', ids: l.chosen, link: l.link });
      } else if (e.ctrlKey && key === 'a') {
        e.preventDefault();
        dispatch({ type: 'SELECT_MANY', ids: l.clips.map((c) => c.id) });
      } else if (e.key === 'Escape') {
        dispatch({ type: 'SELECT_MANY', ids: [] });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && l.selectedId) {
        dispatch({ type: 'DELETE_MANY', ids: l.chosen, ripple: l.magnet && !e.shiftKey, link: l.link });
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.ctrlKey) {
        e.preventDefault();
        dispatch({ type: 'MOVE_ORDER', ids: l.chosen, dir: e.key === 'ArrowLeft' ? -1 : 1, link: l.link });
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.altKey) {
        e.preventDefault();
        dispatch({ type: 'NUDGE', ids: l.chosen, delta: (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / FPS) });
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Up / Down: the playhead jumps to the previous or next cut.
        e.preventDefault();
        const cuts = [...new Set(l.clips.flatMap((c) => [c.start, c.start + c.duration]))].sort((a, b) => a - b);
        const to = e.key === 'ArrowUp' ? cuts.filter((t) => t < l.time - 1e-3).pop() : cuts.find((t) => t > l.time + 1e-3);
        l.seek(to ?? (e.key === 'ArrowUp' ? 0 : l.time));
      } else if (e.key === 'ArrowLeft') {
        l.seek(l.time - (e.shiftKey ? 1 : 1 / FPS));
      } else if (e.key === 'ArrowRight') {
        l.seek(l.time + (e.shiftKey ? 1 : 1 / FPS));
      } else if (e.key === 'Home') {
        l.seek(0);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  async function generateSubtitles({ language, model, source, maxWords }) {
    setPlaying(false);
    const byId = new Map(state.media.map((m) => [m.id, m]));
    const usable = (c) => {
      const m = byId.get(c.mediaId);
      return m && !m.missing && m.hasAudio && !c.muted;
    };
    const sourceClips =
      source === 'selected'
        ? state.clips.filter((c) => c.id === state.selectedId && usable(c))
        : state.clips.filter((c) => c.track === source && usable(c));
    if (!sourceClips.length) throw new Error('Aucun clip avec du son à transcrire ici.');
    const segments = await api.transcribe({
      language,
      model,
      items: sourceClips
        .sort((a, b) => a.start - b.start)
        .map((c) => ({ path: byId.get(c.mediaId).path, in: c.in, duration: c.duration, start: c.start, speed: c.speed ?? 1 })),
    });
    const captions = buildCaptions(segments, { maxWords });
    if (!captions.length) throw new Error("Aucune parole n'a été reconnue. Vérifie la langue choisie ou le volume du son.");
    const { clips, added, skipped } = placeCaptions(state.clips, captions, { ...DEFAULT_TEXT_STYLE, size: 60 });
    dispatch({ type: 'REPLACE_CLIPS', clips });
    setNotice({
      kind: 'ok',
      text: `${added} sous-titre${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}` +
        (skipped ? ` (${skipped} ignoré${skipped > 1 ? 's' : ''} : un texte était déjà là)` : ''),
    });
  }

  async function startExport(outOverride) {
    setPlaying(false);
    const out = typeof outOverride === 'string' ? outOverride : await api.chooseExportPath();
    if (!out) return;
    const [width, height] = frameSize(ratio, SHORT_SIDE[resolution]);
    exportCancelled.current = false;
    setExp({ status: 'preparing', progress: 0 });
    const off = api.onExportProgress((p) => setExp((e) => (e?.status === 'running' ? { ...e, progress: p } : e)));
    let token = null;
    try {
      token = await api.prepareExport();
      const luts = {};
      for (const c of state.clips) {
        const info = (c.track === 'video' || c.track === 'filter') && c.filter?.id ? filterInfo(c.filter.id, state.filters) : null;
        if (info) luts[info.id] = { size: info.size, data: info.data };
      }
      await api.exportLuts(token, luts);
      const overlays = [];
      const effectClips = state.clips.filter((c) => c.track === 'video' && clipEffect(c));
      const sequenceFrames = effectClips
        .filter((c) => SEQUENCE_EFFECTS.has(clipEffect(c).type))
        .reduce((n, c) => n + Math.ceil(c.duration * FPS), 0);
      let done = 0;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      for (const [seq, c] of effectClips.entries()) {
        const fx = clipEffect(c);
        if (STILL_EFFECTS.has(fx.type)) {
          overlays.push({ start: c.start, duration: c.duration, png: stillPng(width, height, (g) => drawEffectOverlay(g, c, 0, width, height)) });
        }
        if (!SEQUENCE_EFFECTS.has(fx.type)) continue;
        const frames = Math.ceil(c.duration * FPS);
        for (let i = 0; i < frames; i++) {
          if (exportCancelled.current) throw new Error('Export annulé');
          ctx.clearRect(0, 0, width, height);
          drawEffectOverlay(ctx, c, i / FPS, width, height);
          await api.exportFrame(token, seq, i, await canvasBytes(canvas));
          done += 1;
          if (done % 5 === 0) setExp((e) => (e?.status === 'preparing' ? { ...e, progress: done / sequenceFrames } : e));
        }
        overlays.push({ sequence: seq, start: c.start, duration: c.duration });
      }

      // Stacked lanes are applied from the bottom lane up, exactly like the preview.
      const byLane = [...state.clips].sort((a, b) => laneOf(a) - laneOf(b));
      // Still texts are one picture; animated ones are drawn frame by frame, like the preview.
      const textOverlays = [];
      const texts = byLane.filter((c) => c.track === 'text' && c.text?.trim());
      const animatedFrames = texts.filter(isAnimated).reduce((n, c) => n + Math.ceil(c.duration * FPS), 0);
      let textDone = 0;
      for (const [k, c] of texts.entries()) {
        if (!isAnimated(c)) {
          textOverlays.push({ start: c.start, duration: c.duration, png: renderTextPng(c, width, height) });
          continue;
        }
        const seq = 200 + k;
        const frames = Math.ceil(c.duration * FPS);
        for (let i = 0; i < frames; i++) {
          if (exportCancelled.current) throw new Error('Export annulé');
          ctx.clearRect(0, 0, width, height);
          drawText(ctx, c, width, height, i / FPS);
          await api.exportFrame(token, seq, i, await canvasBytes(canvas));
          textDone += 1;
          if (textDone % 5 === 0) setExp((e) => (e?.status === 'preparing' ? { ...e, progress: textDone / animatedFrames } : e));
        }
        textOverlays.push({ sequence: seq, start: c.start, duration: c.duration });
      }

      setExp({ status: 'preparing', progress: 0 });
      await prerenderGpu(api, { width, height, fps: FPS, media: state.media, clips: state.clips }, token, {
        isCancelled: () => exportCancelled.current,
        onProgress: (p) => setExp((e) => (e?.status === 'preparing' ? { ...e, progress: p } : e)),
      });

      const base = { width, height, fps: FPS, media: state.media, clips: state.clips };
      const filterItems = byLane.filter((c) => c.track === 'filter' && clipFilter(c, state.filters));
      const fxItems = byLane.filter((c) => c.track === 'fx' && clipEffect(c));
      let finalOverlays = [...overlays, ...textOverlays];
      if (filterItems.length || fxItems.length) {
        // 1. Picture-only base, 2. track ranges processed here like the preview, 3. final mix below.
        if (exportCancelled.current) throw new Error('Export annulé');
        setExp({ status: 'running', progress: 0 });
        await api.exportBase({ ...base, overlays }, token);
        const ranges = mergeRanges([...filterItems, ...fxItems].map((c) => [c.start, c.start + c.duration]), 1 / FPS);
        const jobs = await api.fxPlan(token, ranges.map(([a, b]) => ({ start: a, duration: b - a })), { width, height, fps: FPS });
        const totalFrames = jobs.reduce((n, j) => n + j.frames, 0);
        const lutEngine = gpuEngine(width, height, 'lut-track-export');
        let processed = 0;
        setExp({ status: 'preparing', progress: 0 });
        for (const job of jobs) {
          await api.gpuStart(job.jobId);
          for (let i = 0; i < job.frames; i++) {
            if (exportCancelled.current) throw new Error('Export annulé');
            const frame = await api.gpuRead(job.jobId);
            if (!frame) break;
            ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.byteLength), width, height), 0, 0);
            const t = job.start + i / FPS;
            for (const item of filterItems) {
              if (t >= item.start && t < item.start + item.duration) {
                applyFilterItem(ctx, width, height, item, effectEnvelope(item, t - item.start), state.filters, lutEngine);
              }
            }
            for (const item of fxItems) {
              if (t >= item.start && t < item.start + item.duration) {
                applyEffectItem(ctx, width, height, item, t - item.start, effectEnvelope(item, t - item.start));
              }
            }
            await api.gpuWrite(job.jobId, new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer));
            processed += 1;
            if (processed % 5 === 0) setExp((e) => (e?.status === 'preparing' ? { ...e, progress: processed / totalFrames } : e));
          }
          await api.gpuFinish(job.jobId);
        }
        finalOverlays = textOverlays;
      }

      if (exportCancelled.current) throw new Error('Export annulé');
      setExp({ status: 'running', progress: 0 });
      await api.runExport({ ...base, overlays: finalOverlays, voice, normalize }, out, token);
      token = null;
      setExp({ status: 'done', out });
    } catch (err) {
      const message = cleanError(err);
      setExp(message === 'Export annulé' ? null : { status: 'error', message });
    } finally {
      off();
      if (token) api.discardExport(token);
    }
  }

  return (
    <div
      className="app"
      style={{ gridTemplateRows: `48px minmax(0, 1fr) 6px ${layout.timeline}px`, '--tl-h': `${layout.timeline}px` }}
    >
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <span className="logo">●</span> cupkata
          </div>
          <div className="project-menu">
            <button className="btn ghost" onClick={newProject} title="Nouveau projet (Ctrl+N)">
              Nouveau
            </button>
            <button className="btn ghost" onClick={openProject} title="Ouvrir un projet (Ctrl+O)">
              Ouvrir
            </button>
            <button className="btn ghost" onClick={() => saveProject(false)} title="Enregistrer (Ctrl+S) — Ctrl+Maj+S pour enregistrer sous">
              Enregistrer
            </button>
          </div>
          <span className="project-name" title={projectPath || 'Projet pas encore enregistré'}>
            {fileName(projectPath)}
            {dirty && hasContent && <span className="dirty-dot" title="Modifications non enregistrées"> •</span>}
          </span>
        </div>
        <div className="topbar-actions">
          <button
            className={`btn ghost ${aiStatus.enabled ? 'active' : ''}`}
            onClick={() => setAiPanelOpen(true)}
            title={aiStatus.enabled ? 'Une IA peut piloter Cupkata' : 'Autoriser une IA à piloter Cupkata'}
          >
            {aiStatus.enabled ? '● IA active' : 'IA'}
          </button>
          <label className="toggle topbar-toggle" title="Égalise le niveau sonore de la vidéo exportée (-14 LUFS, standard des réseaux sociaux)">
            <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />
            Volume uniforme
          </label>
          <select value={resolution} onChange={(e) => setResolution(e.target.value)} title="Résolution d'export">
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="1440p">2K (1440p)</option>
          </select>
          <button className="btn primary" disabled={total <= 0} onClick={() => startExport()}>
            Exporter
          </button>
        </div>
      </header>

      <main className="workspace" style={{ gridTemplateColumns: `${layout.left}px 6px minmax(0, 1fr) 6px ${layout.right}px` }}>
        <aside className="panel left">
          <nav className="lp-tabs">
            {LEFT_TABS.map(([id, label, Icon]) => (
              <button key={id} className={leftTab === id ? 'active' : ''} onClick={() => setLeftTab(id)}>
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          {leftTab === 'media' && <MediaBin media={state.media} clips={state.clips} time={time} dispatch={dispatch} onNotice={setNotice} link={link} />}
          {leftTab === 'audio' && (
            <MediaBin
              key="audio"
              audio
              media={state.media}
              clips={state.clips}
              time={time}
              dispatch={dispatch}
              onNotice={setNotice}
              onVoiceover={() => setVoiceOpen(true)}
            />
          )}
          {leftTab === 'text' && <TextPanel time={time} dispatch={dispatch} onNotice={setNotice} />}
          {leftTab === 'captions' && (
            <CaptionsPanel clips={state.clips} dispatch={dispatch} onOpenSubtitles={() => setSubtitlesOpen(true)} onNotice={setNotice} onTranslate={translateTexts} />
          )}
          {leftTab === 'transitions' && (
            <TransitionsPanel clips={state.clips} selectedId={state.selectedId} time={time} dispatch={dispatch} onNotice={setNotice} />
          )}
          {leftTab === 'filters' && (
            <FiltersPanel
              clip={selectedClip}
              media={selectedClip && state.media.find((m) => m.id === selectedClip.mediaId)}
              custom={state.filters}
              time={time}
              dispatch={dispatch}
              onNotice={setNotice}
            />
          )}
          {leftTab === 'effects' && (
            <EffectsPanel
              clip={selectedClip}
              media={selectedClip && state.media.find((m) => m.id === selectedClip.mediaId)}
              time={time}
              dispatch={dispatch}
              onNotice={setNotice}
            />
          )}
        </aside>
        <Splitter
          axis="x"
          value={layout.left}
          min={300}
          max={() => window.innerWidth - layout.right - 320}
          onChange={resize('left')}
          onReset={resetSize('left')}
          title="Tire pour élargir ou réduire le panneau Médias (double-clic : taille d'origine)"
        />
        <Preview
          media={state.media}
          clips={state.clips}
          filters={state.filters}
          voice={voice}
          time={!playing && hoverTime != null ? Math.min(hoverTime, total) : time}
          playing={playing}
          muted={previewMuted}
          zone={zone}
          selectedId={state.selectedId}
          dispatch={dispatch}
          onTime={setTime}
          onEnded={() => {
            // In a loop, playback starts again at the beginning (of the play zone, if there is one).
            if (loop) setTime(zone ? zone[0] : 0);
            else setPlaying(false);
          }}
          onTogglePlay={togglePlay}
          onStep={(dir) => {
            setPlaying(false);
            seek(time + dir / FPS);
          }}
          loop={loop}
          onToggleLoop={() => setLoop((v) => !v)}
          ratio={ratio}
          onRatio={setRatio}
          captureRef={previewCapture}
          onSnapshot={async (bytes) => {
            try {
              const item = await api.saveSnapshot(bytes);
              dispatch({ type: 'ADD_MEDIA', items: [{ ...item, id: crypto.randomUUID() }] });
              setNotice({ kind: 'ok', text: 'Capture ajoutée aux médias (Documents\\Cupkata\\Captures).' });
            } catch (err) {
              showError(err);
            }
          }}
        />
        <Splitter
          axis="x"
          sign={-1}
          value={layout.right}
          min={220}
          max={() => window.innerWidth - layout.left - 320}
          onChange={resize('right')}
          onReset={resetSize('right')}
          title="Tire pour élargir ou réduire le panneau de réglages (double-clic : taille d'origine)"
        />
        {state.multi.length >= 2 ? (
          <GroupInspector clips={state.clips} media={state.media} ids={state.multi} dispatch={dispatch} time={time} link={link} />
        ) : (
        <Inspector
          clip={selectedClip}
          clips={state.clips}
          media={selectedClip && state.media.find((m) => m.id === selectedClip.mediaId)}
          hasPrev={selectedHasPrev}
          dispatch={dispatch}
          customFilters={state.filters}
          onOpenFilters={() => setLeftTab('filters')}
          onOpenEffects={() => setLeftTab('effects')}
          time={time}
          busy={busy}
          onReverse={reverseClip}
          onFreeze={freezeFrame}
          ai={{ cutout: cutoutClip, silences: cutSilences, speak: speakText, busy: !!aiJob }}
        />
        )}
      </main>

      <Splitter
        axis="y"
        sign={-1}
        value={layout.timeline}
        min={160}
        max={() => window.innerHeight - 48 - 220}
        onChange={resize('timeline')}
        onReset={resetSize('timeline')}
        title="Tire pour agrandir la timeline ou l'aperçu (double-clic : taille d'origine)"
      />
      <Timeline
        state={state}
        dispatch={dispatch}
        time={time}
        playing={playing}
        onSeek={seek}
        pps={pps}
        setPps={setPps}
        onOpenSubtitles={() => setSubtitlesOpen(true)}
        onTrim={trimToPlayhead}
        peaks={peaks}
        onHover={setHoverTime}
        zone={zone}
        onZone={setZone}
        onVoiceover={() => setVoiceOpen(true)}
        onFreeze={() => freezeFrame(null)}
        magnet={magnet}
        setMagnet={setMagnet}
        link={link}
        setLink={setLink}
      />
      <VoiceoverPanel
        open={voiceOpen}
        time={time}
        onClose={() => setVoiceOpen(false)}
        onStart={(mute) => {
          setPreviewMuted(mute);
          if (time < total - 1e-3) setPlaying(true);
        }}
        onStop={() => {
          setPlaying(false);
          setPreviewMuted(false);
        }}
        onDone={(item, start) => {
          const id = crypto.randomUUID();
          dispatch({ type: 'ADD_MEDIA', items: [{ ...item, id }] });
          dispatch({ type: 'ADD_CLIP', mediaId: id, track: 'audio', start });
          setNotice({
            kind: 'ok',
            text: overlaps(state.clips, 'audio', start, item.duration)
              ? 'Voix off ajoutée sur une piste Audio de plus (la première était occupée à cet endroit).'
              : `Voix off ajoutée sur la piste Audio (${item.name})`,
          });
        }}
      />
      <SubtitlesModal
        open={subtitlesOpen}
        canUseSelected={!!selectedClip && selectedClip.track !== 'text'}
        onClose={() => setSubtitlesOpen(false)}
        onRun={generateSubtitles}
      />

      <ExportModal
        exp={exp}
        onClose={() => setExp(null)}
        onCancelPrepare={() => {
          exportCancelled.current = true;
        }}
      />
      {aiJob && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>{aiJob.label}…</h2>
            <div className="progress">
              <div style={{ width: `${Math.round((aiJob.progress || 0) * 100)}%` }} />
            </div>
            <p className="muted">
              {aiJob.phase === 'model'
                ? `Téléchargement du modèle IA (une seule fois)… ${Math.round((aiJob.progress || 0) * 100)} %`
                : `Traitement sur ton ordinateur… ${Math.round((aiJob.progress || 0) * 100)} %`}
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => api.aiCancel()}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
      <AiControlPanel open={aiPanelOpen} status={aiStatus} log={aiLog} onClose={() => setAiPanelOpen(false)} onError={showError} />
      <RecoveryModal
        recovery={recovery}
        onResume={() => {
          applyProject(recovery, false);
          setRecovery(null);
          setReady(true);
        }}
        onDiscard={() => {
          setRecovery(null);
          setReady(true);
        }}
      />
      {notice && <div className={`toast ${notice.kind}`}>{notice.text}</div>}
    </div>
  );
}
