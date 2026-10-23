import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Proxy só para desenvolvimento local: imita os caminhos do Supabase
// apontando para o PostgREST/servidor de auth locais (pasta dev/).
const localSupabase = {
  '/rest/v1': { target: 'http://localhost:54330', rewrite: (p) => p.replace(/^\/rest\/v1/, '') },
  '/auth/v1': { target: 'http://localhost:54331' },
  '/storage/v1': { target: 'http://localhost:54331' },
};

export default defineConfig({
  base: './', // caminhos relativos: funciona na raiz ou numa subpasta da Hostinger
  server: { port: 5173, strictPort: true, proxy: localSupabase },
  preview: { port: 4173, strictPort: true, proxy: localSupabase },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
      },
    },
  },
  test: { include: ['tests/unit/**/*.test.js'] },
});
