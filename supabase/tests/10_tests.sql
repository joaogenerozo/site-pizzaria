\set ON_ERROR_STOP 1
-- Usuários de teste
insert into auth.users values ('11111111-1111-1111-1111-111111111111','admin@teste'),('22222222-2222-2222-2222-222222222222','cliente@teste');
insert into public.admins (user_id) values ('11111111-1111-1111-1111-111111111111');
-- produto e zona desativados para testar visibilidade
update public.products set available=false where name='Suco natural 500 ml';
update public.delivery_zones set active=false where name='Bairro Demo Sul';

create schema if not exists tst;
create or replace function tst.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'OK (bloqueado) %: %', label, sqlerrm; return; end;
  raise exception 'FALHOU: % deveria ter sido bloqueado', label;
end $$;
create or replace function tst.expect_rows(sql text, n int, label text) returns void language plpgsql as $$
declare got int; begin
  execute 'select count(*) from (' || sql || ') x' into got;
  if got <> n then raise exception 'FALHOU: % esperado % linhas, veio %', label, n, got; end if;
  raise notice 'OK %: % linha(s)', label, got;
end $$;
create or replace function tst.expect_affected(sql text, n int, label text) returns void language plpgsql as $$
declare got int; begin
  execute sql; get diagnostics got = row_count;
  if got <> n then raise exception 'FALHOU: % esperado % afetadas, veio %', label, n, got; end if;
  raise notice 'OK %: % afetada(s)', label, got;
end $$;
grant usage on schema tst to anon, authenticated; grant execute on all functions in schema tst to anon, authenticated;

----------------------------------------------------------------- VISITANTE
set role anon;
select tst.expect_rows('select * from public.products', 9, 'anon vê só produtos disponíveis');
select tst.expect_rows('select * from public.delivery_zones', 2, 'anon vê só bairros ativos');
select tst.expect_fail('select * from public.admins', 'anon lê admins');
select tst.expect_fail($q$insert into public.categories(name) values ('hack')$q$, 'anon insere categoria');
select tst.expect_fail($q$update public.products set price=0.01$q$, 'anon altera preço');
select tst.expect_fail($q$delete from public.products$q$, 'anon exclui produtos');
select tst.expect_fail($q$update public.store_settings set whatsapp_number='5500000000000'$q$, 'anon altera WhatsApp');
select tst.expect_fail($q$insert into public.admins values ('22222222-2222-2222-2222-222222222222')$q$, 'anon vira admin');
select tst.expect_fail($q$insert into storage.objects(bucket_id,name) values ('menu-images','x.png')$q$, 'anon envia imagem');
reset role;

----------------------------------------------------------------- CLIENTE LOGADO (não admin)
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select tst.expect_rows('select * from public.products', 9, 'logado comum vê só disponíveis');
select tst.expect_rows('select * from public.admins', 0, 'logado comum não vê admins');
select tst.expect_fail($q$insert into public.admins values ('22222222-2222-2222-2222-222222222222')$q$, 'logado comum se promove a admin');
select tst.expect_fail($q$insert into public.categories(name) values ('hack')$q$, 'logado comum insere categoria');
select tst.expect_affected($q$update public.products set price=0.01 where kind='simple'$q$, 0, 'logado comum altera preço (RLS filtra)');
select tst.expect_affected($q$delete from public.products$q$, 0, 'logado comum exclui produtos (RLS filtra)');
select tst.expect_affected($q$update public.store_settings set whatsapp_number='5500000000000'$q$, 0, 'logado comum altera WhatsApp');
select tst.expect_fail($q$insert into storage.objects(bucket_id,name) values ('menu-images','x.png')$q$, 'logado comum envia imagem');
reset role;

----------------------------------------------------------------- ADMIN
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select tst.expect_rows('select * from public.products', 10, 'admin vê também indisponíveis');
select tst.expect_rows('select * from public.admins', 1, 'admin vê a própria linha');
select tst.expect_affected($q$update public.products set price=33.00 where name='Batata frita'$q$, 1, 'admin altera preço');
select tst.expect_affected($q$insert into public.categories(name) values ('Nova')$q$, 1, 'admin cria categoria');
select tst.expect_affected($q$update public.store_settings set whatsapp_number='5535900000000'$q$, 1, 'admin altera WhatsApp');
select tst.expect_fail($q$update public.store_settings set whatsapp_number='(35) 9999-9999'$q$, 'WhatsApp com formatação inválida');
select tst.expect_fail($q$update public.products set price=-1 where name='Batata frita'$q$, 'preço negativo');
select tst.expect_fail($q$update public.products set promo_price=99 where name='Batata frita'$q$, 'promoção maior que preço');
select tst.expect_fail($q$insert into public.admins values ('22222222-2222-2222-2222-222222222222')$q$, 'admin promove outro pelo navegador');
select tst.expect_fail($q$delete from public.admins$q$, 'admin apaga admins pelo navegador');
select tst.expect_affected($q$insert into storage.objects(bucket_id,name) values ('menu-images','x.png')$q$, 1, 'admin envia imagem');
update public.store_settings set whatsapp_number = null;
reset role;
