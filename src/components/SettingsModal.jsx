import { useState } from 'react';
import { EXPORT_CODECS } from '../exportPresets.js';
import { LANGUAGE, T } from '../i18n.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../settings.js';

// Preferences of this computer. A number outside its limits is brought back inside when the field is left.
function NumberSetting({ name, label, min, max, values, onChange }) {
  const [text, setText] = useState(String(values[name]));
  const commit = () => {
    const parsed = Number(text.replace(',', '.'));
    const value = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : DEFAULT_SETTINGS[name];
    setText(String(value));
    onChange(name, value);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min={min} max={max} step="0.1" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} />
    </label>
  );
}

function CheckSetting({ name, label, hint, values, onChange }) {
  return (
    <label className="check-row settings-check" title={hint}>
      <input type="checkbox" checked={values[name]} onChange={(e) => onChange(name, e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export default function SettingsModal({ open, onClose, onLanguage, onResetLayout, onChange }) {
  const [values, setValues] = useState(() => Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, getSetting(k)])));
  if (!open) return null;
  const change = (name, value) => {
    setSetting(name, value);
    setValues((v) => ({ ...v, [name]: value }));
    onChange(name, value);
  };
  const shared = { values, onChange: change };
  return (
    <div className="modal-backdrop">
      <div className="modal settings-modal">
        <h2>{T('Réglages')}</h2>
        <div className="form">
          <label className="field">
            <span>{T('Langue')}</span>
            {/* Each language keeps its own name, so that it can be found from the other one. */}
            <select value={LANGUAGE} onChange={(e) => onLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </label>
          <p className="muted">{T('Changer de langue recharge la fenêtre : ton montage est sauvegardé et te sera proposé à la reprise.')}</p>

          <h4>{T('Export')}</h4>
          <label className="field">
            <span>{T('Format vidéo par défaut')}</span>
            <select value={values.exportCodec} onChange={(e) => change('exportCodec', e.target.value)}>
              {EXPORT_CODECS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <CheckSetting {...shared} name="hardwareEncoding" label={T('Utiliser la carte graphique pour exporter')} hint={T('Plus rapide. Sans elle, le processeur fait tout le travail.')} />

          <h4>{T('Montage')}</h4>
          <NumberSetting {...shared} name="imageDuration" label={T('Durée d’une photo ajoutée (secondes)')} min={0.5} max={60} />
          <NumberSetting {...shared} name="transitionDuration" label={T('Durée d’une nouvelle transition (secondes)')} min={0.1} max={3} />
          <CheckSetting {...shared} name="magnet" label={T('Aimant activé au démarrage')} />
          <CheckSetting {...shared} name="snap" label={T('Aimantation auto activée au démarrage')} />
          <CheckSetting {...shared} name="link" label={T('Liaison activée au démarrage')} />

          <h4>{T('Interface')}</h4>
          <button className="btn" onClick={onResetLayout}>{T('Rétablir la taille des panneaux')}</button>
        </div>
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>{T('Fermer')}</button>
        </div>
      </div>
    </div>
  );
}
