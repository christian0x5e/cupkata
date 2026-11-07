// Free music for videos: search Creative Commons libraries that offer a public interface for apps
// (ccMixter, and Openverse when it answers), and generate short pieces locally with an AI model
// (MusicGen through Transformers.js). Every track keeps its licence and the credit to give its author.

const { T } = require('./i18n.cjs');
const https = require('https');

const USER_AGENT = 'Cupkata/0.1 (personal video editor)';
const MAX_BYTES = 200 * 1024 * 1024;

// Plain HTTPS GET with Node's own client. ccMixter sends very long headers, some with non-Latin
// characters: fetch() refuses the first, Electron's net.fetch crashes the app on the second.
// Follows redirects, gives up after `timeout` ms in total, and never throws outside its promise.
function httpGet(url, { headers = {}, timeout, maxBytes = 5 * 1024 * 1024 }, redirects = 5) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(v);
    };
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, maxHeaderSize: 512 * 1024, insecureHTTPParser: true }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        if (!next.startsWith('https://')) return finish(reject, new Error(T('Redirection refusée')));
        return httpGet(next, { headers, timeout, maxBytes }, redirects - 1).then((v) => finish(resolve, v), (e) => finish(reject, e));
      }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) {
          req.destroy();
          finish(reject, new Error(T('Fichier trop gros')));
        } else chunks.push(c);
      });
      res.on('end', () => finish(resolve, { status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on('error', (e) => finish(reject, e));
    });
    req.on('error', (e) => finish(reject, e));
    const timer = setTimeout(() => {
      req.destroy();
      finish(reject, new Error(T('Délai dépassé')));
    }, timeout);
  });
}

const PAGE = 20;

// Tracks seen in searches: only these can be downloaded.
const known = new Map();

async function getJson(url, ms) {
  const r = await httpGet(url, { headers: { Accept: 'application/json' }, timeout: ms });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.body.toString('utf8'));
}

// "CC BY 3.0", "CC BY-NC 4.0", "CC0"… from a licence URL.
function licenceFromUrl(url = '') {
  const m = /creativecommons\.org\/(licenses|publicdomain)\/([\w+-]+)\/?([\d.]+)?/i.exec(url);
  if (!m) return T('Licence libre');
  if (m[1] === 'publicdomain' || m[2] === 'publicdomain') return m[2] === 'zero' ? 'CC0' : T('Domaine public');
  return `CC ${m[2].toUpperCase()}${m[3] ? ` ${m[3]}` : ''}`;
}
const commercialOk = (licence) => !/NC/.test(licence);
const needsCredit = (licence) => !/^(CC0|Domaine public)$/.test(licence);

const seconds = (ps) => {
  const parts = String(ps || '').split(':').map(Number);
  return parts.every(Number.isFinite) ? parts.reduce((t, v) => t * 60 + v, 0) : 0;
};

