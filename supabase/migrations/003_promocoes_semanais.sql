-- =====================================================================
-- Atualização 003 — promoções da semana (ex.: segunda, Portuguesa G por R$ 50,00)
-- =====================================================================
-- Rode este arquivo no SQL Editor do Supabase SOMENTE se você já tinha
-- rodado uma versão anterior do schema.sql. Num projeto novo, o
-- schema.sql atual já inclui tudo isto. Pode ser rodado mais de uma vez.
--
-- O preço da promoção vale só no dia certo, no fuso da loja, e é aplicado
-- pelo próprio banco em calculate_order (o site só mostra).

create table if not exists public.weekly_promotions (
  id         uuid primary key default gen_random_uuid(),
  weekday    smallint not null check (weekday between 0 and 6), -- 0 = domingo
  flavor_id  uuid not null references public.pizza_flavors (id) on delete cascade,
  size_id    uuid not null references public.pizza_sizes (id) on delete cascade,
  price      numeric(10,2) not null check (price >= 0),
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (weekday, flavor_id, size_id)
);

drop trigger if exists weekly_promotions_updated_at on public.weekly_promotions;
create trigger weekly_promotions_updated_at before update on public.weekly_promotions
  for each row execute function public.set_updated_at();

revoke all on public.weekly_promotions from anon, authenticated;
grant select on public.weekly_promotions to anon, authenticated;
grant insert, update, delete on public.weekly_promotions to authenticated;

alter table public.weekly_promotions enable row level security;
drop policy if exists public_read on public.weekly_promotions;
drop policy if exists admin_insert on public.weekly_promotions;
drop policy if exists admin_update on public.weekly_promotions;
drop policy if exists admin_delete on public.weekly_promotions;
create policy public_read on public.weekly_promotions for select to anon, authenticated using (active or (select public.is_admin()));
create policy admin_insert on public.weekly_promotions for insert to authenticated with check ((select public.is_admin()));
create policy admin_update on public.weekly_promotions for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy admin_delete on public.weekly_promotions for delete to authenticated using ((select public.is_admin()));

