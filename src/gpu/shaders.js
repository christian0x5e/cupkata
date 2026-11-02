// GPU effects, written once and used for both the preview and the export.
// Coordinates: vUv in [0,1], (0,0) = top-left of the picture. uTime = seconds since the clip start,
// uAmount = intensity 0..1, uRes = size in pixels. Distances are relative to the picture height
// so an effect looks the same at 720p and 1080p.
// Several effects follow the approach of pixi-filters (MIT) — see THIRD_PARTY_NOTICES.md.

export const HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uAmount;
const float PI = 3.14159265;
vec4 tex(vec2 uv) { return texture(uTex, clamp(uv, vec2(0.0), vec2(1.0))); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// Converts between uv and height-relative coordinates centred on the picture.
vec2 toCentered(vec2 uv) { return (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0); }
vec2 fromCentered(vec2 p) { return p / vec2(uRes.x / uRes.y, 1.0) + 0.5; }
`;

export const SHADERS = {
  // Twisting rotation that fades out with distance (approach from pixi-filters' TwistFilter).
  swirl: `
void main() {
  vec2 p = toCentered(vUv);
  float radius = 0.65;
  float d = length(p);
  if (d < radius) {
    float k = (radius - d) / radius;
    float a = uAmount * 4.0 * k * k * (0.65 + 0.35 * sin(uTime * 1.5));
    p = vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a));
  }
  outColor = vec4(tex(fromCentered(p)).rgb, 1.0);
}`,

  // Magnifying bulge in the middle, breathing slowly.
  bulge: `
void main() {
  vec2 p = toCentered(vUv);
  float radius = 0.55;
  float d = length(p);
  if (d < radius && d > 0.0) {
    float s = uAmount * 0.9 * (0.8 + 0.2 * sin(uTime * 2.0));
    p *= pow(d / radius, s);
  }
  outColor = vec4(tex(fromCentered(p)).rgb, 1.0);
}`,

  // Radial blur towards the centre.
  zoomblur: `
void main() {
  vec2 dir = vUv - 0.5;
  float strength = uAmount * 0.14;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    float t = float(i) / 23.0;
    acc += tex(vUv - dir * strength * t).rgb;
  }
  outColor = vec4(acc / 24.0, 1.0);
}`,

  // Old TV: curved glass, scan lines, rolling bright line, noise and dark corners
  // (approach from pixi-filters' CRTFilter).
  crt: `
void main() {
  vec2 c = vUv - 0.5;
  float k = 0.18 * uAmount;
  vec2 uv = 0.5 + c * (1.0 + k * dot(c, c));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 col = tex(uv).rgb;
  float lines = 0.5 + 0.5 * cos(uv.y * PI * 360.0);
  col *= 1.0 - 0.28 * uAmount * lines;
  float roll = smoothstep(0.06, 0.0, abs(fract(uv.y - uTime * 0.12) - 0.5));
  col += 0.08 * uAmount * roll;
  col += (hash(floor(uv * uRes / 2.0) + floor(uTime * 24.0)) - 0.5) * 0.08 * uAmount;
  float v = smoothstep(0.85, 0.35, length(c * vec2(1.0, uRes.y / uRes.x * 1.4)));
  col *= mix(1.0, v, uAmount);
  outColor = vec4(col, 1.0);
}`,

  // Digital glitch: horizontal bands jump sideways, colours split.
  glitch: `
void main() {
  float t = floor(uTime * 12.0);
  float band = floor(vUv.y * 18.0);
  float r = hash(vec2(band, t));
  vec2 uv = vUv;
  if (r > 1.0 - 0.4 * uAmount) uv.x += (hash(vec2(t, band + 7.0)) - 0.5) * 0.14 * uAmount;
  float split = 0.009 * uAmount * (0.5 + hash(vec2(t, 3.0)));
  vec3 col = vec3(tex(uv + vec2(split, 0.0)).r, tex(uv).g, tex(uv - vec2(split, 0.0)).b);
  if (hash(vec2(band * 3.0, t)) > 1.0 - 0.06 * uAmount) col = 1.0 - col;
  outColor = vec4(col, 1.0);
}`,

  // Expanding ring that bends the picture, every 1.6 s (approach from pixi-filters' ShockwaveFilter).
  shockwave: `
