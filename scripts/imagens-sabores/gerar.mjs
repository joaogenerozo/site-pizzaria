// Gera as ilustrações dos sabores (imagens/sabores/*.webp) e o SQL que liga
// cada imagem ao seu produto (supabase/imagens_sabores.sql).
// Uso: node scripts/imagens-sabores/gerar.mjs [nome do sabor...]
// Precisa do Chromium do Playwright (npx playwright install chromium) ou de
// CHROMIUM_PATH apontando para outro Chromium.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { pizzaSvg, W, H } from './pizza-art.mjs';

const root = new URL('../../', import.meta.url);
const menu = JSON.parse(readFileSync(new URL('data/cardapio_domingos_pizzas.json', root), 'utf8'));
const BUCKET_URL = 'https://mztjtluxyajswrqitcnz.supabase.co/storage/v1/object/public/menu-images/sabores';
const OUT_W = 960, OUT_H = 720, QUALITY = 0.8;

export const slug = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const flavors = menu.categorias.flatMap((c) => c.pizzas.map((p) => ({ name: p.nome, description: p.ingredientes })));
const byName = new Map(flavors.map((fl) => [fl.name, fl]));
// Meio a meio: metade Calabresa da Casa, metade Frango com Catupiry
const images = [
  ...flavors.map((fl) => ({ product: fl.name, file: slug(fl.name), svg: () => pizzaSvg(fl) })),
  { product: menu.meio_a_meio.produto, file: 'meio-a-meio', svg: () => pizzaSvg(byName.get('Calabresa da Casa'), byName.get('Frango com Catupiry')) },
];

const only = process.argv.slice(2);
const outDir = new URL('imagens/sabores/', root);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const img of images) {
  if (only.length && !only.includes(img.product)) continue;
  // Desenha o SVG num canvas e exporta WEBP pelo próprio Chromium
  const dataUrl = await page.evaluate(async ({ svg, w, h, ow, oh, q }) => {
    const im = new Image(w, h);
    im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await im.decode();
    const canvas = document.createElement('canvas');
    canvas.width = ow; canvas.height = oh;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(im, 0, 0, ow, oh);
    return canvas.toDataURL('image/webp', q);
  }, { svg: img.svg(), w: W, h: H, ow: OUT_W, oh: OUT_H, q: QUALITY });
  writeFileSync(new URL(`${img.file}.webp`, outDir), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`${img.file}.webp`);
}
await browser.close();

// SQL para ligar as imagens (produto e sabor de mesmo nome)
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const rows = images.map((img) => `  (${q(img.product)}, ${q(`${BUCKET_URL}/${img.file}.webp`)})`).join(',\n');
writeFileSync(new URL('supabase/imagens_sabores.sql', root), `-- Ilustrações dos sabores (bucket menu-images, pasta sabores/).
-- Gerado por scripts/imagens-sabores/gerar.mjs. Rode no SQL Editor depois do
-- seed_domingos.sql. Só preenche quem está sem foto: fotos trocadas pelo painel ficam.
begin;

with img (name, url) as (values
${rows}
)
update public.products p set image_url = img.url
from img where p.name = img.name and p.image_url is null;

with img (name, url) as (values
${rows}
)
update public.pizza_flavors f set image_url = img.url
from img where f.name = img.name and f.image_url is null;

commit;
`);
