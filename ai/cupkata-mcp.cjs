#!/usr/bin/env node
// Bridge between an MCP client (Claude, Cursor, …) and the local API of Cupkata, over stdio.
// Cupkata must be running with « Pilotage par une IA » turned on: the address and the token are read
// from the file the app writes when it is activated, at each call, because the token changes.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { commands } = require('../shared/control-commands.json');

const PROTOCOL_VERSION = '2025-06-18';
const DATA_DIR = process.env.CUPKATA_USER_DATA || path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'cupkata');

const TOOLS = [
  { name: 'read_guide', description: 'Lit le guide de Cupkata. À appeler en premier.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  ...commands.map((c) => ({
    name: c.name,
    description: c.description,
    inputSchema: { type: 'object', properties: c.args, required: c.required || [], additionalProperties: false },
  })),
];

function connection() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'control.json'), 'utf8'));
  } catch {
    throw new Error('Cupkata est fermé, ou le pilotage par une IA n’est pas activé. Demande à l’utilisateur de l’activer avec le bouton « IA » de Cupkata.');
  }
}

async function call(route, init = {}) {
  const { url, token } = connection();
  let res;
  try {
    res = await fetch(url + route, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  } catch {
    throw new Error('Cupkata ne répond pas : vérifie que l’application est ouverte et le pilotage activé.');
  }
  if (res.ok) return res;
  const body = await res.json().catch(() => null);
  throw new Error(body?.error ? `${body.error.code} : ${body.error.message}` : `Erreur HTTP ${res.status}`);
}

async function runTool(name, args) {
  if (name === 'read_guide') return [{ type: 'text', text: await (await call('/v1/guide')).text() }];
  if (name === 'capture_frame') {
    const res = await call(`/v1/frame${args.time != null ? `?time=${encodeURIComponent(args.time)}` : ''}`);
    const data = Buffer.from(await res.arrayBuffer()).toString('base64');
    return [
      { type: 'image', data, mimeType: 'image/png' },
      { type: 'text', text: JSON.stringify({ time: Number(res.headers.get('X-Cupkata-Time')), settled: res.headers.get('X-Cupkata-Settled') === 'true' }) },
    ];
  }
  const res = await call('/v1/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: name, args }),
  });
  return [{ type: 'text', text: JSON.stringify((await res.json()).result) }];
}

async function handle(message) {
  const { method, params } = message;
  if (method === 'initialize') {
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'cupkata', version: '1.0.0' },
      instructions: 'Pilote l’éditeur vidéo Cupkata. Appelle read_guide avant toute autre commande.',
    };
  }
  if (method === 'ping') return {};
  if (method === 'tools/list') return { tools: TOOLS };
  if (method === 'tools/call') {
    if (!TOOLS.some((t) => t.name === params?.name)) throw Object.assign(new Error(`Outil inconnu : ${params?.name}`), { rpc: -32602 });
    try {
      return { content: await runTool(params.name, params.arguments || {}) };
    } catch (err) {
      return { content: [{ type: 'text', text: err.message }], isError: true };
    }
  }
  throw Object.assign(new Error(`Méthode inconnue : ${method}`), { rpc: -32601 });
}

const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

async function onLine(line) {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return send({ id: null, error: { code: -32700, message: 'JSON invalide' } });
  }
  // A message without id is a notification: it gets no answer.
  if (message.id === undefined) return;
  try {
    send({ id: message.id, result: await handle(message) });
  } catch (err) {
    send({ id: message.id, error: { code: err.rpc || -32603, message: err.message } });
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines) onLine(line);
});