void main() {
  float phase = fract(uTime / 1.6);
  float radius = phase * 1.3;
  float half_w = 0.09;
  vec2 p = toCentered(vUv);
  float d = length(p);
  vec2 uv = vUv;
  float boost = 1.0;
  float diff = (d - radius) / half_w;
  if (abs(diff) < 1.0 && d > 0.0) {
    float fade = (1.0 - phase) * (1.0 - phase);
    float shape = 1.0 - diff * diff;
    float push = sin(diff * PI) * shape * 0.035 * uAmount * fade;
    uv = fromCentered(p + normalize(p) * push);
    boost = 1.0 + 0.25 * uAmount * shape * fade;
  }
  outColor = vec4(tex(uv).rgb * boost, 1.0);
}`,

  // Relief: picture as if engraved.
  emboss: `
void main() {
  vec2 px = 1.5 / uRes * (uRes.y / 720.0);
  vec3 a = tex(vUv - px).rgb;
  vec3 b = tex(vUv + px).rgb;
  float e = 0.5 + luma(a - b) * 3.0;
  vec3 col = tex(vUv).rgb;
  outColor = vec4(mix(col, vec3(e), uAmount), 1.0);
}`,

  // Comic-book halftone: round dots sized by brightness.
  halftone: `
void main() {
  float cell = mix(5.0, 16.0, uAmount) * uRes.y / 720.0;
  float ang = 0.785398;
  mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 p = rot * (vUv * uRes);
  vec2 centre = (floor(p / cell) + 0.5) * cell;
  vec2 uvc = (transpose(rot) * centre) / uRes;
  vec3 col = tex(uvc).rgb;
  float r = sqrt(1.0 - luma(col)) * cell * 0.62;
  float dotMask = smoothstep(r + 0.8, r - 0.8, length(p - centre));
  vec3 ink = col * 0.85;
  outColor = vec4(mix(vec3(0.97, 0.95, 0.9), ink, dotMask), 1.0);
}`,

  // Miniature look: blur above and below a sharp band, a bit more colour.
  tiltshift: `
