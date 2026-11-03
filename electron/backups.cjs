// Dated copies of a project, so an older version can always be reopened.
const fs = require('fs');
const path = require('path');

const KEEP = 30;
const EVERY_MS = 5 * 60 * 1000;

const isBackupDue = (lastAt, now = Date.now()) => now - lastAt >= EVERY_MS;

const pad = (v) => String(v).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

async function keepBackup(dir, name, content, { keep = KEEP, now = new Date() } = {}) {
  await fs.promises.mkdir(dir, { recursive: true });
  const safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80) || 'Sans titre';
  const file = path.join(dir, `${safe} ${stamp(now)}.cupkata`);
  await fs.promises.writeFile(file, content, 'utf8');
  await prune(dir, keep);
  return file;
}

// The oldest go first; the dated names sort by project, so the age comes from the file itself.
async function prune(dir, keep) {
  const names = (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.cupkata'));
  const files = await Promise.all(
    names.map(async (f) => ({ f, at: (await fs.promises.stat(path.join(dir, f))).mtimeMs })),
  );
  files.sort((a, b) => b.at - a.at || b.f.localeCompare(a.f));
  await Promise.all(files.slice(keep).map(({ f }) => fs.promises.unlink(path.join(dir, f))));
}

module.exports = { keepBackup, isBackupDue };
