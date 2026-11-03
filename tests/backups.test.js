import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isBackupDue, keepBackup } from '../electron/backups.cjs';
import { sanitize, toFileContent, writeAtomic } from '../electron/project.cjs';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cupkata-test-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('sauvegardes', () => {
  it('écrit une copie datée lisible', async () => {
    const file = await keepBackup(dir, 'Mon projet', '{"a":1}', { now: new Date(2026, 10, 2, 10, 20, 30) });
    expect(path.basename(file)).toBe('Mon projet 2026-11-02 10-20-30.cupkata');
    expect(fs.readFileSync(file, 'utf8')).toBe('{"a":1}');
  });

  it('nettoie les caractères interdits du nom', async () => {
    const file = await keepBackup(dir, 'a/b:c?', '{}');
    expect(path.basename(file).startsWith('a_b_c_ ')).toBe(true);
  });

  it('supprime les plus anciennes au-delà de la limite', async () => {
    for (let i = 0; i < 5; i++) {
      const now = new Date(Date.now() - (10 - i) * 1000);
      const file = await keepBackup(dir, `p${i}`, '{}', { keep: 3, now });
      fs.utimesSync(file, now, now);
    }
    expect(fs.readdirSync(dir).map((f) => f.slice(0, 2)).sort()).toEqual(['p2', 'p3', 'p4']);
  });

  it('attend 5 minutes entre deux sauvegardes', () => {
    expect(isBackupDue(0, 5 * 60 * 1000)).toBe(true);
    expect(isBackupDue(1000, 5 * 60 * 1000)).toBe(false);
  });
});

describe('fichier projet', () => {
  it('garde les clips, marqueurs et médias après relecture', () => {
    const project = {
      settings: { resolution: '1080p' },
      media: [{ id: 'm', path: 'C:/v/a.mp4', name: 'a.mp4', type: 'video', duration: 10, width: 1920, height: 1080, hasAudio: true }],
      clips: [{ id: 'c', mediaId: 'm', track: 'video', lane: 0, start: 1, in: 2, duration: 3 }],
      markers: [{ id: 'x', time: 1.5, label: 'ici' }],
    };
    const back = sanitize(JSON.parse(toFileContent(project, 'C:/v/p.cupkata')));
    expect(back.media[0].path).toBe('C:/v/a.mp4');
    expect(back.clips[0]).toMatchObject({ id: 'c', start: 1, in: 2, duration: 3 });
    expect(back.markers[0]).toMatchObject({ id: 'x', time: 1.5, label: 'ici' });
  });

  it("l'écriture atomique ne laisse pas de fichier temporaire", async () => {
    const file = path.join(dir, 'p.cupkata');
    await writeAtomic(file, 'un');
    await writeAtomic(file, 'deux');
    expect(fs.readFileSync(file, 'utf8')).toBe('deux');
    expect(fs.readdirSync(dir)).toEqual(['p.cupkata']);
  });
});
