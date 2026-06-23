import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => ({
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: ['.loca.lt', '.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        bypass(req) {
          const url = req.url || '';
          if (/\.(ts|tsx|js|jsx|css|map|json)$/.test(url)) {
            return url;
          }
          return undefined;
        },
      },
    },
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './setupTests.ts',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
}));
