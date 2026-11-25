import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { PORTS, resolvePort } from './scripts/ports.ts';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    host: PORTS.host,
    port: resolvePort('SYSTEMLAB_DEV_PORT', PORTS.devPort),
    strictPort: true,
  },
  preview: {
    host: PORTS.host,
    port: resolvePort('SYSTEMLAB_PREVIEW_PORT', PORTS.previewPort),
    strictPort: true,
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@xyflow/') || id.includes('node_modules/@dagrejs/')) {
            return 'vendor-xyflow';
          }
          if (id.includes('node_modules/recharts/')) {
            return 'vendor-charts';
          }
          if (
            id.includes('node_modules/dexie/') ||
            id.includes('node_modules/zod/') ||
            id.includes('node_modules/zustand/')
          ) {
            return 'vendor-storage';
          }
          return undefined;
        },
      },
    },
  },
});
