import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

// Proxy só para desenvolvimento local: imita os caminhos do Supabase
// apontando para o PostgREST/servidor de auth locais (pasta dev/).
const localSupabase = {
  '/rest/v1': { target: 'http://localhost:54330', rewrite: (p) => p.replace(/^\/rest\/v1/, '') },
  '/auth/v1': { target: 'http://localhost:54331' },
  '/storage/v1': { target: 'http://localhost:54331' },
};

// og:url e og:image precisam de endereço completo (https://...): só entram quando
// VITE_SITE_URL está definido. Vale só para o cardápio, não para o /admin/.
function shareMeta(siteUrl) {
  return {
    name: 'share-meta',
    transformIndexHtml(html, ctx) {
      if (!siteUrl || !ctx.path.endsWith('/index.html') || ctx.path.includes('/admin/')) return html;
      const tags = [
        `<meta property="og:url" content="${siteUrl}/" />`,
        `<meta property="og:image" content="${siteUrl}/og-image.png" />`,
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
      ];
      return html.replace(/\s*<\/head>/, `\n    ${tags.join('\n    ')}\n  </head>`);
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  // Sem estas variáveis o build "funciona", mas o site publicado só mostra erro.
  if (command === 'build' && (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)) {
    throw new Error('Faltam VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY. Crie o arquivo .env.production.local (veja .env.example e o README, passo 6) antes de rodar npm run build.');
  }
  let siteUrl = (env.VITE_SITE_URL || '').trim().replace(/\/+$/, '');
  // O exemplo do .env.example (seudominio.com.br) não é um endereço de verdade
  if (siteUrl.includes('seudominio')) siteUrl = '';
  if (command === 'build' && !siteUrl) {
    console.warn('Aviso: VITE_SITE_URL não definido; o link compartilhado sairá sem imagem de prévia.');
  }
  return {
    base: './', // caminhos relativos: funciona na raiz ou numa subpasta da Hostinger
    plugins: [shareMeta(siteUrl)],
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
  };
});
