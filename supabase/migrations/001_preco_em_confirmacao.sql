-- =====================================================================
-- Atualização 001 — "preço em confirmação" e taxa de entrega a combinar
-- =====================================================================
-- Rode este arquivo no SQL Editor do Supabase SOMENTE se você já tinha
-- rodado uma versão anterior do schema.sql. Num projeto novo, o
-- schema.sql atual já inclui tudo isto. Pode ser rodado mais de uma vez.

alter table public.products      add column if not exists price_review boolean not null default false;
alter table public.pizza_flavors add column if not exists price_review boolean not null default false;
alter table public.crusts        add column if not exists price_review boolean not null default false;
alter table public.extras        add column if not exists price_review boolean not null default false;

-- Taxa vazia = taxa de entrega a combinar com a pizzaria
alter table public.delivery_zones alter column fee drop not null;

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
begin
  select * into s from public.store_settings where id = 1;
  if not found then raise exception 'Loja não configurada'; end if;
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
        select coalesce(fp.promo_price, fp.price) as v
        from chosen c
        join public.pizza_flavors f on f.id = c.fid and f.active
        join public.product_flavors pf on pf.flavor_id = f.id and pf.product_id = p.id
        join public.flavor_prices fp on fp.flavor_id = f.id and fp.size_id = sz.id
      )
      select case when s.multi_flavor_rule = 'media' then round(avg(v), 2) else max(v) end,
             count(*)
        into base, n_found
        from priced;
      if n_found <> n_flavors then
        raise exception 'Item %: sabor inválido, repetido ou sem preço no tamanho %', idx, sz.name;
      end if;
      if exists (select 1 from public.pizza_flavors f
                 where f.price_review
                   and f.id in (select (x)::uuid from jsonb_array_elements_text(item->'flavor_ids') x)) then
        raise exception 'Item %: preço de sabor em confirmação', idx;
      end if;

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
      'unit_price', unit, 'line_total', unit * qty);
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
