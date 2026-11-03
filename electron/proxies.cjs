// Light copies of big videos, for the preview only: the export always reads the original.
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_SIDE = 1920;
const PROXY_SIDE = 1280;
const MAX_CACHE_BYTES = 10 * 1024 ** 3;
const BUSY_RETRY_MS = 2000;

const needsProxy = (m) => m?.type === 'video' && m.alpha !== true && !m.missing && Math.max(m.width || 0, m.height || 0) > MAX_SIDE;

function proxyArgsFor(file, out, encoderArgs, encoder, colorSpace) {
  // An untagged big video is read as BT.709; once small it must stay so.
  const tags = colorSpace ? [] : ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
  return [
    '-y', '-v', 'error', '-i', file,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', `scale='if(gte(iw,ih),${PROXY_SIDE},-2)':'if(gte(iw,ih),-2,${PROXY_SIDE})',format=yuv420p`,
    '-fps_mode', 'passthrough',
    '-c:v', encoder, ...encoderArgs, ...tags,
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out,
  ];
}

// The least recently used copies go first; they can always be made again.
async function trimCache(dir, maxBytes = MAX_CACHE_BYTES) {
  const names = (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.mp4'));
  const files = await Promise.all(names.map(async (f) => {
    const s = await fs.promises.stat(path.join(dir, f));
    return { f, size: s.size, at: s.mtimeMs };
  }));
  files.sort((a, b) => b.at - a.at);
  let total = 0;
  for (const { f, size } of files) {
    total += size;
    if (total > maxBytes) await fs.promises.unlink(path.join(dir, f)).catch(() => {});
  }
}

function createProxies({ dir, ffmpegPath, getEncoder, encoderArgs, isBusy, onReady, onFailed }) {
  const queue = [];
  const failed = new Set();
  const queued = new Set();
  let current = null;
  let stopped = false;

  const nameFor = async (file) => {
    const s = await fs.promises.stat(file);
    const id = crypto.createHash('sha1').update(`${file}|${s.size}|${s.mtimeMs}`).digest('hex');
    return path.join(dir, `${id}.mp4`);
  };

  async function next() {
    if (current || stopped || !queue.length) return;
    if (isBusy()) {
      setTimeout(next, BUSY_RETRY_MS);
      return;
    }
    const job = queue.shift();
    current = job;
    const tmp = `${job.out}.part`;
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      const encoder = await getEncoder();
      // The .part name needs its real format: FFmpeg can't guess it from the extension.
      const args = proxyArgsFor(job.file, tmp, encoderArgs(encoder), encoder, job.colorSpace);
      args.splice(args.length - 1, 0, '-f', 'mp4');
      await new Promise((resolve, reject) => {
        const proc = spawn(ffmpegPath, args, { windowsHide: true, stdio: 'ignore' });
        job.proc = proc;
        proc.on('error', reject);
        proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg ${code}`))));
      });
      await fs.promises.rename(tmp, job.out);
      await trimCache(dir).catch(() => {});
      onReady(job.file, job.out);
    } catch {
      fs.rm(tmp, { force: true }, () => {});
      failed.add(job.file);
      if (!stopped) onFailed(job.file);
    }
    queued.delete(job.file);
    current = null;
    next();
  }

  // Answers with what the preview can use now; the rest comes through onReady.
  async function request(m) {
    if (!needsProxy(m) || failed.has(m.path)) return { status: 'none' };
    const out = await nameFor(m.path);
    if (fs.existsSync(out)) {
      const now = new Date();
      fs.utimes(out, now, now, () => {});
      return { status: 'ready', file: out };
    }
    if (!queued.has(m.path)) {
      queued.add(m.path);
      queue.push({ file: m.path, out, colorSpace: m.colorSpace });
      next();
    }
    return { status: 'pending' };
  }

  function stop() {
    stopped = true;
    queue.length = 0;
    current?.proc?.kill();
  }

  return { request, stop };
}

module.exports = { createProxies, needsProxy, proxyArgsFor, trimCache };
