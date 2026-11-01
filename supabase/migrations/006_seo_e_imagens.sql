-- =====================================================================
-- Atualização 006 — SEO dos produtos e biblioteca de imagens
-- =====================================================================
-- Rode este arquivo no SQL Editor do Supabase SOMENTE se você já tinha
-- rodado uma versão anterior do schema.sql. Num projeto novo, o
-- schema.sql atual já inclui tudo isto. Pode ser rodado mais de uma vez.
--
-- Só ACRESCENTA: colunas novas (todas opcionais), uma tabela nova só para
-- administradores e AVIF na lista de formatos do bucket. Nenhum dado é
-- apagado, nenhuma política existente muda e o RLS continua ligado.
-- Os únicos UPDATEs preenchem campos novos que ainda estão vazios
-- (endereço amigável e tipo da categoria), sempre com "where ... is null".

-- ---------------------------------------------------------------------
-- Endereço amigável (slug): "Frango com Catupiry" -> "pizza-frango-com-catupiry"
-- ---------------------------------------------------------------------
create or replace function public.slugify(txt text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    translate(lower(coalesce(txt, '')),
      'áàâãäåéèêëíìîïóòôõöúùûüçñý', 'aaaaaaeeeeiiiiooooouuuucny'),
    '[^a-z0-9]+', '-', 'g'));
$$;

-- Tipo da categoria: organiza a Biblioteca de Imagens e o painel
alter table public.categories
  add column if not exists slug text,
  add column if not exists group_type text not null default 'outros';

do $$ begin
  alter table public.categories add constraint categories_slug_format check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.categories add constraint categories_group_type check (group_type in ('pizzas_salgadas', 'pizzas_doces', 'bebidas', 'combos', 'adicionais', 'outros'));
exception when duplicate_object then null; end $$;

alter table public.products
  add column if not exists slug            text,
  add column if not exists image_alt       text,
  add column if not exists image_thumb_url text,
  add column if not exists seo_keyword     text,
  add column if not exists ingredients     text;

do $$ begin
  alter table public.products add constraint products_slug_format check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.products add constraint products_image_alt_len check (char_length(image_alt) <= 200);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.products add constraint products_thumb_https check (image_thumb_url is null or image_thumb_url ~ '^https://');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.products add constraint products_seo_keyword_len check (char_length(seo_keyword) <= 80);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.products add constraint products_ingredients_len check (char_length(ingredients) <= 500);
exception when duplicate_object then null; end $$;

create unique index if not exists products_slug_key on public.products (slug);
create unique index if not exists categories_slug_key on public.categories (slug);

