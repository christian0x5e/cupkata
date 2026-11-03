// Picks the graphics card's H.264 encoder when it works, the processor's otherwise.
const { spawn } = require('child_process');

const HARDWARE = ['h264_nvenc', 'h264_amf', 'h264_qsv'];

// Settings measured on a 4K source for the same SSIM as x264 at CRF 20.
const CONSTANT_QUALITY = {
  h264_nvenc: ['-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', '22', '-b:v', '0', '-spatial-aq', '1', '-bf', '3'],
  h264_amf: ['-quality', 'quality', '-rc', 'qvbr', '-qvbr_quality_level', '22', '-b:v', '60M'],
  h264_qsv: ['-preset', 'medium', '-global_quality', '22'],
  libx264: ['-preset', 'veryfast', '-crf', '20'],
};
const TARGET_RATE = { h264_nvenc: ['-preset', 'p5', '-tune', 'hq', '-rc', 'vbr'], h264_amf: ['-quality', 'quality', '-rc', 'vbr_peak'], h264_qsv: ['-preset', 'medium'], libx264: ['-preset', 'veryfast'] };
// A nearly lossless step before the final encode.
const INTERMEDIATE = {
  h264_nvenc: ['-preset', 'p1', '-rc', 'constqp', '-qp', '14', '-bf', '0'],
  h264_amf: ['-quality', 'speed', '-rc', 'cqp', '-qp_i', '14', '-qp_p', '14'],
  h264_qsv: ['-preset', 'veryfast', '-global_quality', '14'],
  libx264: ['-preset', 'ultrafast', '-crf', '10'],
};
// The preview's light copy: quick to make, every half second can be reached at once.
const PROXY = {
  h264_nvenc: ['-preset', 'p3', '-rc', 'vbr', '-cq', '26', '-b:v', '0', '-bf', '0', '-g', '15'],
  h264_amf: ['-quality', 'speed', '-rc', 'qvbr', '-qvbr_quality_level', '26', '-b:v', '10M', '-g', '15'],
  h264_qsv: ['-preset', 'veryfast', '-global_quality', '26', '-g', '15'],
  libx264: ['-preset', 'ultrafast', '-crf', '24', '-bf', '0', '-g', '15'],
};

const finalArgs = (encoder, videoKbps = 0) =>
  videoKbps
    ? [...TARGET_RATE[encoder], '-b:v', `${videoKbps}k`, '-maxrate', `${Math.round(videoKbps * 1.5)}k`, '-bufsize', `${videoKbps * 2}k`]
    : CONSTANT_QUALITY[encoder];
const intermediateArgs = (encoder) => INTERMEDIATE[encoder];
const proxyArgs = (encoder) => PROXY[encoder];

function works(ffmpegPath, encoder) {
  return new Promise((resolve) => {
    const proc = spawn(
      ffmpegPath,
      ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=30:d=0.2', '-pix_fmt', 'yuv420p', '-c:v', encoder, ...CONSTANT_QUALITY[encoder], '-f', 'null', '-'],
      { windowsHide: true, stdio: 'ignore' },
    );
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

let found = null;
function detectEncoder(ffmpegPath) {
  found ??= (async () => {
    for (const encoder of HARDWARE) if (await works(ffmpegPath, encoder)) return encoder;
    return 'libx264';
  })();
  return found;
}

// The graphics card first; if it refuses this job (too big, driver…) the processor takes over.
async function withFallback(encoder, run) {
  try {
    return await run(encoder);
  } catch (err) {
    if (encoder === 'libx264' || err.message === 'Export annulé') throw err;
    return run('libx264');
  }
}

module.exports = { detectEncoder, finalArgs, intermediateArgs, proxyArgs, withFallback };
