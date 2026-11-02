import { build } from 'vite';
import { fileURLToPath } from 'node:url';

// Keep the worker self-contained: it cannot require the page's Vue/uni runtime.
await build({
  configFile: false, publicDir: false,
  build: {
    outDir: fileURLToPath(new URL('../dist/build/mp-weixin/workers', import.meta.url)), emptyOutDir: true,
    target: 'es2018', minify: 'esbuild',
    lib: { entry: fileURLToPath(new URL('../src/workers/scan.js', import.meta.url)), formats: ['iife'], name: 'scanWorker', fileName: () => 'scan.js' },
  },
});
