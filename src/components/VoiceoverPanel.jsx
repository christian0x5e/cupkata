import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../format.js';

// Voice-over: records the microphone from the playhead while the timeline plays, then the take is
// saved as an M4A file and placed on the Audio track where the recording started.
export default function VoiceoverPanel({ open, time, onClose, onStart, onStop, onDone }) {
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [muteProject, setMuteProject] = useState(true);
  const [phase, setPhase] = useState('idle'); // idle | countdown | recording | saving
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState(null);
  const stream = useRef(null);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const startAt = useRef(0);
  const timers = useRef([]);

  // Opens the chosen microphone and drives the level meter while the panel is open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let raf = 0;
    let audio = null;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        setError(null);
        const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
        if (!cancelled) setDevices(list);
        audio = new AudioContext();
        const analyser = audio.createAnalyser();
        analyser.fftSize = 1024;
        audio.createMediaStreamSource(s).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v));
          setLevel(peak);
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        if (!cancelled) setError("Impossible d'ouvrir le micro : vérifie qu'il est branché et autorisé dans Windows (Paramètres › Confidentialité › Microphone).");
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      audio?.close();
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [open, deviceId]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!open) return null;

  function begin() {
    if (!stream.current) return;
    setError(null);
    setPhase('countdown');
    setCount(3);
    for (let i = 1; i <= 3; i++) timers.current.push(setTimeout(() => (i < 3 ? setCount(3 - i) : record()), i * 1000));
  }

  function record() {
    chunks.current = [];
    const r = new MediaRecorder(stream.current, { mimeType: 'audio/webm;codecs=opus' });
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = save;
    recorder.current = r;
    startAt.current = time;
    r.start(250);
    setElapsed(0);
    setPhase('recording');
    const t0 = performance.now();
    const tick = () => {
      setElapsed((performance.now() - t0) / 1000);
      if (recorder.current?.state === 'recording') timers.current.push(setTimeout(tick, 100));
    };
    tick();
    onStart(muteProject);
  }

  function stop() {
    onStop();
    if (phase === 'countdown') {
      timers.current.forEach(clearTimeout);
      setPhase('idle');
      return;
    }
    recorder.current?.stop();
  }

  async function save() {
    setPhase('saving');
    try {
      const bytes = new Uint8Array(await new Blob(chunks.current, { type: 'audio/webm' }).arrayBuffer());
      const item = await window.cupkata.saveVoice(bytes);
      onDone(item, startAt.current);
      setPhase('idle');
    } catch (err) {
      setError(String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      setPhase('idle');
    }
  }

  const busy = phase !== 'idle';
  return (
    <div className="voice-panel">
      <div className="voice-head">
        <strong>🎙 Voix off</strong>
        <button className="btn ghost" disabled={busy} onClick={onClose} title="Fermer">
          ✕
        </button>
      </div>
      <label className="field">
        <span>Micro</span>
        <select value={deviceId} disabled={busy} onChange={(e) => setDeviceId(e.target.value)}>
          <option value="">Micro par défaut</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || 'Micro'}
            </option>
          ))}
        </select>
      </label>
      <div className="voice-meter" title="Niveau du micro">
        <div style={{ width: `${Math.min(100, Math.round(Math.sqrt(level) * 100))}%` }} className={level > 0.9 ? 'clip' : ''} />
      </div>
      <label className="toggle">
        <input type="checkbox" checked={muteProject} disabled={busy} onChange={(e) => setMuteProject(e.target.checked)} />
        Couper le son du projet pendant l'enregistrement
      </label>
      <div className="voice-status">
        {phase === 'idle' && <span className="muted">Démarre à {formatTime(time)} (tête de lecture)</span>}
        {phase === 'countdown' && <span className="voice-count">{count}</span>}
        {phase === 'recording' && (
          <span className="voice-rec">
            <span className="rec-dot" /> {formatTime(elapsed)}
          </span>
        )}
        {phase === 'saving' && <span className="muted">Enregistrement du fichier…</span>}
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="modal-actions">
        {phase === 'idle' ? (
          <button className="btn primary" disabled={!!error} onClick={begin}>
            ● Enregistrer
          </button>
        ) : (
          <button className="btn primary" disabled={phase === 'saving'} onClick={stop}>
            ■ Arrêter
          </button>
        )}
      </div>
    </div>
  );
}
