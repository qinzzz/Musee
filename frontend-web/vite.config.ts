import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { cloudflare } from "@cloudflare/vite-plugin";

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
          // Source modules live under /api/ too (e.g. /api/chat.ts). Don't proxy
          // them — match the extension before an optional ?query (Vite appends
          // ?t=, ?import, etc. for HMR), otherwise the $ anchor misses them.
          if (/\.(ts|tsx|js|jsx|css|map|json)(\?|$)/.test(url)) {
            return url;
          }
          return undefined;
        },
      },
    },
  },
  plugins: [react(), cloudflare()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './setupTests.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: [
        'dist/**',
        'node_modules/**',
        'coverage/**',
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'setupTests.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
}));