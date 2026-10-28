import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5178, proxy: { '/api': 'http://127.0.0.1:3088' } },
  build: { outDir: 'dist/web', emptyOutDir: true },
});
