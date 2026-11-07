// Reads a .cube 3D LUT (the common format for colour filters) and resamples it to 33×33×33.
const { T } = require('./i18n.cjs');
const TARGET = 33;
const MAX_BYTES = 30 * 1024 * 1024;

function parseCube(text) {
  let size = 0;
  let min = [0, 0, 0];
  let max = [1, 1, 1];
  const values = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const key = parts[0].toUpperCase();
    if (key === 'TITLE') continue;
    if (key === 'LUT_1D_SIZE') throw new Error(T('Ce fichier est un filtre 1D : seuls les filtres 3D (.cube) sont pris en charge'));
    if (key === 'LUT_3D_SIZE') {
      size = Number(parts[1]);
      continue;
    }
    if (key === 'DOMAIN_MIN') {
      min = parts.slice(1, 4).map(Number);
      continue;
    }
    if (key === 'DOMAIN_MAX') {
      max = parts.slice(1, 4).map(Number);
      continue;
    }
    if (/^[A-Z_]+$/.test(key)) continue;
    const rgb = parts.slice(0, 3).map(Number);
    if (rgb.length !== 3 || !rgb.every(Number.isFinite)) throw new Error(T('Ligne de couleur illisible dans le fichier .cube'));
    values.push(rgb);
  }
  if (!Number.isInteger(size) || size < 2 || size > 128) throw new Error(T('Taille de filtre manquante ou invalide (LUT_3D_SIZE)'));
  if (values.length !== size ** 3) throw new Error(T('Le fichier annonce {0} couleurs mais en contient {1}', size ** 3, values.length));
  const range = max.map((m, i) => m - min[i] || 1);
  return { size, values: values.map((rgb) => rgb.map((v, i) => (v - min[i]) / range[i])) };
}

function sample({ size, values }, r, g, b) {
  const pos = [r, g, b].map((v) => Math.min(size - 1, Math.max(0, v * (size - 1))));
  const i0 = pos.map(Math.floor);
  const i1 = i0.map((v) => Math.min(size - 1, v + 1));
  const f = pos.map((v, i) => v - i0[i]);
  const at = (ri, gi, bi) => values[ri + gi * size + bi * size * size];
  const out = [0, 0, 0];
  for (const [ri, wr] of [[i0[0], 1 - f[0]], [i1[0], f[0]]]) {
    for (const [gi, wg] of [[i0[1], 1 - f[1]], [i1[1], f[1]]]) {
      for (const [bi, wb] of [[i0[2], 1 - f[2]], [i1[2], f[2]]]) {
        const w = wr * wg * wb;
        if (!w) continue;
        const c = at(ri, gi, bi);
        for (let k = 0; k < 3; k++) out[k] += c[k] * w;
      }
    }
  }
  return out;
}

function cubeToLut(text) {
  if (text.length > MAX_BYTES) throw new Error(T('Fichier .cube trop volumineux'));
  const cube = parseCube(text);
  const data = [];
  for (let b = 0; b < TARGET; b++) {
    for (let g = 0; g < TARGET; g++) {
      for (let r = 0; r < TARGET; r++) {
        for (const v of sample(cube, r / (TARGET - 1), g / (TARGET - 1), b / (TARGET - 1))) data.push(Math.round(Math.min(1, Math.max(0, v)) * 1e4) / 1e4);
      }
    }
  }
  return { size: TARGET, data };
}

module.exports = { cubeToLut, parseCube };
