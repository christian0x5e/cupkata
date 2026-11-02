const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const COMMANDS = require('../shared/control-commands.json');

// Local API that lets another program (an AI assistant, a script) drive Cupkata. It is off until the
// user turns it on, listens on this computer only and needs a token that changes at each activation.
// Commands are carried out by the interface (src/control.js), so they follow the same rules as the buttons.
const PREFERRED_PORT = 47821;
const MAX_BODY = 1024 * 1024;
const TIMEOUT_MS = 30 * 60 * 1000;
const GUIDE_PATH = path.join(__dirname, '..', 'ai', 'GUIDE.md');

function createControl({ app, ipcMain, getWindow, handlers }) {
  let server = null;
  let info = null;
  let nextId = 1;
  const pending = new Map();
  const discoveryPath = () => path.join(app.getPath('userData'), 'control.json');

  const notify = () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('control:status', status());
  };
  const status = () => (info ? { enabled: true, url: info.url, token: info.token, guide: GUIDE_PATH } : { enabled: false, guide: GUIDE_PATH });

  // Sends a command to the interface and waits for its answer.
  function askInterface(command, args) {
    const win = getWindow();
    if (!win || win.isDestroyed() || win.webContents.isLoading()) {
      return Promise.reject(Object.assign(new Error('L’interface de Cupkata n’est pas prête : réessaie dans un instant.'), { code: 'no_window' }));
    }
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Object.assign(new Error('Cupkata n’a pas répondu à temps.'), { code: 'timeout' }));
      }, TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      win.webContents.send('control:request', { id, command, args });
    });
  }

  function failPending(message) {
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      pending.delete(id);
      p.reject(Object.assign(new Error(message), { code: 'interface_restarted' }));
    }
  }

  ipcMain.on('control:response', (_e, { id, ok, result, error }) => {
    const p = pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(id);
    if (ok) p.resolve(result);
    else p.reject(Object.assign(new Error(error?.message || 'Erreur'), { code: error?.code || 'error' }));
  });

  ipcMain.handle('control:status', status);
  ipcMain.handle('control:set', async (_e, on) => {
    if (on) await start();
    else await stop();
    return status();
  });

  // What only this process can do for a command: reading a project and checking a file to write.
  ipcMain.handle('control:open-project', (_e, filePath) => handlers.openProject(filePath));
  ipcMain.handle('control:import-filters', (_e, paths) => handlers.importFilters(paths));
  ipcMain.handle('control:check-target', async (_e, filePath, extension, overwrite) => {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw coded('bad_path', 'Donne un chemin absolu.');
    if (path.extname(filePath).toLowerCase() !== extension) throw coded('bad_path', `Le fichier doit avoir l’extension ${extension}.`);
    if (!fs.existsSync(path.dirname(filePath))) throw coded('bad_path', 'Ce dossier n’existe pas.');
    if (!overwrite && fs.existsSync(filePath)) throw coded('file_exists', 'Ce fichier existe déjà : passe overwrite pour le remplacer.');
    return path.normalize(filePath);
  });

  const coded = (code, message) => new Error(`[${code}] ${message}`);

  const sendJson = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const sendError = (res, status, code, message) => sendJson(res, status, { ok: false, error: { code, message } });

  const STATUS_OF = { unknown_command: 404, bad_args: 400, bad_path: 400, not_found: 404, file_exists: 409, busy: 409, unsaved_changes: 409, recovery_pending: 409, invalid: 400, timeout: 504, no_window: 503, interface_restarted: 503 };

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const parts = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(Object.assign(new Error('Requête trop grande.'), { code: 'too_large' }));
          req.destroy();
        } else parts.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
      req.on('error', reject);
    });
  }

  function authorized(req) {
    const sent = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1] || '';
    const a = crypto.createHash('sha256').update(sent).digest();
    const b = crypto.createHash('sha256').update(info.token).digest();
    return crypto.timingSafeEqual(a, b);
  }

  async function route(req, res) {
    // Web pages open in a browser must not be able to reach this API, even by renaming their site.
    const host = req.headers.host;
    if (host !== `127.0.0.1:${info.port}` && host !== `localhost:${info.port}`) return sendError(res, 403, 'forbidden', 'Hôte refusé.');
    if (req.headers.origin) return sendError(res, 403, 'forbidden', 'Les pages web ne peuvent pas piloter Cupkata.');
    if (!authorized(req)) return sendError(res, 401, 'unauthorized', 'Jeton manquant ou incorrect.');

    const url = new URL(req.url, info.url);
    const where = `${req.method} ${url.pathname}`;
    if (where === 'GET /v1/guide') {
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      return res.end(await fs.promises.readFile(GUIDE_PATH));
    }
    if (where === 'GET /v1/capabilities') return sendJson(res, 200, { ok: true, result: COMMANDS });
    if (where === 'GET /v1/state') return sendJson(res, 200, { ok: true, result: await askInterface('get_state', {}) });
    if (where === 'GET /v1/frame') {
      const raw = url.searchParams.get('time');
      const time = Number(raw);
      if (raw !== null && !(raw.trim() && Number.isFinite(time) && time >= 0)) return sendError(res, 400, 'bad_args', 'time doit être un nombre positif.');
      const frame = await askInterface('capture_frame', raw === null ? {} : { time });
      res.writeHead(200, { 'Content-Type': 'image/png', 'X-Cupkata-Time': String(frame.time), 'X-Cupkata-Settled': String(frame.settled) });
      return res.end(Buffer.from(frame.png_base64, 'base64'));
    }
    if (where === 'POST /v1/command') {
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return sendError(res, 415, 'bad_request', 'Envoie du JSON (Content-Type: application/json).');
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (err) {
        return err.code === 'too_large' ? sendError(res, 413, 'too_large', err.message) : sendError(res, 400, 'bad_request', 'JSON invalide.');
      }
      if (typeof body?.command !== 'string') return sendError(res, 400, 'bad_request', 'Le champ "command" est obligatoire.');
      return sendJson(res, 200, { ok: true, result: await askInterface(body.command, body.args ?? {}) });
    }
    return sendError(res, 404, 'not_found', 'Route inconnue. Voir GET /v1/guide.');
  }

  function listen(port) {
    return new Promise((resolve, reject) => {
      const s = http.createServer((req, res) => {
        route(req, res).catch((err) => {
          if (res.headersSent) return res.destroy();
          sendError(res, STATUS_OF[err.code] || 500, err.code || 'error', err.message);
        });
      });
      s.once('error', reject);
      s.listen(port, '127.0.0.1', () => resolve(s));
    });
  }

  async function start() {
    if (server) return;
    server = await listen(PREFERRED_PORT).catch((err) => {
      if (err.code === 'EADDRINUSE') return listen(0);
      throw err;
    });
    const port = server.address().port;
    info = { port, url: `http://127.0.0.1:${port}`, token: crypto.randomBytes(32).toString('hex') };
    getWindow()?.webContents.setBackgroundThrottling(false);
    await fs.promises.writeFile(discoveryPath(), JSON.stringify({ url: info.url, token: info.token, pid: process.pid }), { mode: 0o600 });
    notify();
  }

  async function stop() {
    if (!server) return;
    const closing = server;
    server = null;
    info = null;
    closing.closeAllConnections();
    await new Promise((resolve) => closing.close(resolve));
    failPending('L’accès IA a été désactivé.');
    getWindow()?.webContents.setBackgroundThrottling(true);
    fs.rmSync(discoveryPath(), { force: true });
    notify();
  }

  return {
    start,
    stop,
    // The discovery file must not outlive the app: its token would look valid to the MCP bridge.
    cleanup: () => fs.rmSync(discoveryPath(), { force: true }),
    interfaceRestarted: () => failPending('L’interface de Cupkata a redémarré.'),
  };
}

module.exports = { createControl };
