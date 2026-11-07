import { useEffect, useState } from 'react';
import { EXPORT_CODECS, EXPORT_PRESETS, estimateBytes, formatBytes } from '../exportPresets.js';
import { formatShort, FPS } from '../format.js';
import { frameSize } from '../ratio.js';
import { T } from '../i18n.js';
import { getSetting } from '../settings.js';

// What to export before choosing where: preset, part of the timeline, and the size to expect.
export default function ExportDialog({ open, total, zone, time, ratio, resolution, shortSide, onRatio, onResolution, onClose, onExport }) {
  const [presetId, setPresetId] = useState('custom');
  const [codec, setCodec] = useState('h264');
  const [part, setPart] = useState('all');
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);

  useEffect(() => {
    if (!open) return;
    setCodec(getSetting('exportCodec'));
    setPart(zone ? 'zone' : 'all');
    setFrom(Math.round(Math.min(time, Math.max(0, total - 1)) * 10) / 10);
    setTo(Math.round(Math.min(total, time + 10) * 10) / 10);
  }, [open]);

  if (!open) return null;
  const preset = EXPORT_PRESETS.find((p) => p.id === presetId);
  const choosePreset = (id) => {
    setPresetId(id);
    const next = EXPORT_PRESETS.find((p) => p.id === id);
    if (next?.ratio) {
      onRatio(next.ratio);
      onResolution(next.resolution);
    }
  };
  const range = part === 'zone' && zone ? { start: zone[0], duration: zone[1] - zone[0] } : part === 'custom' ? { start: from, duration: to - from } : null;
  const valid = !range || (range.duration > 0.05 && range.start >= 0 && range.start < total);
  const seconds = range ? Math.min(range.duration, total - range.start) : total;
  const [width, height] = frameSize(ratio, shortSide[resolution]);

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>{T('Exporter')}</h2>
        <div className="form">
          <label className="field">
            <span>{T('Préréglage')}</span>
            <select value={presetId} onChange={(e) => choosePreset(e.target.value)}>
              {EXPORT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.ratio ? ` — ${p.ratio}, ${p.resolution}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{T('Format vidéo')}</span>
            <select value={codec} onChange={(e) => setCodec(e.target.value)}>
              {EXPORT_CODECS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {preset.ratio && <p className="hint">{T('Le format du projet passe en')} {preset.ratio} {T(': vérifie le cadrage dans l’aperçu derrière.')}</p>}
          <label className="field">
            <span>{T('Partie à exporter')}</span>
            <select value={part} onChange={(e) => setPart(e.target.value)}>
              <option value="all">{T('Toute la vidéo (')}{formatShort(total)})</option>
              {zone && <option value="zone">{T('La zone de lecture (')}{formatShort(zone[0])} à {formatShort(zone[1])})</option>}
              <option value="custom">{T('Un extrait…')}</option>
            </select>
          </label>
          {part === 'custom' && (
            <div className="export-range">
              <label className="field">
                <span>{T('De (secondes)')}</span>
                <input type="number" min="0" max={total} step="0.1" value={from} onChange={(e) => setFrom(Number(e.target.value))} />
              </label>
              <label className="field">
                <span>{T('À (secondes)')}</span>
                <input type="number" min="0" max={total} step="0.1" value={to} onChange={(e) => setTo(Number(e.target.value))} />
              </label>
            </div>
          )}
          <div className="export-summary">
            <span>{width} × {height}, {FPS} i/s</span>
            <strong title={T('Estimation : le poids réel dépend du contenu de la vidéo')}>
              {valid ? `≈ ${formatBytes(estimateBytes(preset, width, height, FPS, seconds, codec))}` : T('Extrait invalide')}
            </strong>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
           {T('Fermer')}
          </button>
          <button
            className="btn primary"
            disabled={!valid}
            onClick={() => onExport({ encode: preset.video || codec !== 'h264' ? { video: preset.video, audio: preset.audio, codec } : null, range })}
          >
           {T('Choisir où enregistrer…')}
          </button>
        </div>
      </div>
    </div>
  );
}
