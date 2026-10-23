\set ON_ERROR_STOP 1
update public.products set available=false where name='Suco natural 500 ml';
update public.delivery_zones set active=false where name='Bairro Demo Sul';
create schema if not exists tst;
create or replace function tst.id(t text, n text) returns text language sql security definer as $$ select case t
  when 'p' then (select id::text from public.products where name=n)
  when 's' then (select id::text from public.pizza_sizes where name=n)
  when 'f' then (select id::text from public.pizza_flavors where name=n)
  when 'c' then (select id::text from public.crusts where name=n)
  when 'e' then (select id::text from public.extras where name=n)
  when 'z' then (select id::text from public.delivery_zones where name=n) end $$;
-- monta JSON trocando {p:Nome} etc. por IDs reais
create or replace function tst.j(s text) returns jsonb language plpgsql as $$
declare m text[]; begin
  for m in select regexp_matches(s, '\{([pscfez]):([^}]+)\}', 'g') loop
    s := replace(s, '{'||m[1]||':'||m[2]||'}', '"'||tst.id(m[1], m[2])||'"');
  end loop; return s::jsonb; end $$;
create or replace function tst.calc(items text, mode text, zone text default null) returns jsonb language sql as $$
  select public.calculate_order(tst.j(items), mode, (select id from public.delivery_zones where name=zone)) $$;
create or replace function tst.ok(label text, items text, mode text, zone text, field text, expected numeric) returns void language plpgsql as $$
declare r jsonb; begin
  r := tst.calc(items, mode, zone);
  if (r->>field)::numeric <> expected then raise exception 'FALHOU %: % = % (esperado %) %', label, field, r->>field, expected, r; end if;
  raise notice 'OK %: % = %', label, field, expected; end $$;
create or replace function tst.err(label text, items text, mode text, zone text default null) returns void language plpgsql as $$
begin
  begin perform tst.calc(items, mode, zone); exception when others then raise notice 'OK (recusado) %: %', label, sqlerrm; return; end;
  raise exception 'FALHOU: % deveria ser recusado', label; end $$;
grant usage on schema tst to anon; grant execute on all functions in schema tst to anon;

set role anon;
-- regra 'maior' (seed): Mussarela 50 + Frango 56 no Grande -> 56; borda Catupiry 10; Bacon 6 => 72 x2 = 144
select tst.ok('pizza 2 sabores regra maior + borda + adicional', $$[{"product_id":{p:Pizza salgada},"quantity":2,"size_id":{s:Grande},"flavor_ids":[{f:Mussarela},{f:Frango com catupiry}],"crust_id":{c:Catupiry},"extra_ids":[{e:Bacon}]}]$$, 'pickup', null, 'subtotal', 144);
select tst.ok('sabor em promoção (Calabresa Grande 50 -> 45)', $$[{"product_id":{p:Pizza salgada},"quantity":1,"size_id":{s:Grande},"flavor_ids":[{f:Calabresa}]}]$$, 'pickup', null, 'subtotal', 45);
select tst.ok('produto simples em promoção (Anéis 30 -> 26)', $$[{"product_id":{p:Anéis de cebola},"quantity":1}]$$, 'pickup', null, 'subtotal', 26);
select tst.ok('adicionais somados (Batata 32 + Bacon 6 + Cheddar 5) x2', $$[{"product_id":{p:Batata frita},"quantity":2,"extra_ids":[{e:Bacon},{e:Cheddar extra}]}]$$, 'pickup', null, 'subtotal', 86);
select tst.ok('promo por quantidade somando 2 linhas (11 esfihas: desconto 1,50 x 11)', $$[{"product_id":{p:Esfiha de carne},"quantity":6},{"product_id":{p:Esfiha de carne},"quantity":5}]$$, 'pickup', null, 'discount', 16.5);
select tst.ok('abaixo do mínimo de quantidade: sem desconto', $$[{"product_id":{p:Esfiha de carne},"quantity":9}]$$, 'pickup', null, 'discount', 0);
select tst.ok('taxa de entrega do bairro', $$[{"product_id":{p:Batata frita},"quantity":1}]$$, 'delivery', 'Bairro Demo Centro', 'delivery_fee', 5);
select tst.ok('total = subtotal - desconto + taxa', $$[{"product_id":{p:Esfiha de carne},"quantity":10},{"product_id":{p:Batata frita},"quantity":1}]$$, 'delivery', 'Bairro Demo Norte', 'total', 70+32-15+7);
select tst.ok('retirada sem taxa', $$[{"product_id":{p:Batata frita},"quantity":1}]$$, 'pickup', null, 'delivery_fee', 0);

