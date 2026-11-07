// The sound effects travel with the app: every sound of the catalogue exists, plays, and has its English name.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import CATALOGUE from '../shared/sounds.json';
import en from '../shared/en.json';
import { ffmpegPath, ffprobePath } from '../electron/media.cjs';
import { ensureSounds } from '../electron/sfx.cjs';

const SOURCE = path.join('shared', 'sounds');
const seconds = (file) => Number(execFileSync(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());

describe('sound effects', () => {
  it('has unique ids and names, also as file names', () => {
    expect(new Set(CATALOGUE.map((s) => s.id)).size).toBe(CATALOGUE.length);
    expect(new Set(CATALOGUE.map((s) => s.name.toLowerCase())).size).toBe(CATALOGUE.length);
    for (const s of CATALOGUE) expect(s.name).not.toMatch(/[<>:"/\\|?*]/);
  });
  it('has English names', () => {
    for (const s of CATALOGUE) {
      expect(en[s.name], s.name).toBeTruthy();
      expect(en[s.group], s.group).toBeTruthy();
    }
  });
  it('has a file that decodes for every sound, and no file left over', () => {
    for (const s of CATALOGUE) {
      const file = path.join(SOURCE, `${s.id}.ogg`);
      expect(fs.existsSync(file), file).toBe(true);
      expect(seconds(file)).toBeGreaterThan(0.05);
      execFileSync(ffmpegPath, ['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-']);
    }
    const files = fs.readdirSync(SOURCE).filter((f) => f.endsWith('.ogg'));
    expect(files.length).toBe(CATALOGUE.length);
  }, 120000);
  it('copies the sounds out once, and replaces one that changed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cupkata-sfx-'));
    try {
      const list = await ensureSounds(dir);
      expect(list).toHaveLength(CATALOGUE.length);
      for (const s of list) expect(fs.existsSync(s.file), s.file).toBe(true);
      const first = list[0].file;
      const stamp = fs.statSync(first).mtimeMs;
      await ensureSounds(dir);
      expect(fs.statSync(first).mtimeMs).toBe(stamp);
      fs.writeFileSync(first, 'old');
      await ensureSounds(dir);
      expect(fs.statSync(first).size).toBe(fs.statSync(path.join(SOURCE, `${list[0].id}.ogg`)).size);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
