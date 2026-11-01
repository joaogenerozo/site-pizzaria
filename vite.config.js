import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Proxy só para desenvolvimento local: imita os caminhos do Supabase
// apontando para o PostgREST/servidor de auth locais (pasta dev/).
const localSupabase = {
  '/rest/v1': { target: 'http://localhost:54330', rewrite: (p) => p.replace(/^\/rest\/v1/, '') },
  '/auth/v1': { target: 'http://localhost:54331' },
  '/storage/v1': { target: 'http://localhost:54331' },
};

// Endereço canônico, og:url e og:image precisam de endereço completo (https://...): só entram
// quando VITE_SITE_URL está definido. Vale só para o cardápio, não para o /admin/.
// O preconnect abre a conexão com o Supabase enquanto o JavaScript ainda baixa.
function headTags(siteUrl, supabaseUrl, gscCode) {
  return {
    name: 'head-tags',
    transformIndexHtml(html, ctx) {
      if (!ctx.path.endsWith('/index.html') || ctx.path.includes('/admin/')) return;
      const tags = [];
      const origin = URL.canParse(supabaseUrl) ? new URL(supabaseUrl).origin : null;
      if (origin) tags.push({ tag: 'link', attrs: { rel: 'preconnect', href: origin, crossorigin: true }, injectTo: 'head-prepend' });
      // Search Console: código de verificação da propriedade (só o conteúdo do content="...")
      if (gscCode) tags.push({ tag: 'meta', attrs: { name: 'google-site-verification', content: gscCode }, injectTo: 'head' });
      if (siteUrl) {
        const meta = (attrs) => tags.push({ tag: 'meta', attrs, injectTo: 'head' });
        tags.push({ tag: 'link', attrs: { rel: 'canonical', href: `${siteUrl}/` }, injectTo: 'head' });
        meta({ property: 'og:url', content: `${siteUrl}/` });
        meta({ property: 'og:image', content: `${siteUrl}/og-image.png` });
        meta({ property: 'og:image:width', content: '1200' });
        meta({ property: 'og:image:height', content: '630' });
        meta({ name: 'twitter:image', content: `${siteUrl}/og-image.png` });
      }
      return tags;
    },
  };
}

// robots.txt e sitemap.xml gerados no build: o sitemap e a linha "Sitemap:" precisam do
// endereço completo do site. O painel /admin/ fica fora dos buscadores.
function seoFiles(siteUrl) {
  return {
    name: 'seo-files',
    apply: 'build',
    generateBundle() {
      const base = siteUrl ? new URL(`${siteUrl}/`).pathname : '/';
      const robots = ['User-agent: *', 'Allow: /', `Disallow: ${base}admin/`];
      if (siteUrl) robots.push('', `Sitemap: ${siteUrl}/sitemap.xml`);
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `${robots.join('\n')}\n` });
      if (!siteUrl) return;
      const today = new Date().toISOString().slice(0, 10);
      const sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url>',
        `    <loc>${siteUrl}/</loc>`,
        `    <lastmod>${today}</lastmod>`,
        '    <changefreq>weekly</changefreq>',
        '    <priority>1.0</priority>',
        '  </url>',
        '</urlset>',
        '',
      ].join('\n');
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
    },
  };
}

// Google Analytics 4: a política de segurança (CSP) do .htaccess só libera os endereços do
// Google quando o ID do GA4 está definido. Sem GA4 a política continua exatamente como era.
const GA_SCRIPT = 'https://www.googletagmanager.com';
const GA_CONNECT = 'https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com';
function analyticsCsp(gaId) {
  let outDir;
  return {
    name: 'analytics-csp',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir.startsWith('/') ? config.build.outDir : resolve(config.root, config.build.outDir); },
    closeBundle() {
      if (!gaId) return;
      const file = resolve(outDir, '.htaccess');
      if (!existsSync(file)) return;
      const before = readFileSync(file, 'utf8');
      const after = before.replace(/(Content-Security-Policy "[^"]*)/, (csp) => csp
        .replace("script-src 'self'", `script-src 'self' ${GA_SCRIPT}`)
        .replace(/connect-src ([^;]*)/, `connect-src $1 ${GA_CONNECT}`));
      if (after === before) throw new Error('Não achei a Content-Security-Policy no .htaccess para liberar o Google Analytics.');
      writeFileSync(file, after);
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
    console.warn('Aviso: VITE_SITE_URL não definido; o link compartilhado sairá sem imagem de prévia e o build não terá sitemap.xml nem endereço canônico.');
  }
  const gaId = (env.VITE_GA4_ID || '').trim();
  if (gaId && !/^G-[A-Z0-9]{4,15}$/.test(gaId)) throw new Error(`VITE_GA4_ID inválido: "${gaId}". Use o ID de medição do GA4, no formato G-XXXXXXXXXX.`);
  const gscCode = (env.VITE_GSC_VERIFICATION || '').trim();
  if (gscCode && !/^[A-Za-z0-9_-]{10,100}$/.test(gscCode)) throw new Error('VITE_GSC_VERIFICATION inválido: copie só o código que fica dentro de content="..." na meta tag do Search Console.');
  return {
    base: './', // caminhos relativos: funciona na raiz ou numa subpasta da Hostinger
    plugins: [headTags(siteUrl, env.VITE_SUPABASE_URL, gscCode), seoFiles(siteUrl), analyticsCsp(gaId)],
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
