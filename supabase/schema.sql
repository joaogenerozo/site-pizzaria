-- =====================================================================
-- CARDÁPIO DIGITAL — ESQUEMA DO BANCO (Supabase / PostgreSQL)
-- =====================================================================
-- Execute este arquivo inteiro no SQL Editor do Supabase, uma única vez,
-- num projeto novo. Ele cria tabelas, gatilhos, funções, permissões
-- (GRANT) e políticas de Row Level Security (RLS).
--
-- Modelo de segurança:
--   * Visitantes (papel "anon") só LEEM o que está ativo/disponível.
--   * Usuários logados que NÃO estão na tabela public.admins têm o mesmo
--     acesso que visitantes.
--   * Somente usuários listados em public.admins podem gravar.
--   * A tabela public.admins NÃO tem nenhuma política de escrita: nenhum
--     usuário consegue se promover pelo navegador. Administradores são
--     cadastrados apenas pelo SQL Editor (veja docs).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Administradores
-- ---------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- security definer: consulta admins sem depender das políticas da tabela.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- Configurações da loja (linha única, id = 1)
-- ---------------------------------------------------------------------
create table public.store_settings (
  id                     smallint primary key default 1 check (id = 1),
  name                   text not null check (char_length(name) between 1 and 120),
  tagline                text check (char_length(tagline) <= 200),
  about                  text check (char_length(about) <= 2000),
  logo_url               text check (logo_url is null or logo_url ~ '^https://'),
  cover_url              text check (cover_url is null or cover_url ~ '^https://'),
  -- Formato internacional só com dígitos: 55 + DDD + número (ex.: 5535999999999)
  whatsapp_number        text check (whatsapp_number is null or whatsapp_number ~ '^[1-9][0-9]{9,14}$'),
  phone_display          text check (char_length(phone_display) <= 40),
  instagram_url          text check (instagram_url is null or instagram_url ~ '^https://'),
  address_line           text check (char_length(address_line) <= 300),
  maps_url               text check (maps_url is null or maps_url ~ '^https://'),
  timezone               text not null default 'America/Sao_Paulo',
  accepting_orders       boolean not null default true,
  delivery_enabled       boolean not null default true,
  pickup_enabled         boolean not null default true,
  delivery_time_min      integer check (delivery_time_min >= 0),
  delivery_time_max      integer check (delivery_time_max >= delivery_time_min),
  pickup_time_min        integer check (pickup_time_min >= 0),
  pickup_time_max        integer check (pickup_time_max >= pickup_time_min),
  min_order_value        numeric(10,2) not null default 0 check (min_order_value >= 0),
  -- Regra de preço para pizza com mais de um sabor (ver docs/ARQUITETURA.md):
  --   'maior' = preço do sabor mais caro no tamanho escolhido
  --   'media' = média dos preços dos sabores no tamanho escolhido
  --   null    = não definida -> pizzas com 2+ sabores são recusadas no cálculo
  multi_flavor_rule      text check (multi_flavor_rule in ('maior', 'media')),
  is_demo                boolean not null default false,
  updated_at             timestamptz not null default now()
);

