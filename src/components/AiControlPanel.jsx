import { useState } from 'react';
import { Check, X } from './icons.jsx';
import { T } from '../i18n.js';

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
      {done ? T('Copié') : label}
    </button>
  );
}

const promptFor = (s) =>
  T('Tu peux piloter mon éditeur vidéo Cupkata par son API locale.\nAdresse : {0}\nJeton (en-tête « Authorization: Bearer … ») : {1}\nCommence par lire le guide : GET {0}/v1/guide', s.url, s.token);

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
        <h2>{T('Pilotage par une IA')}</h2>
        <label className="toggle">
          <input type="checkbox" checked={status.enabled} disabled={changing} onChange={(e) => toggle(e.target.checked)} />
          {T('Autoriser une IA à piloter Cupkata')}
        </label>
        <p className="muted">
          {T('Tant que c’est activé, un programme de cet ordinateur qui a le jeton peut modifier ton montage, importer tes fichiers et écrire des projets et des vidéos. Le jeton change à chaque activation.')}
        </p>
        {status.enabled && (
          <>
            <div className="ai-row">
              <code>{status.url}</code>
              <CopyButton text={status.url} label={T('Copier')} />
            </div>
            <div className="ai-row">
              <code>{`${status.token.slice(0, 8)}…`}</code>
              <CopyButton text={status.token} label={T('Copier le jeton')} />
            </div>
            <div className="ai-row">
              <span className="muted">{T('Message prêt à donner à ton IA')}</span>
              <CopyButton text={promptFor(status)} label={T('Copier')} />
            </div>
            <div className="ai-log" aria-label={T('Dernières commandes')}>
              {log.length === 0 && <p className="muted">{T('Aucune commande pour l’instant.')}</p>}
              {log.map((entry) => (
                <div key={entry.seq} className={entry.ok ? '' : 'ai-log-error'} title={entry.message}>
                  {entry.ok ? <Check /> : <X />} {entry.command}
                  {entry.message ? ` — ${entry.message}` : ''}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            {T('Fermer')}
          </button>
        </div>
      </div>
    </div>
  );
}