-- Slug sugerido para um produto novo, sem repetir um que já existe
create or replace function public.unique_slug(tbl text, base text, self uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  candidate text := nullif(base, '');
  n int := 1;
  taken boolean;
begin
  if candidate is null then return null; end if;
  loop
    execute format('select exists (select 1 from public.%I where slug = $1 and id is distinct from $2)', tbl)
      into taken using candidate, self;
    exit when not taken;
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

-- Tipo provável de uma categoria pelo nome (o admin pode trocar no painel)
create or replace function public.guess_group_type(category_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when public.slugify(category_name) ~ '^pizzas?-doces?' then 'pizzas_doces'
    when public.slugify(category_name) ~ '^(bebidas?|refrigerantes?|cervejas?|sucos?)' then 'bebidas'
    when public.slugify(category_name) ~ '^combos?' then 'combos'
    when public.slugify(category_name) ~ '^(adicionais|adicional|bordas?)' then 'adicionais'
    when public.slugify(category_name) ~ '^pizzas?' then 'pizzas_salgadas'
    else 'outros'
  end;
$$;

create or replace function public.fill_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
declare base text;
begin
  -- categoria nova sem tipo escolhido: tenta adivinhar pelo nome
  if tg_table_name = 'categories' and tg_op = 'INSERT' then
    if to_jsonb(new)->>'group_type' = 'outros' then
      new := jsonb_populate_record(new, jsonb_build_object('group_type', public.guess_group_type(new.name)));
    end if;
  end if;
  if new.slug is not null and new.slug <> '' then return new; end if;
  base := public.slugify(new.name);
  -- pizzas ganham "pizza-" na frente: /pizza-calabresa é o que o cliente procura
  if tg_table_name = 'products' then
    if to_jsonb(new)->>'kind' = 'pizza' and base !~ '^pizza' then base := 'pizza-' || base; end if;
  end if;
  new.slug := public.unique_slug(tg_table_name, base, new.id);
  return new;
end;
$$;

drop trigger if exists products_fill_slug on public.products;
create trigger products_fill_slug before insert or update on public.products
  for each row execute function public.fill_slug();
drop trigger if exists categories_fill_slug on public.categories;
create trigger categories_fill_slug before insert or update on public.categories
  for each row execute function public.fill_slug();

-- Preenche só quem ainda não tem slug (o gatilho gera o valor). Linha por
-- linha em ordem fixa, para nomes repetidos ganharem -2, -3 sempre igual.
do $$
declare r record;
begin
  for r in select id from public.categories where slug is null order by sort_order, name loop
    update public.categories set slug = null where id = r.id and slug is null;
  end loop;
  for r in select id from public.products where slug is null order by sort_order, name loop
    update public.products set slug = null where id = r.id and slug is null;
  end loop;
end $$;

-- Tipo das categorias que já existem, só onde ainda está no padrão "outros".
-- "Pizzas ..." só vira pizza salgada se a categoria tiver pizzas de verdade.
update public.categories c set group_type = public.guess_group_type(c.name)
  where c.group_type = 'outros' and public.guess_group_type(c.name) <> 'outros'
    and (public.guess_group_type(c.name) <> 'pizzas_salgadas'
         or exists (select 1 from public.products p where p.category_id = c.id and p.kind = 'pizza'));

-- ---------------------------------------------------------------------
-- Biblioteca de imagens (só administradores leem e gravam)
-- ---------------------------------------------------------------------
create table if not exists public.media_images (
  id            uuid primary key default gen_random_uuid(),
  path          text not null unique check (char_length(path) between 1 and 300),
  url           text not null check (url ~ '^https?://'),
  thumb_path    text check (char_length(thumb_path) <= 300),
  thumb_url     text check (thumb_url is null or thumb_url ~ '^https?://'),
  mime          text not null check (mime in ('image/webp', 'image/jpeg', 'image/png', 'image/avif')),
  width         integer check (width > 0),
  height        integer check (height > 0),
  bytes         integer check (bytes > 0),
  original_name text check (char_length(original_name) <= 200),
  alt           text check (char_length(alt) <= 200),
  group_type    text not null default 'outros'
                check (group_type in ('pizzas_salgadas', 'pizzas_doces', 'bebidas', 'combos', 'adicionais', 'outros')),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists media_images_updated_at on public.media_images;
create trigger media_images_updated_at before update on public.media_images
  for each row execute function public.set_updated_at();

revoke all on public.media_images from anon, authenticated;
grant select, insert, update, delete on public.media_images to authenticated;
alter table public.media_images enable row level security;

drop policy if exists media_admin_all on public.media_images;
create policy media_admin_all on public.media_images
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke execute on function public.slugify(text) from public;
grant execute on function public.slugify(text) to anon, authenticated;
revoke execute on function public.guess_group_type(text) from public;
grant execute on function public.guess_group_type(text) to anon, authenticated;
revoke execute on function public.unique_slug(text, text, uuid) from public, anon;
grant execute on function public.unique_slug(text, text, uuid) to authenticated; -- usada pelo gatilho quando o admin grava
revoke execute on function public.fill_slug() from public, anon;

-- ---------------------------------------------------------------------
-- Bucket de fotos: aceita AVIF também (o painel converte para WebP,
-- mas um navegador sem WebP pode mandar o original). Limite de 2 MB mantido.
-- ---------------------------------------------------------------------
update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  where id = 'menu-images' and not ('image/avif' = any (allowed_mime_types));
