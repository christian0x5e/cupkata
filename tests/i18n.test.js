// The English dictionary against the sources: every text has its translation, with the values it needs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';
import en from '../shared/en.json';
import { ffmpegPath } from '../electron/media.cjs';
import { T } from '../src/i18n.js';
import { DEFAULT_SETTINGS, getSetting } from '../src/settings.js';

// Loaded like the app does, so that both share the same language.
const require = createRequire(import.meta.url);
const { detectEncoder, setHardwareEncoding, withFallback } = require('../electron/encoders.cjs');
const { setLanguage, T: mainT } = require('../electron/i18n.cjs');

const sourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? sourceFiles(file) : /\.(js|jsx|cjs)$/.test(entry.name) ? [file] : [];
});
const unescape = (text) => text.replace(/\\n/g, '\n').replace(/\\(['"\\])/g, '$1');
const CALL = /\bT\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g;
const placeholders = (text) => new Set(text.match(/\{\d+\}/g) ?? []);

afterAll(() => {
  setLanguage('fr');
  setHardwareEncoding(true);
});

describe('translations', () => {
  it('has an English text for every text of the code', () => {
    const missing = [];
    for (const file of [...sourceFiles('src'), ...sourceFiles('electron')]) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(CALL)) {
        const key = unescape(match[1] ?? match[2]);
        if (en[key] === undefined) missing.push(`${path.basename(file)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
  it('only asks for values the French text receives', () => {
    for (const [fr, english] of Object.entries(en)) {
      const known = placeholders(fr);
      for (const slot of placeholders(english)) expect(known.has(slot), `${fr} -> ${english}`).toBe(true);
    }
  });
  it('keeps the French text under test, and fills in the values', () => {
    expect(T('Effets')).toBe('Effets');
    expect(T('Réglage {0}', 2)).toBe('Réglage 2');
  });
  it('translates the messages of the main process', () => {
    setLanguage('en');
    expect(mainT('La timeline est vide')).toBe('The timeline is empty');
    expect(mainT('Ffffff')).toBe('Ffffff');
    setLanguage('fr');
    expect(mainT('La timeline est vide')).toBe('La timeline est vide');
  });
  it('still recognises a cancelled export in English', async () => {
    setLanguage('en');
    let runs = 0;
    await expect(withFallback('h264_nvenc', async () => {
      runs++;
      throw new Error(mainT('Export annulé'));
    })).rejects.toThrow('Export canceled');
    expect(runs).toBe(1);
    setLanguage('fr');
  });
});

describe('settings', () => {
  it('starts from the defaults', () => {
    for (const [name, value] of Object.entries(DEFAULT_SETTINGS)) expect(getSetting(name)).toBe(value);
  });
  it('leaves the graphics card out when asked', async () => {
    setHardwareEncoding(false);
    expect(await detectEncoder(ffmpegPath)).toBe('libx264');
    expect(await detectEncoder(ffmpegPath, 'hevc')).toBe('libx265');
  });
});