create table public.opening_hours (
  id         uuid primary key default gen_random_uuid(),
  weekday    smallint not null check (weekday between 0 and 6), -- 0 = domingo
  opens_at   time not null,
  closes_at  time not null, -- se menor que opens_at, fecha no dia seguinte
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_methods (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 60),
  asks_change  boolean not null default false, -- pergunta "troco para"
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.delivery_zones (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 100), -- bairro/região
  fee             numeric(10,2) not null check (fee >= 0),
  min_order_value numeric(10,2) check (min_order_value >= 0), -- sobrepõe o mínimo geral
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- kind = 'simple': preço fixo (bebida, porção, esfiha, combo, doce...)
-- kind = 'pizza' : preço vem de tamanho + sabores (+ borda + adicionais)
create table public.products (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid not null references public.categories (id) on delete restrict,
  kind            text not null check (kind in ('simple', 'pizza')),
  name            text not null check (char_length(name) between 1 and 120),
  description     text check (char_length(description) <= 1000),
  image_url       text check (image_url is null or image_url ~ '^https://'),
  price           numeric(10,2) check (price >= 0),
  promo_price     numeric(10,2) check (promo_price >= 0),
  -- Promoção por quantidade: a partir de qty_promo_min unidades, cada uma sai por qty_promo_price
  qty_promo_min   integer check (qty_promo_min >= 2),
  qty_promo_price numeric(10,2) check (qty_promo_price >= 0),
  badge           text check (char_length(badge) <= 30), -- ex.: "Promoção", "Novo"
  available       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint products_simple_has_price check (kind <> 'simple' or price is not null),
  constraint products_pizza_no_price  check (kind <> 'pizza' or (price is null and promo_price is null and qty_promo_min is null)),
  constraint products_promo_lower     check (promo_price is null or promo_price < price),
  constraint products_qty_promo_pair  check ((qty_promo_min is null) = (qty_promo_price is null))
);

create table public.pizza_sizes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40), -- Broto, Grande...
  slices      integer check (slices > 0),
  max_flavors integer not null default 1 check (max_flavors between 1 and 4),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.pizza_flavors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  image_url   text check (image_url is null or image_url ~ '^https://'),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Preço de cada sabor em cada tamanho
create table public.flavor_prices (
  flavor_id   uuid not null references public.pizza_flavors (id) on delete cascade,
  size_id     uuid not null references public.pizza_sizes (id) on delete cascade,
  price       numeric(10,2) not null check (price >= 0),
  promo_price numeric(10,2) check (promo_price >= 0 and promo_price < price),
  updated_at  timestamptz not null default now(),
  primary key (flavor_id, size_id)
);

-- Tamanhos e sabores permitidos em cada produto do tipo pizza
create table public.product_sizes (
  product_id uuid not null references public.products (id) on delete cascade,
  size_id    uuid not null references public.pizza_sizes (id) on delete cascade,
  primary key (product_id, size_id)
);

create table public.product_flavors (
  product_id uuid not null references public.products (id) on delete cascade,
  flavor_id  uuid not null references public.pizza_flavors (id) on delete cascade,
  primary key (product_id, flavor_id)
);

create table public.crusts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.crust_prices (
  crust_id   uuid not null references public.crusts (id) on delete cascade,
  size_id    uuid not null references public.pizza_sizes (id) on delete cascade,
  price      numeric(10,2) not null check (price >= 0),
  updated_at timestamptz not null default now(),
  primary key (crust_id, size_id)
);

create table public.extras (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  price       numeric(10,2) not null check (price >= 0),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.product_extras (
  product_id uuid not null references public.products (id) on delete cascade,
  extra_id   uuid not null references public.extras (id) on delete cascade,
  primary key (product_id, extra_id)
);

create index on public.products (category_id, sort_order);
create index on public.flavor_prices (size_id);
create index on public.crust_prices (size_id);

-- ---------------------------------------------------------------------
-- Gatilhos de updated_at
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'store_settings','opening_hours','payment_methods','delivery_zones',
    'categories','products','pizza_sizes','pizza_flavors','flavor_prices',
    'crusts','crust_prices','extras'
  ] loop
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.set_updated_at()',
      t || '_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Permissões (GRANT) — privilégio mínimo
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on
  public.store_settings, public.opening_hours, public.payment_methods,
  public.delivery_zones, public.categories, public.products,
  public.pizza_sizes, public.pizza_flavors, public.flavor_prices,
  public.product_sizes, public.product_flavors, public.crusts,
  public.crust_prices, public.extras, public.product_extras
to anon, authenticated;

-- Escrita só para logados; o RLS abaixo restringe a administradores.
grant insert, update, delete on
  public.opening_hours, public.payment_methods,
  public.delivery_zones, public.categories, public.products,
  public.pizza_sizes, public.pizza_flavors, public.flavor_prices,
  public.product_sizes, public.product_flavors, public.crusts,
  public.crust_prices, public.extras, public.product_extras
