\set ON_ERROR_STOP 1
-- Atualização 006: endereço amigável dos produtos e biblioteca de imagens
insert into auth.users values ('11111111-1111-1111-1111-111111111111','admin@teste'),('22222222-2222-2222-2222-222222222222','cliente@teste');
insert into public.admins (user_id) values ('11111111-1111-1111-1111-111111111111');

create schema if not exists tst;
create or replace function tst.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'OK (bloqueado) %: %', label, sqlerrm; return; end;
  raise exception 'FALHOU: % deveria ter sido bloqueado', label;
end $$;
create or replace function tst.expect_eq(got text, want text, label text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FALHOU: % esperado %, veio %', label, want, got; end if;
  raise notice 'OK %: %', label, got;
end $$;
grant usage on schema tst to anon, authenticated; grant execute on all functions in schema tst to anon, authenticated;

-- Os produtos do cardápio real já ganham endereço amigável, sem repetir
select tst.expect_eq((select count(*)::text from public.products where slug is null), '0', 'todo produto tem slug');
select tst.expect_eq((select (count(*) = count(distinct slug))::text from public.products), 'true', 'slugs não se repetem');
select tst.expect_eq((select slug from public.products where name = 'Frango com Catupiry'), 'pizza-frango-com-catupiry', 'pizza ganha "pizza-" na frente');
select tst.expect_eq((select slug from public.categories where name = 'Pizzas doces'), 'pizzas-doces', 'categoria ganha slug');
select tst.expect_eq((select group_type from public.categories where name = 'Pizzas doces'), 'pizzas_doces', 'tipo da categoria doce');
select tst.expect_eq((select group_type from public.categories where name = 'Pizzas de frango'), 'pizzas_salgadas', 'tipo da categoria salgada');

----------------------------------------------------------------- VISITANTE
set role anon;
select tst.expect_fail('select * from public.media_images', 'anon lê a biblioteca de imagens');
select tst.expect_fail($q$insert into public.media_images (path, url, mime) values ('x.webp', 'https://x/x.webp', 'image/webp')$q$, 'anon grava na biblioteca');
select tst.expect_fail($q$update public.products set image_alt = 'hack'$q$, 'anon altera texto alternativo');
select tst.expect_eq((select count(*)::text from jsonb_array_elements(public.menu_data()->'products') p where p ? 'image_alt' and p ? 'slug'), (select count(*)::text from public.products), 'menu_data traz slug e texto alternativo');
reset role;

----------------------------------------------------------------- USUÁRIO COMUM
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
select tst.expect_eq((select count(*)::text from public.media_images), '0', 'usuário comum não vê a biblioteca');
select tst.expect_fail($q$insert into public.media_images (path, url, mime) values ('x.webp', 'https://x/x.webp', 'image/webp')$q$, 'usuário comum grava na biblioteca');
reset role;

----------------------------------------------------------------- ADMIN
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
insert into public.media_images (path, url, thumb_path, thumb_url, mime, width, height, bytes, original_name, alt, group_type)
  values ('produtos/pizza-calabresa-a1b2c3.webp', 'https://x/a.webp', 'produtos/pizza-calabresa-a1b2c3-mini.webp', 'https://x/a-mini.webp',
          'image/webp', 1200, 1200, 120000, 'calabresa.jpg', 'Pizza de calabresa fatiada', 'pizzas_salgadas');
select tst.expect_eq((select created_by::text from public.media_images), '11111111-1111-1111-1111-111111111111', 'admin grava na biblioteca e fica registrado quem enviou');
select tst.expect_fail($q$insert into public.media_images (path, url, mime) values ('y.exe', 'https://x/y.exe', 'application/x-msdownload')$q$, 'biblioteca recusa tipo que não é imagem');
select tst.expect_fail($q$insert into public.media_images (path, url, mime) values ('produtos/pizza-calabresa-a1b2c3.webp', 'https://x/b.webp', 'image/webp')$q$, 'biblioteca recusa caminho repetido');
update public.products set image_url = 'https://x/a.webp', image_thumb_url = 'https://x/a-mini.webp', image_alt = 'Pizza de calabresa fatiada' where name = 'Calabresa';
select tst.expect_eq((select image_alt from public.products where name = 'Calabresa'), 'Pizza de calabresa fatiada', 'admin grava foto, miniatura e texto alternativo');
select tst.expect_fail($q$update public.products set image_thumb_url = 'javascript:alert(1)' where name = 'Calabresa'$q$, 'miniatura precisa ser https');
select tst.expect_fail($q$update public.products set slug = 'Com Espaço' where name = 'Calabresa'$q$, 'slug com formato inválido');
select tst.expect_fail($q$update public.products set slug = 'pizza-bauru' where name = 'Calabresa'$q$, 'slug repetido');
-- produto novo com nome repetido ganha -2
insert into public.categories (name) values ('Bebidas');
select tst.expect_eq((select slug || ' ' || group_type from public.categories where name = 'Bebidas'), 'bebidas bebidas', 'categoria nova ganha slug e tipo pelo nome');
insert into public.products (category_id, kind, name, price) select id, 'simple', 'Coca-Cola 2L', 12 from public.categories where name = 'Bebidas';
insert into public.products (category_id, kind, name, price) select id, 'simple', 'Coca-Cola 2L', 12 from public.categories where name = 'Bebidas';
select tst.expect_eq((select string_agg(slug, ',' order by slug) from public.products where name = 'Coca-Cola 2L'), 'coca-cola-2l,coca-cola-2l-2', 'nome repetido ganha -2');
-- mudar o nome não muda o endereço (links já compartilhados continuam valendo)
update public.products set name = 'Calabresa Tradicional' where name = 'Calabresa';
select tst.expect_eq((select slug from public.products where name = 'Calabresa Tradicional'), 'pizza-calabresa', 'renomear mantém o slug');
reset role;
