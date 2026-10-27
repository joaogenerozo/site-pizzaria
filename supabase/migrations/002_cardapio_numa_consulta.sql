-- =====================================================================
-- Atualização 002 — cardápio numa consulta só (site abre mais rápido)
-- =====================================================================
-- Rode este arquivo no SQL Editor do Supabase SOMENTE se você já tinha
-- rodado uma versão anterior do schema.sql. Num projeto novo, o
-- schema.sql atual já inclui tudo isto. Pode ser rodado mais de uma vez.
-- Sem esta atualização o site continua funcionando (busca as tabelas uma a uma).

-- O site pedia as 15 tabelas uma a uma; cada pedido vai e volta até o
-- servidor do Supabase. Aqui elas vêm juntas, com as mesmas colunas de um
-- "select *". security invoker: o RLS de cada tabela continua valendo
-- (visitante só recebe itens ativos).
create or replace function public.menu_data()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'store_settings',  (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.store_settings t),
    'opening_hours',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.opening_hours t),
    'payment_methods', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.payment_methods t),
    'delivery_zones',  (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.delivery_zones t),
    'categories',      (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.categories t),
    'products',        (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.products t),
    'pizza_sizes',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.pizza_sizes t),
    'pizza_flavors',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.pizza_flavors t),
    'flavor_prices',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.flavor_prices t),
    'product_sizes',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.product_sizes t),
    'product_flavors', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.product_flavors t),
    'crusts',          (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.crusts t),
    'crust_prices',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.crust_prices t),
    'extras',          (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.extras t),
    'product_extras',  (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.product_extras t)
  );
$$;

revoke execute on function public.menu_data() from public;
grant execute on function public.menu_data() to anon, authenticated;
