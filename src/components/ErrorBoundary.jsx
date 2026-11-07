import React from 'react';
import { T } from '../i18n.js';

// A bug in the interface shows this instead of a blank window. The work is safe in the autosave,
// which the app offers to resume after the restart.
export default class ErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    window.cupkata?.logError?.(`${error?.stack || error}\n${info?.componentStack || ''}`).catch(() => {});
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#e8eaed', textAlign: 'center', padding: 24 }}>
        <h2 style={{ margin: 0 }}>{T('Cupkata a rencontré un problème')}</h2>
        <p style={{ margin: 0, opacity: 0.8 }}>{T('Ton montage est gardé dans la sauvegarde automatique : tu pourras le reprendre au redémarrage.')}</p>
        <button className="btn" onClick={() => window.cupkata?.restartInterface?.()}>
         {T("Redémarrer l'interface")}
        </button>
      </div>
    );
  }
}
