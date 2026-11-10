/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the API runs on :4000; the dev server proxies /api so the browser sees one origin
// (same as production, where nginx does the proxying).
const API_TARGET = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  build: {
    // Single deployment: web builds into the API's public dir so the API
    // can serve both the static frontend and the API from one origin.
    outDir: '../api/dist/public',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: { '/api': API_TARGET, '/health': API_TARGET },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
