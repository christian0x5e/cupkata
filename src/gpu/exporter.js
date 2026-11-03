import { gpuEngine } from './engine.js';
import { clipTransform, overlayBox } from '../project.js';
import { drawBox, drawMoved } from '../keyframes.js';

function canvas2d(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d', { willReadFrequently: true });
}

// Moves an animated clip's frame with the same drawing as the preview (see src/keyframes.js).
function motionPainter(job) {
  const { clip, overlay, mediaWidth, mediaHeight, inWidth, inHeight } = job.motion;
  const source = canvas2d(inWidth, inHeight);
  const out = canvas2d(job.width, job.height);
  return (bytes, tau) => {
    source.putImageData(new ImageData(new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength), inWidth, inHeight), 0, 0);
    if (overlay) {
      out.clearRect(0, 0, job.width, job.height);
      drawBox(out, source.canvas, overlayBox(clip, mediaWidth, mediaHeight, job.width, job.height, tau));
    } else {
      drawMoved(out, source.canvas, job.width, job.height, clipTransform(clip, tau));
    }
    return new Uint8Array(out.getImageData(0, 0, job.width, job.height).data.buffer);
  };
}

// Runs the frames that need the renderer (GPU effects, animated clips) through the same code as the preview.
// The main process decodes exact frames; each one comes here, is processed, and goes back for encoding.
export async function prerenderGpu(api, project, token, { onProgress, isCancelled }) {
  const jobs = await api.gpuPlan(project, token);
  if (!jobs.length) return 0;
  const total = jobs.reduce((n, j) => n + j.frames, 0);
  let done = 0;
  for (const job of jobs) {
    await api.gpuStart(job.jobId);
    const engine = job.effect && gpuEngine(job.width, job.height, 'export');
    const paint = job.motion && motionPainter(job);
    for (let i = 0; i < job.frames; i++) {
      if (isCancelled()) throw new Error('Export annulé');
      const frame = await api.gpuRead(job.jobId);
      if (!frame) break;
      const tau = i / job.fps + job.tau0;
      let out = job.effect ? engine.renderBytes(job.effect.type, frame, tau, job.effect.intensity) : frame;
      if (paint) out = paint(out, tau);
      await api.gpuWrite(job.jobId, out);
      done += 1;
      if (done % 5 === 0 || done === total) onProgress(done / total);
    }
    await api.gpuFinish(job.jobId);
  }
  return jobs.length;
}
