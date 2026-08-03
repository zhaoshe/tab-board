import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { fileURLToPath, URL } from 'node:url';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [react(), crx({ manifest: manifest as any })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    modulePreload: {
      resolveDependencies(filename, deps, context) {
        const isWorkerFileStorageImport = context.hostType === 'js'
          && context.hostId.includes('activeAdapter-')
          && /(?:fileStorage|fsDirectory)-/.test(filename);
        return isWorkerFileStorageImport ? [] : deps;
      },
    },
    rollupOptions: {
      input: {
        manager: 'manager.html',
        popup: 'popup.html',
        options: 'options.html',
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['tests/**/*.mjs', 'node_modules/**', 'dist/**'],
    setupFiles: ['src/test/setup.ts'],
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
});
