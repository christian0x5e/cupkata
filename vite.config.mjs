import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Only built pages get it: the dev server needs inline scripts and its own connection.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: cupkata-media:",
  "media-src 'self' data: blob: https: cupkata-media:",
  "connect-src 'self' blob: data: cupkata-media:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const csp = {
  name: 'cupkata-csp',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
};

export default defineConfig({
  base: './',
  plugins: [react(), csp],
  server: { port: 5173, strictPort: true },
});
