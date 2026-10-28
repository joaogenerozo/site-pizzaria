import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

const TABLES = [
  'store_settings', 'opening_hours', 'payment_methods', 'delivery_zones', 'categories', 'products',
  'pizza_sizes', 'pizza_flavors', 'flavor_prices', 'product_sizes', 'product_flavors', 'crusts',
  'crust_prices', 'extras', 'product_extras',
];
const fakeTables = () => Object.fromEntries(TABLES.map((t) => [t, t === 'store_settings' ? [{ id: 1, name: 'Loja' }] : [{ id: `${t}-1` }]]));
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

let loadMenuData;
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://projeto.supabase.co/');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon');
  ({ loadMenuData } = await import('../../src/lib/api.js'));
});
afterEach(() => vi.unstubAllGlobals());

describe('carregar o cardápio', () => {
  it('busca tudo num pedido só (menu_data)', async () => {
    const fetch = vi.fn(async () => json(200, fakeTables()));
    vi.stubGlobal('fetch', fetch);
    const d = await loadMenuData();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://projeto.supabase.co/rest/v1/rpc/menu_data');
    expect(fetch.mock.calls[0][1].headers).toMatchObject({ apikey: 'chave-anon' });
    expect(d.settings).toEqual({ id: 1, name: 'Loja' });
    expect(d.flavorPrices).toEqual([{ id: 'flavor_prices-1' }]);
    expect(d.productExtras).toEqual([{ id: 'product_extras-1' }]);
  });

  it('sem a função no banco, busca as 15 tabelas como antes', async () => {
    const tables = fakeTables();
    const fetch = vi.fn(async (url) => {
      if (url.endsWith('/rpc/menu_data')) return json(404, { code: 'PGRST202', message: 'Could not find the function' });
      return json(200, tables[new URL(url).pathname.split('/').pop()]);
    });
    vi.stubGlobal('fetch', fetch);
    const d = await loadMenuData();
    expect(fetch).toHaveBeenCalledTimes(17);
    expect(d.settings.name).toBe('Loja');
    expect(d.crustPrices).toEqual([{ id: 'crust_prices-1' }]);
  });

  it('resposta incompleta da função também cai no caminho antigo', async () => {
    const tables = fakeTables();
    const fetch = vi.fn(async (url) => (url.endsWith('/rpc/menu_data')
      ? json(200, { products: [] })
      : json(200, tables[new URL(url).pathname.split('/').pop()])));
    vi.stubGlobal('fetch', fetch);
    await expect(loadMenuData()).resolves.toMatchObject({ settings: { name: 'Loja' } });
    expect(fetch).toHaveBeenCalledTimes(17);
  });

  it('sem internet, mostra o erro de carregamento', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(loadMenuData()).rejects.toThrow('Falha ao carregar');
  });
});