to authenticated;
grant update on public.store_settings to authenticated; -- sem insert/delete: linha única

grant select on public.admins to authenticated; -- só a própria linha (RLS)

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.admins          enable row level security;
alter table public.store_settings  enable row level security;
alter table public.opening_hours   enable row level security;
alter table public.payment_methods enable row level security;
alter table public.delivery_zones  enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.pizza_sizes     enable row level security;
alter table public.pizza_flavors   enable row level security;
alter table public.flavor_prices   enable row level security;
alter table public.product_sizes   enable row level security;
alter table public.product_flavors enable row level security;
alter table public.crusts          enable row level security;
alter table public.crust_prices    enable row level security;
alter table public.extras          enable row level security;
alter table public.product_extras  enable row level security;

-- admins: cada usuário vê apenas se ele mesmo é admin. Nenhuma política de escrita.
create policy admins_select_self on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Leitura pública: tudo o que é sempre público
create policy public_read on public.store_settings  for select to anon, authenticated using (true);
create policy public_read on public.opening_hours   for select to anon, authenticated using (true);
create policy public_read on public.flavor_prices   for select to anon, authenticated using (true);
create policy public_read on public.crust_prices    for select to anon, authenticated using (true);
create policy public_read on public.product_sizes   for select to anon, authenticated using (true);
create policy public_read on public.product_flavors for select to anon, authenticated using (true);
create policy public_read on public.product_extras  for select to anon, authenticated using (true);

-- Leitura pública só do que está ativo/disponível; admin vê tudo
create policy public_read on public.payment_methods for select to anon, authenticated using (active or (select public.is_admin()));
create policy public_read on public.delivery_zones  for select to anon, authenticated using (active or (select public.is_admin()));
create policy public_read on public.categories      for select to anon, authenticated using (active or (select public.is_admin()));
create policy public_read on public.products        for select to anon, authenticated using (available or (select public.is_admin()));
create policy public_read on public.pizza_sizes     for select to anon, authenticated using (active or (select public.is_admin()));
create policy public_read on public.pizza_flavors   for select to anon, authenticated using (active or (select public.is_admin()));
create policy public_read on public.crusts          for select to anon, authenticated using (active or (select public.is_admin()));
create policy public_read on public.extras          for select to anon, authenticated using (active or (select public.is_admin()));

-- Escrita: somente administradores
create policy admin_update on public.store_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

do $$
declare t text;
begin
  foreach t in array array[
    'opening_hours','payment_methods','delivery_zones','categories','products',
    'pizza_sizes','pizza_flavors','flavor_prices','product_sizes','product_flavors',
    'crusts','crust_prices','extras','product_extras'
  ] loop
    execute format('create policy admin_insert on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy admin_update on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Cálculo do pedido no banco (fonte confiável de preços)
-- ---------------------------------------------------------------------
-- O site envia apenas IDs e quantidades; o preço é recalculado aqui a
-- partir das tabelas. O carrinho salvo no navegador NUNCA define preço.
--
-- p_items: [
--   {"product_id": uuid, "quantity": int, "extra_ids": [uuid]}                        -- simples
--   {"product_id": uuid, "quantity": int, "size_id": uuid, "flavor_ids": [uuid],
--    "crust_id": uuid|null, "extra_ids": [uuid]}                                        -- pizza
-- ]
-- p_mode: 'delivery' | 'pickup'; p_zone_id obrigatório em 'delivery'.
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
    fee := z.fee;
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

      if item ? 'crust_id' and jsonb_typeof(item->'crust_id') <> 'null' then
        select cp.price into crust_val
          from public.crusts c
          join public.crust_prices cp on cp.crust_id = c.id and cp.size_id = sz.id
          where c.id = (item->>'crust_id')::uuid and c.active;
        if not found then raise exception 'Item %: borda inválida', idx; end if;
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
    'total', subtotal - discount + fee,
    'is_demo', s.is_demo
  );
end;
$$;

revoke execute on function public.calculate_order(jsonb, text, uuid) from public;
grant execute on function public.calculate_order(jsonb, text, uuid) to anon, authenticated;