-- Cálculo do pedido com a promoção do dia
create or replace function public.calculate_order(
  p_items   jsonb,
  p_mode    text,
  p_zone_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  s          public.store_settings;
  z          public.delivery_zones;
  item       jsonb;
  idx        integer := 0;
  p          public.products;
  qty        integer;
  sz         public.pizza_sizes;
  n_flavors  integer;
  n_found    integer;
  n_extras   integer;
  base       numeric(10,2);
  crust_val  numeric(10,2);
  extras_val numeric(10,2);
  unit       numeric(10,2);
  lines      jsonb := '[]'::jsonb;
  subtotal   numeric(10,2) := 0;
  discount   numeric(10,2) := 0;
  fee        numeric(10,2) := 0;
  min_order  numeric(10,2);
  qp         record;
  today      smallint;
  n_review   integer;
  n_weekly   integer;
  is_weekly  boolean;
begin
  select * into s from public.store_settings where id = 1;
  if not found then raise exception 'Loja não configurada'; end if;
  -- dia da semana no fuso da loja (0 = domingo), para a promoção semanal
  today := extract(dow from now() at time zone s.timezone);
  if not s.accepting_orders then raise exception 'A loja não está aceitando pedidos no momento'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Carrinho vazio';
  end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'Itens demais no pedido'; end if;

  if p_mode = 'delivery' then
    if not s.delivery_enabled then raise exception 'Entrega indisponível'; end if;
    select * into z from public.delivery_zones where id = p_zone_id and active;
    if not found then raise exception 'Bairro de entrega inválido'; end if;
    fee := coalesce(z.fee, 0); -- vazio = taxa a combinar (fora do total)
  elsif p_mode = 'pickup' then
    if not s.pickup_enabled then raise exception 'Retirada indisponível'; end if;
  else
    raise exception 'Modalidade inválida';
  end if;

  for item in select value from jsonb_array_elements(p_items) loop
    idx := idx + 1;

    if jsonb_typeof(item->'quantity') <> 'number'
       or (item->>'quantity') !~ '^[0-9]+$' then
      raise exception 'Item %: quantidade inválida', idx;
    end if;
    qty := (item->>'quantity')::integer;
    if qty < 1 or qty > 99 then raise exception 'Item %: quantidade inválida', idx; end if;

    select * into p from public.products
      where id = (item->>'product_id')::uuid and available;
    if not found then raise exception 'Item %: produto indisponível', idx; end if;
    if p.kind = 'simple' and p.price_review then
      raise exception 'Item %: o preço de % ainda está em confirmação', idx, p.name;
    end if;
    if not exists (select 1 from public.categories c where c.id = p.category_id and c.active) then
      raise exception 'Item %: produto indisponível', idx;
    end if;

    -- adicionais: devem estar ativos e liberados para o produto
    if jsonb_typeof(coalesce(item->'extra_ids', '[]'::jsonb)) <> 'array' then
      raise exception 'Item %: adicionais inválidos', idx;
    end if;
    n_extras := jsonb_array_length(coalesce(item->'extra_ids', '[]'::jsonb));
    select coalesce(sum(e.price), 0), count(*) into extras_val, n_found
      from public.extras e
      join public.product_extras pe on pe.extra_id = e.id and pe.product_id = p.id
      where e.active
        and e.id in (select (x)::uuid from jsonb_array_elements_text(coalesce(item->'extra_ids', '[]'::jsonb)) x);
    -- todos os IDs enviados precisam existir, estar liberados e não se repetir
    if n_found <> n_extras then
      raise exception 'Item %: adicional inválido ou repetido', idx;
    end if;
    if exists (select 1 from public.extras e
               where e.price_review
                 and e.id in (select (x)::uuid from jsonb_array_elements_text(coalesce(item->'extra_ids', '[]'::jsonb)) x)) then
      raise exception 'Item %: preço de adicional em confirmação', idx;
    end if;

    crust_val := 0;
    is_weekly := false;

    if p.kind = 'simple' then
      base := coalesce(p.promo_price, p.price);

    else -- pizza
      select ps.* into sz from public.pizza_sizes ps
        join public.product_sizes x on x.size_id = ps.id and x.product_id = p.id
        where ps.id = (item->>'size_id')::uuid and ps.active;
      if not found then raise exception 'Item %: tamanho inválido', idx; end if;

      if jsonb_typeof(coalesce(item->'flavor_ids', '[]'::jsonb)) <> 'array' then
        raise exception 'Item %: sabores inválidos', idx;
      end if;
      n_flavors := jsonb_array_length(coalesce(item->'flavor_ids', '[]'::jsonb));
      if n_flavors < 1 then raise exception 'Item %: escolha ao menos um sabor', idx; end if;
      if n_flavors > sz.max_flavors then
        raise exception 'Item %: máximo de % sabor(es) no tamanho %', idx, sz.max_flavors, sz.name;
      end if;
      if n_flavors > 1 and s.multi_flavor_rule is null then
        raise exception 'Item %: regra de preço para vários sabores não configurada', idx;
      end if;

      with chosen as (
        select distinct (x)::uuid as fid
        from jsonb_array_elements_text(item->'flavor_ids') x
      ), priced as (
        -- promoção semanal de hoje: vale o menor entre ela e o preço do sabor
        select least(coalesce(fp.promo_price, fp.price), coalesce(wp.price, fp.price)) as v,
               f.price_review,
               wp.price is not null and wp.price < coalesce(fp.promo_price, fp.price) as weekly
        from chosen c
        join public.pizza_flavors f on f.id = c.fid and f.active
        join public.product_flavors pf on pf.flavor_id = f.id and pf.product_id = p.id
        join public.flavor_prices fp on fp.flavor_id = f.id and fp.size_id = sz.id
        left join public.weekly_promotions wp
          on wp.flavor_id = f.id and wp.size_id = sz.id and wp.weekday = today and wp.active
      )
      select case when s.multi_flavor_rule = 'media' then round(avg(v), 2) else max(v) end,
             count(*),
             -- sabor em confirmação só pode ser pedido no dia e tamanho da promoção (preço definido)
             count(*) filter (where price_review and not weekly),
             count(*) filter (where weekly)
        into base, n_found, n_review, n_weekly
        from priced;
      if n_found <> n_flavors then
        raise exception 'Item %: sabor inválido, repetido ou sem preço no tamanho %', idx, sz.name;
      end if;
      if n_review > 0 then
        raise exception 'Item %: preço de sabor em confirmação', idx;
      end if;
      is_weekly := n_weekly = n_found;

      if item ? 'crust_id' and jsonb_typeof(item->'crust_id') <> 'null' then
        select cp.price into crust_val
          from public.crusts c
          join public.crust_prices cp on cp.crust_id = c.id and cp.size_id = sz.id
          where c.id = (item->>'crust_id')::uuid and c.active and not c.price_review;
        if not found then raise exception 'Item %: borda inválida ou com preço em confirmação', idx; end if;
      end if;
    end if;

    unit := base + crust_val + extras_val;
    if unit < 0 then raise exception 'Item %: valor inválido', idx; end if;

    lines := lines || jsonb_build_object(
      'index', idx, 'product_id', p.id, 'quantity', qty,
      'unit_price', unit, 'line_total', unit * qty, 'weekly_promo', is_weekly);
    subtotal := subtotal + unit * qty;
  end loop;

  -- Promoção por quantidade (somando todas as linhas do mesmo produto simples)
  for qp in
    select pr.id, pr.price, coalesce(pr.promo_price, pr.price) as unit_now,
           pr.qty_promo_min, pr.qty_promo_price, sum((l->>'quantity')::integer) as total_qty
    from jsonb_array_elements(lines) l
    join public.products pr on pr.id = (l->>'product_id')::uuid
    where pr.kind = 'simple' and pr.qty_promo_min is not null
    group by pr.id
  loop
    if qp.total_qty >= qp.qty_promo_min and qp.qty_promo_price < qp.unit_now then
      discount := discount + (qp.unit_now - qp.qty_promo_price) * qp.total_qty;
    end if;
  end loop;

  min_order := coalesce(z.min_order_value, s.min_order_value);
  if subtotal - discount < min_order then
    raise exception 'Pedido mínimo de R$ %', replace(to_char(min_order, 'FM999999990.00'), '.', ',');
  end if;

  return jsonb_build_object(
    'items', lines,
    'subtotal', subtotal,
    'discount', discount,
    'delivery_fee', fee,
    'delivery_fee_pending', p_mode = 'delivery' and z.fee is null,
    'total', subtotal - discount + fee,
    'is_demo', s.is_demo
  );
end;
$$;

revoke execute on function public.calculate_order(jsonb, text, uuid) from public;
grant execute on function public.calculate_order(jsonb, text, uuid) to anon, authenticated;

-- Cardápio numa consulta só, agora com as promoções e o dia de hoje
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
    'product_extras',  (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.product_extras t),
    'weekly_promotions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.weekly_promotions t),
    -- dia da semana no fuso da loja, pelo relógio do servidor (o do celular pode estar errado)
    'today', (select extract(dow from now() at time zone t.timezone)::int from public.store_settings t where t.id = 1)
  );