// Internet Archive: albums of netlabels under Creative Commons, with their tracks (its interface
// allows apps to search and download).
const lengthSeconds = (v) => (/:/.test(String(v)) ? seconds(v) : Number(v) || 0);
async function searchArchive(query, tag, page, commercial) {
  const words = query.replace(/[^\p{L}\p{N} -]/gu, ' ').trim();
  const q = [
    'collection:(netlabels)',
    'mediatype:(audio)',
    'licenseurl:(*creativecommons*)',
    words && `(${words})`,
    tag && `subject:(${tag})`,
    commercial && 'NOT licenseurl:(*nc*)',
  ].filter(Boolean).join(' AND ');
  const params = new URLSearchParams({ q, rows: '10', page: String(page + 1), output: 'json', sort: 'downloads desc' });
  const data = await getJson(`https://archive.org/advancedsearch.php?${params}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl`, 15000);
  const docs = data.response?.docs || [];
  // Up to 3 tracks per album, read from each album's file list (in parallel).
  const albums = await Promise.allSettled(docs.map((d) => getJson(`https://archive.org/metadata/${encodeURIComponent(d.identifier)}`, 12000)));
  const tracks = [];
  albums.forEach((a, i) => {
    if (a.status !== 'fulfilled') return;
    const d = docs[i];
    const licence = licenceFromUrl(d.licenseurl || a.value.metadata?.licenseurl);
    // An album often has each track in several MP3 qualities: keep the best one of each.
    const rank = (f) => (f.format === 'VBR MP3' ? 0 : /128/.test(f.format) ? 1 : 2);
    const seen = new Set();
    const files = (a.value.files || [])
      .filter((f) => /\.mp3$/i.test(f.name) && /MP3/.test(f.format || '') && lengthSeconds(f.length) > 0)
      .sort((x, y) => rank(x) - rank(y))
      .filter((f) => {
        const key = (f.title || f.name.replace(/(_vbr|_64kb|_128kb)?\.mp3$/i, '')).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    for (const f of files.slice(0, 3)) {
      tracks.push({
        id: `ia:${d.identifier}/${f.name}`,
        title: f.title || f.name.replace(/\.mp3$/i, '').replace(/_/g, ' '),
        artist: f.creator || f.artist || (Array.isArray(d.creator) ? d.creator[0] : d.creator) || T('Artiste inconnu'),
        album: d.title,
        duration: lengthSeconds(f.length),
        licence,
        licenceUrl: d.licenseurl || '',
        page: `https://archive.org/details/${d.identifier}`,
        audio: `https://archive.org/download/${encodeURIComponent(d.identifier)}/${encodeURIComponent(f.name)}`,
        ext: 'mp3',
        source: 'Internet Archive',
        downloadable: true,
      });
    }
  });
  return tracks;
}

// ccMixter refuses downloads by apps: its tracks are offered with a link to their page.
async function searchCcMixter(query, tag, page) {
  const params = new URLSearchParams({ f: 'json', limit: String(PAGE), offset: String(page * PAGE), sort: 'rank' });
  if (query) {
    params.set('search', query);
    params.set('search_type', 'all');
  }
  if (tag) params.set('tags', tag);
  const list = await getJson(`https://ccmixter.org/api/query?${params}`, 9000);
  return (Array.isArray(list) ? list : [])
    .map((a) => {
      const file = (a.files || []).find((f) => /\.mp3$/i.test(f.download_url || ''));
      if (!file) return null;
      const licence = licenceFromUrl(a.license_url);
      return {
        id: `ccm:${a.upload_id}`,
        title: a.upload_name || T('Sans titre'),
        artist: a.user_real_name || a.user_name || T('Artiste inconnu'),
        duration: seconds(file.file_format_info?.ps),
        licence,
        licenceUrl: a.license_url || '',
        page: a.file_page_url || '',
        audio: file.download_url,
        ext: 'mp3',
        source: 'ccMixter',
        downloadable: false,
      };
    })
    .filter(Boolean);
}

async function searchOpenverse(query, tag, page) {
  const params = new URLSearchParams({ q: [query, tag].filter(Boolean).join(' ') || 'music', page_size: String(PAGE), page: String(page + 1), category: 'music' });
  const data = await getJson(`https://api.openverse.org/v1/audio/?${params}`, 8000);
  return (data.results || [])
    .filter((a) => a.url)
    .map((a) => {
      const licence = a.license === 'cc0' ? 'CC0' : a.license === 'pdm' ? T('Domaine public') : `CC ${String(a.license).toUpperCase()}${a.license_version ? ` ${a.license_version}` : ''}`;
      return {
        id: `ov:${a.id}`,
        title: a.title || T('Sans titre'),
        artist: a.creator || T('Artiste inconnu'),
        duration: (a.duration || 0) / 1000,
        licence,
        licenceUrl: a.license_url || '',
        page: a.foreign_landing_url || '',
        audio: a.url,
        ext: (a.filetype || 'mp3').toLowerCase(),
        source: `Openverse · ${a.source}`,
        downloadable: true,
      };
    });
}

// The libraries are asked at once; one that is slow or down doesn't block the others.
async function searchMusic({ query = '', tag = '', page = 0, commercial = false } = {}) {
  const q = String(query).slice(0, 80).trim();
  const t = String(tag).replace(/[^\w-]/g, '').slice(0, 30);
  const p = Math.max(0, Math.min(50, Math.floor(page) || 0));
  const SOURCES = ['Internet Archive', 'ccMixter', 'Openverse'];
  const settled = await Promise.allSettled([searchArchive(q, t, p, !!commercial), searchCcMixter(q, t, p), searchOpenverse(q, t, p)]);
  const failed = [];
  const results = [];
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') results.push(...s.value);
    else failed.push({ source: SOURCES[i], error: String(s.reason?.cause?.code || s.reason?.message || s.reason) });
  });
  const shown = results
    .map((r) => ({ ...r, commercial: commercialOk(r.licence), credit: needsCredit(r.licence) }))
    .filter((r) => !commercial || r.commercial);
  for (const r of shown) known.set(r.id, r);
  if (!shown.length && failed.length === SOURCES.length) throw new Error(T('Les bibliothèques de musique ne répondent pas : vérifie ta connexion Internet et réessaie.'));
  return { results: shown, failed };
}

// What to write in the video description when the licence asks to credit the author.
const creditText = (r) => `${T('« {0} » par {1}', r.title, r.artist)} (${r.source.split(' · ').pop()}) — ${r.licence}${r.licenceUrl ? ` ${r.licenceUrl}` : ''}${r.page ? ` — ${r.page}` : ''}`;

