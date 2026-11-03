import { useEffect, useState } from 'react';

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
        <h2>Modèles de projet</h2>
        {list.length > 0 ? (
          <div className="template-list">
            {list.map((t) => (
              <div key={t.id} className="template-item">
                <div>
                  <strong>{t.name}</strong>
                  <p className="muted">
                    {t.settings.ratio}, {t.settings.resolution}
                    {t.clips.length > 0 ? `, intro de ${t.clips.length} clip${t.clips.length > 1 ? 's' : ''}` : ''}
                  </p>
                </div>
                <button className="btn primary" onClick={() => onUse(t)}>
                  Utiliser
                </button>
                <button className="btn ghost" title="Supprimer ce modèle" onClick={() => api.deleteTemplate(t.id).then(setList, onError)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Aucun modèle pour l’instant.</p>
        )}
        <div className="form template-new">
          <label className="field">
            <span>Enregistrer le projet actuel comme modèle</span>
            <input type="text" maxLength={60} placeholder="Nom du modèle" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={withIntro} disabled={!selectedCount} onChange={(e) => setWithIntro(e.target.checked)} />
            {selectedCount
              ? `Garder les ${selectedCount} clip${selectedCount > 1 ? 's' : ''} sélectionné${selectedCount > 1 ? 's' : ''} comme intro`
              : 'Sélectionne des clips pour les garder comme intro'}
          </label>
          <p className="hint">Un modèle retient le format, la résolution, le volume uniforme et le style des sous-titres.</p>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Fermer
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
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
