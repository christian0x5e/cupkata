// Music bought on iTunes / Apple Music and downloaded on this PC: Cupkata reads the folders where
// those apps keep it. Purchases since 2009 are plain AAC files (.m4a) and can be used; older ones
// and Apple Music subscription tracks are DRM-protected (.m4p) and stay unusable.
const fs = require('fs');
const path = require('path');
const os = require('os');

const AUDIO = new Set(['.m4a', '.mp3', '.aac', '.wav', '.flac', '.m4p', '.aif', '.aiff']);
const MAX_TRACKS = 5000;

const defaultRoots = () => {
  const music = path.join(os.homedir(), 'Music');
  return [
    path.join(music, 'Apple Music', 'Media'),
    path.join(music, 'iTunes', 'iTunes Media'),
  ];
};

// Folders the user picked this session, and the files found: only these can be imported.
const extraRoots = new Set();
const found = new Set();

// "01 Ma chanson.m4a" in "Artiste/Album/" → title, artist, album from the names, as iTunes lays them out.
function describe(file, root) {
  const rel = path.relative(root, file).split(path.sep);
  const name = path.parse(file).name.replace(/^\d{1,2}(-\d{1,2})?\s+/, '');
  const ext = path.extname(file).toLowerCase();
  return {
    path: file,
    title: name,
    album: rel.length >= 3 ? rel[rel.length - 2] : '',
    artist: rel.length >= 3 ? rel[rel.length - 3] : rel.length === 2 ? rel[0] : '',
    ext: ext.slice(1),
    protected: ext === '.m4p',
  };
}

async function walk(dir, root, out, depth = 0) {
  if (out.length >= MAX_TRACKS || depth > 6) return;
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= MAX_TRACKS) return;
    const p = path.join(dir, e.name);
    // Files waiting to be added by Apple Music are not part of the library yet.
    if (e.isDirectory() && !/^Automatically Add to/i.test(e.name)) await walk(p, root, out, depth + 1);
    else if (e.isFile() && AUDIO.has(path.extname(e.name).toLowerCase())) out.push(describe(p, root));
  }
}

async function scanLibrary(extra) {
  if (extra) extraRoots.add(extra);
  const roots = [...defaultRoots(), ...extraRoots];
  const tracks = [];
  for (const root of roots) await walk(root, root, tracks);
  for (const t of tracks) found.add(t.path);
  return {
    roots: roots.map((r) => ({ path: r, exists: fs.existsSync(r) })),
    // Album order: the file names start with the track number.
    tracks: tracks.sort(
      (a, b) =>
        a.artist.localeCompare(b.artist, 'fr') ||
        a.album.localeCompare(b.album, 'fr') ||
        path.basename(a.path).localeCompare(path.basename(b.path), 'fr', { numeric: true }),
    ),
  };
}

const isListed = (p) => typeof p === 'string' && found.has(p) && path.extname(p).toLowerCase() !== '.m4p';

module.exports = { scanLibrary, isListed };
