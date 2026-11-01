import { supabaseUrl, supabaseAnonKey, configError } from './config.js';

// O cardápio público só lê tabelas e chama calculate_order, então fala direto
// com a API REST do Supabase (PostgREST) por fetch. Sem a biblioteca
// @supabase/supabase-js o JavaScript da página fica ~60 KB (gzip) menor, o que
// adianta a montagem do cardápio no celular. Sempre como visitante (anon).
async function rest(path, init = {}) {
  const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // Mensagem do banco (ex.: RAISE do calculate_order); sem ela, a tela mostra o aviso genérico
    const err = new Error(body?.message || '');
    err.status = res.status;
    throw err;
  }
  return body;
}

async function select(table, columns = '*') {
  try {
    return await rest(`${table}?select=${encodeURIComponent(columns)}`);
  } catch (err) {
    throw new Error(`Falha ao carregar ${table}: ${err.message || `HTTP ${err.status}`}`);
  }
}

const MENU_TABLES = [
  'store_settings', 'opening_hours', 'payment_methods', 'delivery_zones', 'categories', 'products',
  'pizza_sizes', 'pizza_flavors', 'flavor_prices', 'product_sizes', 'product_flavors', 'crusts',
  'crust_prices', 'extras', 'product_extras',
];

// Cardápio inteiro num pedido só (public.menu_data): cada ida e volta até o
// Supabase custa caro no celular. Se a função ainda não existir no banco
// (atualização 002 não rodada), busca as tabelas uma a uma, em paralelo.
async function fetchMenuTables() {
  try {
    const data = await rest('rpc/menu_data');
    if (MENU_TABLES.every((t) => Array.isArray(data?.[t]))) return data;
  } catch { /* cai no caminho antigo abaixo */ }
  const rows = await Promise.all(MENU_TABLES.map((t) => select(t)));
  // Promoções da semana são opcionais: sem a atualização 003 no banco, o cardápio abre sem elas
  const weekly = await select('weekly_promotions').catch(() => []);
  return { ...Object.fromEntries(MENU_TABLES.map((t, i) => [t, rows[i]])), weekly_promotions: weekly };
}

// Carrega todas as tabelas públicas do cardápio.
export async function loadMenuData() {
  if (configError) throw new Error(configError);
  const d = await fetchMenuTables();
  const settings = d.store_settings[0];
  if (!settings) throw new Error('A loja ainda não foi configurada no painel.');
  return {
    settings, hours: d.opening_hours, payments: d.payment_methods, zones: d.delivery_zones,
    categories: d.categories, products: d.products, sizes: d.pizza_sizes, flavors: d.pizza_flavors,
    flavorPrices: d.flavor_prices, productSizes: d.product_sizes, productFlavors: d.product_flavors,
    crusts: d.crusts, crustPrices: d.crust_prices, extras: d.extras, productExtras: d.product_extras,
    weeklyPromos: Array.isArray(d.weekly_promotions) ? d.weekly_promotions : [],
    // Dia da semana pelo relógio do servidor (o mesmo que calculate_order usa)
    today: Number.isInteger(d.today) ? d.today : null,
  };
}

// Recalcula o pedido no banco (fonte confiável). items: formato de public.calculate_order
export async function calculateOrder(items, mode, zoneId = null) {
  if (configError) throw new Error(configError);
  return rest('rpc/calculate_order', {
    method: 'POST',
    body: JSON.stringify({ p_items: items, p_mode: mode, p_zone_id: zoneId }),
  });
}
