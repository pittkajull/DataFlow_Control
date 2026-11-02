import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy /api saat development supaya API key tetap hanya ada di backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
