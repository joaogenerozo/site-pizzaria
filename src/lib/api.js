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

// Carrega todas as tabelas públicas do cardápio em paralelo.
export async function loadMenuData() {
  if (configError) throw new Error(configError);
  const [
    settingsRows, hours, payments, zones, categories, products, sizes, flavors,
    flavorPrices, productSizes, productFlavors, crusts, crustPrices, extras, productExtras,
  ] = await Promise.all([
    select('store_settings'), select('opening_hours'), select('payment_methods'),
    select('delivery_zones'), select('categories'), select('products'),
    select('pizza_sizes'), select('pizza_flavors'), select('flavor_prices'),
    select('product_sizes'), select('product_flavors'), select('crusts'),
    select('crust_prices'), select('extras'), select('product_extras'),
  ]);
  const settings = settingsRows[0];
  if (!settings) throw new Error('A loja ainda não foi configurada no painel.');
  return {
    settings, hours, payments, zones, categories, products, sizes, flavors,
    flavorPrices, productSizes, productFlavors, crusts, crustPrices, extras, productExtras,
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