void main() {
  float d = max(0.0, abs(vUv.y - 0.5) - 0.12) / 0.38;
  float radius = d * d * 10.0 * uAmount * uRes.y / 720.0;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int x = -3; x <= 3; x++) {
    for (int y = -3; y <= 3; y++) {
      vec2 o = vec2(float(x), float(y)) / 3.0 * radius / uRes;
      float w = exp(-float(x * x + y * y) / 8.0);
      acc += tex(vUv + o).rgb * w;
      wsum += w;
    }
  }
  vec3 col = acc / wsum;
  float l = luma(col);
  col = mix(vec3(l), col, 1.0 + 0.35 * uAmount);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,

  // Bright areas bleed light around them.
  bloom: `
void main() {
  vec3 base = tex(vUv).rgb;
  vec3 acc = vec3(0.0);
  float radius = 0.025;
  for (int i = 0; i < 16; i++) {
    float a = float(i) / 16.0 * 2.0 * PI;
    for (int j = 1; j <= 2; j++) {
      vec2 o = vec2(cos(a), sin(a)) * radius * float(j) / 2.0 * vec2(uRes.y / uRes.x, 1.0);
      vec3 s = tex(vUv + o).rgb;
      acc += max(s - 0.55, 0.0);
    }
  }
  acc /= 32.0;
  outColor = vec4(clamp(base + acc * 3.5 * uAmount, 0.0, 1.0), 1.0);
}`,

  // Six mirrored slices turning slowly.
  kaleido: `
void main() {
  vec2 p = toCentered(vUv);
  float r = length(p);
  float a = atan(p.y, p.x) + uTime * 0.25;
  float seg = 2.0 * PI / 6.0;
  float m = mod(a, seg);
  m = abs(m - seg * 0.5);
  vec2 q = r * vec2(cos(m), sin(m));
  vec3 k = tex(fromCentered(q)).rgb;
  outColor = vec4(mix(tex(vUv).rgb, k, uAmount), 1.0);
}`,

  // Cupkata's own "sparkly blur": dreamy soft focus, glow, star rays that grow out of the picture's own
  // highlights and slowly turn, highlights that twinkle, and small cross-shaped glints on the brightest spots.
  sparkblur: `
void main() {
  vec2 px = 1.0 / uRes;
  float s = uRes.y / 720.0;
  vec3 orig = tex(vUv).rgb;

  vec3 blur = vec3(0.0);
  float radius = 6.0 * s * uAmount;
  for (int i = 0; i < 16; i++) {
    float a = float(i) / 16.0 * 2.0 * PI;
    float ring = 1.0 + 0.6 * mod(float(i), 2.0);
    blur += tex(vUv + vec2(cos(a), sin(a)) * px * radius * ring).rgb;
  }
  blur /= 16.0;
  vec3 col = mix(orig, blur, 0.55 * uAmount);

  // Only real highlights (judged on perceived brightness, not on one saturated channel) shine.
  vec3 rays = vec3(0.0);
  float turn = uTime * 0.15;
  for (int d = 0; d < 4; d++) {
    float a = turn + float(d) * PI * 0.25;
    vec2 dir = vec2(cos(a), sin(a)) * px * 3.0 * s;
    for (int k = 1; k <= 8; k++) {
      float w = exp(-float(k) * 0.35);
      vec3 p1 = tex(vUv + dir * float(k)).rgb;
      vec3 p2 = tex(vUv - dir * float(k)).rgb;
      rays += (p1 * smoothstep(0.72, 0.95, luma(p1)) + p2 * smoothstep(0.72, 0.95, luma(p2))) * w;
    }
  }
  rays *= 0.35;

  float cellSize = 6.0 * s;
  vec2 cell = floor(vUv * uRes / cellSize);
  // Smooth (interpolated) noise, so dense rays shimmer without a checkerboard pattern.
  vec2 q = vUv * uRes / (40.0 * s);
  vec2 qi = floor(q);
  vec2 qf = fract(q);
  qf = qf * qf * (3.0 - 2.0 * qf);
  float n = mix(mix(hash(qi), hash(qi + vec2(1.0, 0.0)), qf.x), mix(hash(qi + vec2(0.0, 1.0)), hash(qi + vec2(1.0, 1.0)), qf.x), qf.y);
  float twinkle = 0.6 + 0.4 * sin(uTime * 4.0 + n * 6.2831);

  vec2 f = fract(vUv * uRes / cellSize) - 0.5;
  float starMask = max(smoothstep(0.09, 0.0, abs(f.x)) * smoothstep(0.5, 0.0, abs(f.y)),
                       smoothstep(0.09, 0.0, abs(f.y)) * smoothstep(0.5, 0.0, abs(f.x)));
  float glint = step(0.992, hash(cell + floor(uTime * 10.0))) * smoothstep(0.8, 0.95, luma(orig)) * starMask;

  vec3 bloom = blur * smoothstep(0.65, 0.95, luma(blur)) * 0.6;
  col += (rays * twinkle + bloom) * uAmount * vec3(1.0, 0.96, 1.04);
  col += vec3(1.0, 0.97, 0.9) * glint * 1.3 * uAmount;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,

  // Heat haze: small rippling distortion.
  heat: `
void main() {
  vec2 uv = vUv;
  float w = sin(uv.y * 42.0 + uTime * 6.0) + 0.6 * sin(uv.y * 77.0 - uTime * 4.3 + uv.x * 9.0);
  uv.x += w * 0.0035 * uAmount;
  uv.y += sin(uv.x * 35.0 + uTime * 5.0) * 0.0025 * uAmount;
  outColor = vec4(tex(uv).rgb, 1.0);
}`,
};
