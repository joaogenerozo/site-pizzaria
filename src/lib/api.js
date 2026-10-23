import { supabase, configError } from './supabase.js';

async function select(table, columns = '*') {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) throw new Error(`Falha ao carregar ${table}: ${error.message}`);
  return data;
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
  const { data, error } = await supabase.rpc('calculate_order', {
    p_items: items, p_mode: mode, p_zone_id: zoneId,
  });
  if (error) throw new Error(error.message);
  return data;
}
