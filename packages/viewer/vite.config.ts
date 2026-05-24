import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5179,
    proxy: {
      '/api': { target: 'http://127.0.0.1:7878', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/ws': { target: 'ws://127.0.0.1:7878', ws: true },
    },
  },
});
