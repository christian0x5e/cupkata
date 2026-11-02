import { useState } from 'react';

const api = window.cupkata;

function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn small"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? 'Copié' : label}
    </button>
  );
}

const promptFor = (s) =>
  `Tu peux piloter mon éditeur vidéo Cupkata par son API locale.
Adresse : ${s.url}
Jeton (en-tête « Authorization: Bearer … ») : ${s.token}
Commence par lire le guide : GET ${s.url}/v1/guide`;

// Turns the local API on or off, gives what an AI needs to connect, and shows what it has done.
export default function AiControlPanel({ open, status, log, onClose, onError }) {
  const [changing, setChanging] = useState(false);
  if (!open) return null;

  async function toggle(on) {
    setChanging(true);
    try {
      await api.controlSet(on);
    } catch (err) {
      onError(err);
    } finally {
      setChanging(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal ai-panel">
        <h2>Pilotage par une IA</h2>
        <label className="toggle">
          <input type="checkbox" checked={status.enabled} disabled={changing} onChange={(e) => toggle(e.target.checked)} />
          Autoriser une IA à piloter Cupkata
        </label>
        <p className="muted">
          Tant que c’est activé, un programme de cet ordinateur qui a le jeton peut modifier ton montage, importer tes fichiers et
          écrire des projets et des vidéos. Le jeton change à chaque activation.
        </p>
        {status.enabled && (
          <>
            <div className="ai-row">
              <code>{status.url}</code>
              <CopyButton text={status.url} label="Copier" />
            </div>
            <div className="ai-row">
              <code>{`${status.token.slice(0, 8)}…`}</code>
              <CopyButton text={status.token} label="Copier le jeton" />
            </div>
            <div className="ai-row">
              <span className="muted">Message prêt à donner à ton IA</span>
              <CopyButton text={promptFor(status)} label="Copier" />
            </div>
            <div className="ai-log" aria-label="Dernières commandes">
              {log.length === 0 && <p className="muted">Aucune commande pour l’instant.</p>}
              {log.map((entry) => (
                <div key={entry.seq} className={entry.ok ? '' : 'ai-log-error'} title={entry.message}>
                  {entry.ok ? '✓' : '✕'} {entry.command}
                  {entry.message ? ` — ${entry.message}` : ''}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