async function downloadMusic(id, dir, fs, path) {
  const r = known.get(id);
  if (!r) throw new Error(T('Morceau inconnu : refais la recherche.'));
  if (!r.downloadable) throw new Error(T('{0} ne permet pas le téléchargement par une application : ouvre sa page pour le télécharger.', r.source));
  const res = await httpGet(r.audio, { timeout: 180000, maxBytes: MAX_BYTES });
  if (res.status !== 200) throw new Error(T('Téléchargement impossible (HTTP {0})', res.status));
  const bytes = res.body;
  const clean = (s) => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'musique';
  const ext = ['mp3', 'ogg', 'wav', 'flac', 'm4a', 'opus'].includes(r.ext) ? r.ext : 'mp3';
  let base = `${clean(r.title)} - ${clean(r.artist)}`;
  let n = 2;
  while (fs.existsSync(path.join(dir, `${base}.${ext}`))) base = `${clean(r.title)} - ${clean(r.artist)} (${n++})`;
  const file = path.join(dir, `${base}.${ext}`);
  await fs.promises.writeFile(file, bytes);
  const credit = creditText(r);
  await fs.promises.writeFile(
    path.join(dir, `${base} - licence.txt`),
    `${credit}\n\n${r.credit ? T('Cette licence demande de citer l’auteur : copie la ligne ci-dessus dans la description de ta vidéo.') : T('Aucune obligation de citer l’auteur (mais c’est sympa de le faire).')}\n${r.commercial ? '' : T('Usage commercial NON autorisé par cette licence.')}`,
  );
  return { file, credit, needsCredit: r.credit };
}

// ── AI music: MusicGen (small) runs on this computer; the first use downloads the model once. ──
const MUSICGEN = 'Xenova/musicgen-small';
const TOKENS_PER_SECOND = 50;
let musicgen = null;

async function loadMusicgen(cacheDir, onProgress) {
  if (!musicgen) {
    musicgen = (async () => {
      const t = await import('@huggingface/transformers');
      t.env.cacheDir = cacheDir;
      t.env.allowLocalModels = false;
      const files = new Map();
      const progress_callback = (p) => {
        if (!p.file || !(p.total > 0)) return;
        if (p.status === 'progress') files.set(p.file, { loaded: p.loaded, total: p.total });
        if (p.status === 'done') files.set(p.file, { loaded: p.total, total: p.total });
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        onProgress({ phase: 'model', progress: total ? loaded / total : 0 });
      };
      const tokenizer = await t.AutoTokenizer.from_pretrained(MUSICGEN, { progress_callback });
      const model = await t.MusicgenForConditionalGeneration.from_pretrained(MUSICGEN, {
        dtype: { text_encoder: 'q8', decoder_model_merged: 'q8', encodec_decode: 'fp32' },
        progress_callback,
      });
      return { tokenizer, model };
    })();
    musicgen.catch(() => {
      musicgen = null;
    });
  }
  return musicgen;
}

function wavBytes(samples, rate) {
  const data = Buffer.alloc(samples.length * 2);
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0.98 ? 0.98 / peak : 1;
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * gain)) * 32767), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

async function generateMusic({ prompt, duration }, { cacheDir, onProgress, isCancelled }) {
  const text = String(prompt || '').trim().slice(0, 300);
  if (!text) throw new Error(T('Décris la musique que tu veux.'));
  const secs = Math.min(30, Math.max(5, Math.round(duration) || 10));
  onProgress({ phase: 'model', progress: 0 });
  const { tokenizer, model } = await loadMusicgen(cacheDir, onProgress);
  const max = secs * TOKENS_PER_SECOND;
  let made = 0;
  // Called once per generated step: drives the progress bar and lets the user stop.
  const streamer = {
    put() {
      if (isCancelled()) throw new Error(T('Génération annulée'));
      made += 1;
      if (made % 10 === 0) onProgress({ phase: 'generate', progress: Math.min(1, made / max) });
    },
    end() {},
  };
  onProgress({ phase: 'generate', progress: 0 });
  const audio = await model.generate({ ...tokenizer(text), max_new_tokens: max, do_sample: true, guidance_scale: 3, streamer });
  const rate = model.config.audio_encoder?.sampling_rate || 32000;
  return wavBytes(audio.data, rate);
}

const musicPage = (id) => known.get(id)?.page || null;

// Saves a file from the web (used to fetch some AI models).
async function downloadTo(url, file) {
  const r = await httpGet(url, { timeout: 300000, maxBytes: MAX_BYTES });
  if (r.status !== 200) throw new Error(T('Téléchargement impossible (HTTP {0})', r.status));
  await require('fs').promises.writeFile(file, r.body);
}

module.exports = { searchMusic, downloadMusic, generateMusic, musicPage, downloadTo, MUSICGEN };
