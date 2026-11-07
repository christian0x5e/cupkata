const fs = require('fs');
const path = require('path');
const CATALOGUE = require('../shared/sounds.json');

// The sound effects travel with the app; each one is copied out once, so that FFmpeg and projects can
// reach it as an ordinary file. A sound that changes in a new version replaces its old copy.
const SOURCE = path.join(__dirname, '..', 'shared', 'sounds');

async function ensureSounds(dir, source = SOURCE) {
  const list = [];
  for (const { id, name, group } of CATALOGUE) {
    const from = path.join(source, `${id}.ogg`);
    const file = path.join(dir, `${name}.ogg`);
    const size = (p) => fs.promises.stat(p).then((s) => s.size, () => -1);
    if ((await size(file)) !== (await size(from))) await fs.promises.copyFile(from, file);
    list.push({ id, name, group, file });
  }
  return list;
}

module.exports = { ensureSounds };
