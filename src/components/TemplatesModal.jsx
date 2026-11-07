import { useEffect, useState } from 'react';
import { X } from './icons.jsx';
import { T } from '../i18n.js';

const api = window.cupkata;

// Templates: the format, the subtitle style and an intro, kept to start a new project quickly.
export default function TemplatesModal({ open, selectedCount, onClose, onSave, onUse, onError }) {
  const [list, setList] = useState([]);
  const [name, setName] = useState('');
  const [withIntro, setWithIntro] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setWithIntro(selectedCount > 0);
    api.listTemplates().then(setList, onError);
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>{T('Modèles de projet')}</h2>
        {list.length > 0 ? (
          <div className="template-list">
            {list.map((t) => (
              <div key={t.id} className="template-item">
                <div>
                  <strong>{t.name}</strong>
                  <p className="muted">
                    {t.settings.ratio}, {t.settings.resolution}
                    {t.clips.length > 0 ? T(', intro de {0} clip{1}', t.clips.length, t.clips.length > 1 ? 's' : '') : ''}
                  </p>
                </div>
                <button className="btn primary" onClick={() => onUse(t)}>
                 {T('Utiliser')}
                </button>
                <button className="btn ghost" title={T('Supprimer ce modèle')} onClick={() => api.deleteTemplate(t.id).then(setList, onError)}>
                  <X />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{T('Aucun modèle pour l’instant.')}</p>
        )}
        <div className="form template-new">
          <label className="field">
            <span>{T('Enregistrer le projet actuel comme modèle')}</span>
            <input type="text" maxLength={60} placeholder={T('Nom du modèle')} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={withIntro} disabled={!selectedCount} onChange={(e) => setWithIntro(e.target.checked)} />
            {selectedCount
              ? T('Garder les {0} clip{1} sélectionné{2} comme intro', selectedCount, selectedCount > 1 ? 's' : '', selectedCount > 1 ? 's' : '')
              : T('Sélectionne des clips pour les garder comme intro')}
          </label>
          <p className="hint">{T('Un modèle retient le format, la résolution, le volume uniforme et le style des sous-titres.')}</p>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
           {T('Fermer')}
          </button>
          <button
            className="btn primary"
            disabled={!name.trim()}
            onClick={async () => {
              const saved = await onSave(name, withIntro);
              if (saved) {
                setList(saved);
                setName('');
              }
            }}
          >
           {T('Enregistrer')}
          </button>
        </div>
      </div>
    </div>
  );
}
