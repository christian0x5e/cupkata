import { gpuEngine } from './engine.js';

// Runs every GPU-effect segment of the export through the same shaders as the preview.
// The main process decodes exact frames; each one comes here, is processed, and goes back for encoding.
export async function prerenderGpu(api, project, token, { onProgress, isCancelled }) {
  const jobs = await api.gpuPlan(project, token);
  if (!jobs.length) return 0;
  const total = jobs.reduce((n, j) => n + j.frames, 0);
  let done = 0;
  for (const job of jobs) {
    await api.gpuStart(job.jobId);
    const engine = gpuEngine(job.width, job.height, 'export');
    for (let i = 0; i < job.frames; i++) {
      if (isCancelled()) throw new Error('Export annulé');
      const frame = await api.gpuRead(job.jobId);
      if (!frame) break;
      const out = engine.renderBytes(job.effect.type, frame, i / job.fps + job.tau0, job.effect.intensity);
      await api.gpuWrite(job.jobId, out);
      done += 1;
      if (done % 5 === 0 || done === total) onProgress(done / total);
    }
    await api.gpuFinish(job.jobId);
  }
  return jobs.length;
}
