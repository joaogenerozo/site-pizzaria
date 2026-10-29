// Gera supabase/seed_domingos.sql a partir de data/cardapio_domingos_pizzas.json.
// Uso: node scripts/gerar-seed-domingos.mjs
// Itens com "revisar" entram com price_review = true ("preço em confirmação").
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const menu = JSON.parse(readFileSync(new URL('data/cardapio_domingos_pizzas.json', root), 'utf8'));

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const money = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`Preço inválido: ${v}`);
  return v.toFixed(2);
};

const loja = menu.estabelecimento;
const sizes = menu.tamanhos;
const meio = menu.meio_a_meio;
if (!['maior', 'media'].includes(meio.regra_preco)) throw new Error(`Regra de meio a meio inválida: ${meio.regra_preco}`);
const out = [];
const w = (s = '') => out.push(s);

w('-- =====================================================================');
w(`-- CARDÁPIO REAL — ${loja.nome}`);
w(`-- Gerado por scripts/gerar-seed-domingos.mjs a partir de`);
w('-- data/cardapio_domingos_pizzas.json. Não edite à mão: altere o JSON e gere de novo,');
w('-- ou faça as mudanças pelo painel /admin depois de carregar.');
w('--');
w('-- ATENÇÃO: este arquivo APAGA o cardápio atual (categorias, produtos, sabores,');
w('-- tamanhos, bordas, adicionais, bairros e formas de pagamento) e carrega o novo.');
w('-- Rode no SQL Editor do Supabase depois do schema.sql.');
w('-- =====================================================================');
w('begin;');
w();
w('delete from public.product_extras; delete from public.product_flavors; delete from public.product_sizes;');
w('delete from public.products; delete from public.extras; delete from public.crust_prices; delete from public.crusts;');
w('delete from public.flavor_prices; delete from public.pizza_flavors; delete from public.pizza_sizes;');
w('delete from public.categories; delete from public.delivery_zones; delete from public.payment_methods;');
w('delete from public.opening_hours;');
w();
w('insert into public.store_settings (id, name, tagline, about, whatsapp_number, phone_display, address_line,');
w('  min_order_value, multi_flavor_rule, is_demo)');
w(`values (1, ${q(loja.nome)}, ${q(loja.slogan)},`);
w(`  ${q(`Desde ${loja.desde}. ${loja.observacao} Telefones: ${loja.telefones.join(', ')}.`)},`);
w(`  ${q(loja.whatsapp_principal)}, ${q(loja.telefone_exibido)}, ${q(loja.endereco)},`);
w(`  0, ${q(meio.regra_preco)}, false)`);
w('on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, about = excluded.about,');
w('  whatsapp_number = excluded.whatsapp_number, phone_display = excluded.phone_display,');
w('  address_line = excluded.address_line, min_order_value = excluded.min_order_value,');
w('  multi_flavor_rule = excluded.multi_flavor_rule, is_demo = excluded.is_demo;');
w();
w(`-- Horário: ${loja.horarios.dias}, ${loja.horarios.abre} às ${loja.horarios.fecha}; ${loja.horarios.fechado} fechado`);
w('insert into public.opening_hours (weekday, opens_at, closes_at)');
w(`select d, ${q(loja.horarios.abre)}, ${q(loja.horarios.fecha)} from generate_series(0, 6) d where d <> 2; -- 2 = terça`);
w();
w('insert into public.payment_methods (name, asks_change, sort_order) values');
w(menu.formas_pagamento.map((f, i) => `  (${q(f.nome)}, ${f.troco ? 'true' : 'false'}, ${i + 1})`).join(',\n') + ';');
w();
w('-- Pendente de confirmação (não consta no cardápio impresso)');
w(`insert into public.delivery_zones (name, fee, sort_order) values ('Entrega (taxa a combinar)', null, 1);`);
w();
w('insert into public.pizza_sizes (name, slices, max_flavors, sort_order) values');
w(sizes.map((s, i) => `  (${q(s.sigla)}, ${s.pedacos}, ${meio.max_sabores}, ${i + 1})`).join(',\n') + ';');
w();
w('insert into public.categories (name, sort_order) values');
w([`  (${q(meio.categoria)}, 0)`, ...menu.categorias.map((c, i) => `  (${q(c.nome)}, ${i + 1})`)].join(',\n') + ';');
w();

const pizzas = menu.categorias.flatMap((c) => c.pizzas.map((p) => ({ ...p, categoria: c.nome })));
const names = new Set();
for (const p of pizzas) {
  if (names.has(p.nome)) throw new Error(`Sabor repetido: ${p.nome}`);
  names.add(p.nome);
  for (const s of sizes) money(p.precos[s.sigla]);
}