select tst.err('3 sabores no Grande (limite 2)', $$[{"product_id":{p:Pizza salgada},"quantity":1,"size_id":{s:Grande},"flavor_ids":[{f:Mussarela},{f:Calabresa},{f:Margherita}]}]$$, 'pickup');
select tst.err('sabor não permitido no produto', $$[{"product_id":{p:Pizza salgada},"quantity":1,"size_id":{s:Grande},"flavor_ids":[{f:Chocolate}]}]$$, 'pickup');
select tst.err('sabor repetido', $$[{"product_id":{p:Pizza salgada},"quantity":1,"size_id":{s:Grande},"flavor_ids":[{f:Mussarela},{f:Mussarela}]}]$$, 'pickup');
select tst.err('tamanho não permitido no produto', $$[{"product_id":{p:Pizza doce},"quantity":1,"size_id":{s:Gigante},"flavor_ids":[{f:Chocolate}]}]$$, 'pickup');
select tst.err('pizza sem sabor', $$[{"product_id":{p:Pizza salgada},"quantity":1,"size_id":{s:Grande},"flavor_ids":[]}]$$, 'pickup');
select tst.err('pizza sem tamanho', $$[{"product_id":{p:Pizza salgada},"quantity":1,"flavor_ids":[{f:Mussarela}]}]$$, 'pickup');
select tst.err('quantidade zero', $$[{"product_id":{p:Batata frita},"quantity":0}]$$, 'pickup');
select tst.err('quantidade negativa', $$[{"product_id":{p:Batata frita},"quantity":-3}]$$, 'pickup');
select tst.err('quantidade fracionada', $$[{"product_id":{p:Batata frita},"quantity":1.5}]$$, 'pickup');
select tst.err('quantidade como texto', $$[{"product_id":{p:Batata frita},"quantity":"2"}]$$, 'pickup');
select tst.err('quantidade enorme', $$[{"product_id":{p:Batata frita},"quantity":100000}]$$, 'pickup');
select tst.err('adicional não liberado no produto', $$[{"product_id":{p:Batata frita},"quantity":1,"extra_ids":[{e:Azeitona}]}]$$, 'pickup');
select tst.err('adicional repetido', $$[{"product_id":{p:Batata frita},"quantity":1,"extra_ids":[{e:Bacon},{e:Bacon}]}]$$, 'pickup');
select tst.err('produto indisponível', $$[{"product_id":{p:Suco natural 500 ml},"quantity":3}]$$, 'pickup');
select tst.err('produto inexistente', $$[{"product_id":"00000000-0000-0000-0000-000000000000","quantity":1}]$$, 'pickup');
select tst.err('ID malformado', $$[{"product_id":"abc","quantity":1}]$$, 'pickup');
select tst.err('bairro desativado', $$[{"product_id":{p:Batata frita},"quantity":1}]$$, 'delivery', 'Bairro Demo Sul');
select tst.err('entrega sem bairro', $$[{"product_id":{p:Batata frita},"quantity":1}]$$, 'delivery');
select tst.err('modalidade inválida', $$[{"product_id":{p:Batata frita},"quantity":1}]$$, 'drone');
select tst.err('carrinho vazio', $$[]$$, 'pickup');
select tst.err('pedido abaixo do mínimo (R$ 20)', $$[{"product_id":{p:Esfiha de queijo},"quantity":2}]$$, 'pickup');
reset role;
select tst.ok('preço falso enviado pelo navegador é ignorado', $$[{"product_id":{p:Batata frita},"quantity":1,"unit_price":0.01,"price":0.01}]$$, 'pickup', null, 'subtotal', 32);

-- regra 'media' configurada pelo admin: (50 + 56) / 2 = 53
update public.store_settings set multi_flavor_rule='media';
set role anon;
select tst.ok('regra media', $$[{"product_id":{p:Pizza salgada},"quantity":1,"size_id":{s:Grande},"flavor_ids":[{f:Mussarela},{f:Frango com catupiry}]}]$$, 'pickup', null, 'subtotal', 53);
reset role;
update public.store_settings set multi_flavor_rule=null;
set role anon;
select tst.err('regra não configurada com 2 sabores', $$[{"product_id":{p:Pizza salgada},"quantity":1,"size_id":{s:Grande},"flavor_ids":[{f:Mussarela},{f:Calabresa}]}]$$, 'pickup');
select tst.ok('regra não configurada, 1 sabor funciona', $$[{"product_id":{p:Pizza salgada},"quantity":1,"size_id":{s:Grande},"flavor_ids":[{f:Mussarela}]}]$$, 'pickup', null, 'subtotal', 50);
reset role;
update public.store_settings set accepting_orders=false;
set role anon;
select tst.err('loja fechada para pedidos', $$[{"product_id":{p:Batata frita},"quantity":1}]$$, 'pickup');
