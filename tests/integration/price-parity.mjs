// Confere se o preço mostrado no navegador (pricing.js) é igual ao calculado
// pelo banco (calculate_order) para TODAS as combinações de pizza do cardápio.
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... node tests/integration/price-parity.mjs
import { createClient } from '@supabase/supabase-js';
import { buildCatalog, crustsForSize, toOrderItems } from '../../src/lib/catalog.js';
import { priceItem } from '../../src/lib/pricing.js';
import { toCents } from '../../src/lib/money.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const tables = ['store_settings', 'opening_hours', 'payment_methods', 'delivery_zones', 'categories', 'products', 'pizza_sizes', 'pizza_flavors', 'flavor_prices', 'product_sizes', 'product_flavors', 'crusts', 'crust_prices', 'extras', 'product_extras'];
const rows = await Promise.all(tables.map(async (t) => { const { data, error } = await sb.from(t).select('*'); if (error) throw error; return data; }));
const [s, hours, payments, zones, categories, products, sizes, flavors, flavorPrices, productSizes, productFlavors, crusts, crustPrices, extras, productExtras] = rows;
const catalog = buildCatalog({ settings: s[0], hours, payments, zones, categories, products, sizes, flavors, flavorPrices, productSizes, productFlavors, crusts, crustPrices, extras, productExtras });

const combos = [];
for (const p of catalog.products.values()) {
  const extraSets = [[], p.extras.map((e) => e.id)];
  if (p.kind === 'simple') { for (const extraIds of extraSets) combos.push({ productId: p.id, quantity: 3, extraIds }); continue; }
  for (const size of p.sizes) {
    const fl = p.flavors.filter((f) => catalog.flavorPrice(f.id, size.id));
    const flavorSets = fl.map((f) => [f.id]);
    if (size.max_flavors >= 2) for (let i = 0; i < fl.length; i++) for (let j = i + 1; j < fl.length; j++) flavorSets.push([fl[i].id, fl[j].id]);
    const crustOpts = [null, ...crustsForSize(catalog, size.id).map((c) => c.id)];
    for (const flavorIds of flavorSets) for (const crustId of crustOpts) for (const extraIds of extraSets) {
      combos.push({ productId: p.id, quantity: 2, sizeId: size.id, flavorIds, crustId, extraIds });
    }
  }
}

let ok = 0, fail = 0;
for (const c of combos) {
  const local = priceItem(catalog, c);
  const { data, error } = await sb.rpc('calculate_order', { p_items: toOrderItems([c]), p_mode: 'pickup', p_zone_id: null });
  const server = error ? null : toCents(data.items[0].line_total);
  if (local.ok && server === local.lineCents) ok++;
  else if (!local.ok && error) ok++; // ambos recusam
  else { fail++; console.log('DIVERGÊNCIA', JSON.stringify(c), local, error?.message ?? server); }
}
console.log(`${ok} combinações iguais, ${fail} divergentes (regra: ${catalog.settings.multi_flavor_rule})`);
process.exit(fail ? 1 : 0);
