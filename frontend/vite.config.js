import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
  server: {
    host: true,
    port: 5173,
    // `npm run dev` outside Docker talks to the API container.
    proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } },
  },
});