$$;

revoke execute on function public.menu_data() from public;
grant execute on function public.menu_data() to anon, authenticated;

-- Promoções da Domingo's Pizzas (só entra o que ainda não existe)
-- Promoções da semana: G por R$ 50,00 (0 = domingo)
insert into public.weekly_promotions (weekday, flavor_id, size_id, price, sort_order)
select v.weekday, f.id, s.id, v.price, v.ord from (values
  (1, 'Portuguesa', 50.00, 1),
  (1, 'Bacon', 50.00, 2),
  (1, '4 Queijos', 50.00, 3),
  (3, 'Mussarela', 50.00, 1),
  (3, 'Bauru', 50.00, 2),
  (3, 'Siciliana', 50.00, 3),
  (4, 'Strogonoff de Boi', 50.00, 1),
  (4, 'Strogonoff de Frango', 50.00, 2),
  (4, 'Frango com Catupiry', 50.00, 3),
  (5, 'Brócolis Especial', 50.00, 1),
  (5, 'Calabresa da Casa', 50.00, 2),
  (6, 'Portuguesa', 50.00, 1),
  (6, 'Milho', 50.00, 2),
  (6, 'Lombo Requeijão', 50.00, 3),
  (0, 'Mussarela', 50.00, 1),
  (0, 'Bacon e Palmito', 50.00, 2),
  (0, 'Banana Nevada', 50.00, 3)
) as v(weekday, flavor, price, ord)
join public.pizza_flavors f on f.name = v.flavor
join public.pizza_sizes s on s.name = 'G'
on conflict (weekday, flavor_id, size_id) do nothing;

