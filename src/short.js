// What the Short button can do with the main track, worked out before anything changes.
import { laneOf } from './project.js';

// Above this length, YouTube Shorts and Instagram Reels no longer treat a vertical video as short.
export const SHORT_MAX_SECONDS = 180;

export function shortPlan(clips, media) {
  const byId = new Map(media.map((m) => [m.id, m]));
  const main = clips.filter((c) => c.track === 'video' && laneOf(c) === 0);
  const plan = { targets: [], framed: 0, stills: 0, missing: 0, total: 0, tooLong: false };
  for (const c of main) {
    const m = byId.get(c.mediaId);
    if (c.reframe?.length) plan.framed++;
    else if (!m || m.missing) plan.missing++;
    else if (m.type === 'image') plan.stills++;
    else plan.targets.push(c);
    plan.total = Math.max(plan.total, c.start + c.duration);
  }
  plan.targets.sort((a, b) => a.start - b.start);
  plan.tooLong = plan.total > SHORT_MAX_SECONDS;
  return plan;
}