w('insert into public.pizza_flavors (name, description, price_review, sort_order) values');
w(pizzas.map((p, i) => `  (${q(p.nome)}, ${q(p.ingredientes)}, ${p.revisar ? 'true' : 'false'}, ${i + 1})`).join(',\n') + ';');
w();
w('insert into public.flavor_prices (flavor_id, size_id, price)');
w('select f.id, s.id, v.price from (values');
w(pizzas.flatMap((p) => sizes.map((s) => `  (${q(p.nome)}, ${q(s.sigla)}, ${money(p.precos[s.sigla])})`)).join(',\n'));
w(') as v(flavor, size, price)');
w('join public.pizza_flavors f on f.name = v.flavor');
w('join public.pizza_sizes s on s.name = v.size;');
w();
w('-- Um produto por sabor, na categoria do cardápio impresso');
w('insert into public.products (category_id, kind, name, description, sort_order)');
w('select c.id, \'pizza\', v.name, v.description, v.ord from (values');
w(menu.categorias.flatMap((c) => c.pizzas.map((p, i) => `  (${q(c.nome)}, ${q(p.nome)}, ${q(p.ingredientes)}, ${i + 1})`)).join(',\n'));
w(') as v(cat, name, description, ord)');
w('join public.categories c on c.name = v.cat;');
w();
w(`-- ${meio.produto}: todos os sabores, cobrada ${meio.regra_preco === 'maior' ? 'pelo sabor mais caro' : 'pela média dos sabores'}`);
w('insert into public.products (category_id, kind, name, description, sort_order)');
w(`select c.id, 'pizza', ${q(meio.produto)}, ${q(meio.descricao)}, 1 from public.categories c where c.name = ${q(meio.categoria)};`);
w();
w('insert into public.product_sizes (product_id, size_id)');
w("select p.id, s.id from public.products p cross join public.pizza_sizes s where p.kind = 'pizza';");
w('insert into public.product_flavors (product_id, flavor_id)');
w("select p.id, f.id from public.products p join public.pizza_flavors f on f.name = p.name where p.kind = 'pizza';");
w('insert into public.product_flavors (product_id, flavor_id)');
w(`select p.id, f.id from public.products p cross join public.pizza_flavors f where p.name = ${q(meio.produto)};`);
w();
w('-- Bordas: o cardápio mostra um preço só; usado igual em P, M e G');
w('insert into public.crusts (name, sort_order) values');
w(menu.bordas.map((b, i) => `  (${q(b.nome)}, ${i + 1})`).join(',\n') + ';');
w('insert into public.crust_prices (crust_id, size_id, price)');
w('select c.id, s.id, v.price from (values');
w(menu.bordas.map((b) => `  (${q(b.nome)}, ${money(b.preco)})`).join(',\n'));
w(') as v(crust, price)');
w('join public.crusts c on c.name = v.crust cross join public.pizza_sizes s;');
w();
w('insert into public.extras (name, price, sort_order) values');
w(menu.adicionais.map((a, i) => `  (${q(a.nome)}, ${money(a.preco)}, ${i + 1})`).join(',\n') + ';');
w('insert into public.product_extras (product_id, extra_id)');
w("select p.id, e.id from public.products p cross join public.extras e where p.kind = 'pizza';");
w();
const promo = menu.promocoes_semanais;
if (promo) {
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  if (!sizes.some((s) => s.sigla === promo.tamanho)) throw new Error(`Tamanho da promoção inexistente: ${promo.tamanho}`);
  const rows = promo.dias.flatMap((d) => {
    const weekday = DIAS.indexOf(d.dia);
    if (weekday < 0) throw new Error(`Dia da promoção inválido: ${d.dia}`);
    return d.sabores.map((nome, i) => {
      if (!names.has(nome)) throw new Error(`Sabor da promoção não existe no cardápio: ${nome}`);
      return `  (${weekday}, ${q(nome)}, ${money(promo.preco)}, ${i + 1})`;
    });
  });
  w(`-- Promoções da semana: ${promo.tamanho} por R$ ${money(promo.preco).replace('.', ',')} (0 = domingo)`);
  w('insert into public.weekly_promotions (weekday, flavor_id, size_id, price, sort_order)');
  w('select v.weekday, f.id, s.id, v.price, v.ord from (values');
  w(rows.join(',\n'));
  w(') as v(weekday, flavor, price, ord)');
  w('join public.pizza_flavors f on f.name = v.flavor');
  w(`join public.pizza_sizes s on s.name = ${q(promo.tamanho)};`);
  w();
}

w('commit;');
w();
w('-- Conferência rápida (deve mostrar 52 sabores e 4 com preço em confirmação):');
w('-- select count(*), count(*) filter (where price_review) from public.pizza_flavors;');

writeFileSync(new URL('supabase/seed_domingos.sql', root), out.join('\n') + '\n');
const review = pizzas.filter((p) => p.revisar).map((p) => p.nome);
console.log(`${pizzas.length} sabores em ${menu.categorias.length} categorias; em confirmação: ${review.join(', ')}`);
