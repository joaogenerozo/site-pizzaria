\set ON_ERROR_STOP 1
-- Cardápio real (seed_domingos.sql): preços, "preço em confirmação" e taxa a combinar
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


create or replace function tst.flag(label text, items text, mode text, zone text, expected boolean) returns void language plpgsql as $$
declare r jsonb; begin
  r := tst.calc(items, mode, zone);
  if (r->>'delivery_fee_pending')::boolean is distinct from expected then raise exception 'FALHOU %: %', label, r; end if;
  raise notice 'OK %: delivery_fee_pending = %', label, expected; end $$;
grant execute on all functions in schema tst to anon;

do $$ begin
  if (select count(*) from public.pizza_flavors) <> 51 then raise exception 'FALHOU: esperado 51 sabores'; end if;
  if (select count(*) from public.flavor_prices) <> 153 then raise exception 'FALHOU: esperado 153 preços'; end if;
  if (select count(*) from public.categories) <> 12 then raise exception 'FALHOU: esperado 12 categorias'; end if;
  if (select string_agg(name, ',' order by sort_order) from public.payment_methods) <> 'Pix,Dinheiro,Cartão de crédito,Cartão de débito'
    then raise exception 'FALHOU: formas de pagamento erradas'; end if;
  if (select count(*) from public.product_flavors pf join public.products p on p.id = pf.product_id where p.name = 'Pizza 2 sabores (meio a meio)') <> 51
    then raise exception 'FALHOU: meio a meio deveria ter os 51 sabores'; end if;
  if (select string_agg(name, ',' order by name) from public.pizza_flavors where price_review) <> 'Frango Barbecue,Lombo,Milho Especial,Mussarela'
    then raise exception 'FALHOU: sabores em confirmação errados'; end if;
  raise notice 'OK carga: 51 sabores, 153 preços, 12 categorias, 4 em confirmação, 4 pagamentos, meio a meio com 51 sabores';
end $$;

set role anon;
do $$ begin
  if (select count(*) from public.products) <> 52 then raise exception 'FALHOU: visitante deveria ver 52 pizzas'; end if;
  raise notice 'OK visitante vê as 52 pizzas (51 sabores + meio a meio)';
end $$;
select tst.ok('Calabresa P = 37,00', $$[{"product_id":{p:Calabresa},"quantity":1,"size_id":{s:P},"flavor_ids":[{f:Calabresa}]}]$$, 'pickup', null, 'subtotal', 37);
select tst.ok('Frango com Catupiry P = 50,90', $$[{"product_id":{p:Frango com Catupiry},"quantity":1,"size_id":{s:P},"flavor_ids":[{f:Frango com Catupiry}]}]$$, 'pickup', null, 'subtotal', 50.90);
select tst.ok('Júlia G = 65,90', $$[{"product_id":{p:Júlia},"quantity":1,"size_id":{s:G},"flavor_ids":[{f:Júlia}]}]$$, 'pickup', null, 'subtotal', 65.90);
select tst.ok('Calabresa G + borda de cheddar 18 + bacon 10 = 83 (x2 = 166)', $$[{"product_id":{p:Calabresa},"quantity":2,"size_id":{s:G},"flavor_ids":[{f:Calabresa}],"crust_id":{c:Borda de cheddar},"extra_ids":[{e:Bacon}]}]$$, 'pickup', null, 'subtotal', 166);
select tst.ok('borda com o mesmo preço no P', $$[{"product_id":{p:Peru},"quantity":1,"size_id":{s:P},"flavor_ids":[{f:Peru}],"crust_id":{c:Borda mista}}]$$, 'pickup', null, 'subtotal', 60);
select tst.ok('entrega com taxa a combinar: taxa 0 no total', $$[{"product_id":{p:Atum},"quantity":1,"size_id":{s:M},"flavor_ids":[{f:Atum}]}]$$, 'delivery', 'Entrega (taxa a combinar)', 'total', 55);
select tst.flag('entrega com taxa a combinar fica marcada', $$[{"product_id":{p:Atum},"quantity":1,"size_id":{s:M},"flavor_ids":[{f:Atum}]}]$$, 'delivery', 'Entrega (taxa a combinar)', true);
select tst.flag('retirada não tem taxa pendente', $$[{"product_id":{p:Atum},"quantity":1,"size_id":{s:M},"flavor_ids":[{f:Atum}]}]$$, 'pickup', null, false);
select tst.ok('meio a meio G Calabresa 55 + Strogonoff de Boi 70 = 70 (mais caro)', $$[{"product_id":{p:Pizza 2 sabores (meio a meio)},"quantity":1,"size_id":{s:G},"flavor_ids":[{f:Calabresa},{f:Strogonoff de Boi}]}]$$, 'pickup', null, 'subtotal', 70);
select tst.ok('meio a meio P Calabresa 37 + Atum 45 + borda requeijão 15 = 60', $$[{"product_id":{p:Pizza 2 sabores (meio a meio)},"quantity":1,"size_id":{s:P},"flavor_ids":[{f:Calabresa},{f:Atum}],"crust_id":{c:Borda de requeijão}}]$$, 'pickup', null, 'subtotal', 60);
select tst.ok('meio a meio com 1 sabor só', $$[{"product_id":{p:Pizza 2 sabores (meio a meio)},"quantity":1,"size_id":{s:M},"flavor_ids":[{f:Atum}]}]$$, 'pickup', null, 'subtotal', 55);
select tst.err('meio a meio com 3 sabores', $$[{"product_id":{p:Pizza 2 sabores (meio a meio)},"quantity":1,"size_id":{s:G},"flavor_ids":[{f:Calabresa},{f:Atum},{f:Bacon}]}]$$, 'pickup');
select tst.err('meio a meio com sabor em confirmação', $$[{"product_id":{p:Pizza 2 sabores (meio a meio)},"quantity":1,"size_id":{s:G},"flavor_ids":[{f:Calabresa},{f:Lombo}]}]$$, 'pickup');

select tst.err('Lombo (preço em confirmação)', $$[{"product_id":{p:Lombo},"quantity":1,"size_id":{s:P},"flavor_ids":[{f:Lombo}]}]$$, 'pickup');
select tst.err('Mussarela (preço em confirmação)', $$[{"product_id":{p:Mussarela},"quantity":1,"size_id":{s:G},"flavor_ids":[{f:Mussarela}]}]$$, 'pickup');
select tst.err('Milho Especial (preço em confirmação)', $$[{"product_id":{p:Milho Especial},"quantity":1,"size_id":{s:M},"flavor_ids":[{f:Milho Especial}]}]$$, 'pickup');
select tst.err('Frango Barbecue (preço em confirmação)', $$[{"product_id":{p:Frango Barbecue},"quantity":1,"size_id":{s:G},"flavor_ids":[{f:Frango Barbecue}]}]$$, 'pickup');
select tst.err('card de um sabor não aceita segundo sabor', $$[{"product_id":{p:Calabresa},"quantity":1,"size_id":{s:G},"flavor_ids":[{f:Calabresa},{f:Bacon}]}]$$, 'pickup');
select tst.err('sabor de outro card', $$[{"product_id":{p:Calabresa},"quantity":1,"size_id":{s:G},"flavor_ids":[{f:Bacon}]}]$$, 'pickup');

reset role;
update public.crusts set price_review = true where name = 'Borda mista';
update public.extras set price_review = true where name = 'Palmito';
set role anon;
select tst.err('borda em confirmação', $$[{"product_id":{p:Peru},"quantity":1,"size_id":{s:P},"flavor_ids":[{f:Peru}],"crust_id":{c:Borda mista}}]$$, 'pickup');
select tst.err('adicional em confirmação', $$[{"product_id":{p:Peru},"quantity":1,"size_id":{s:P},"flavor_ids":[{f:Peru}],"extra_ids":[{e:Palmito}]}]$$, 'pickup');

-- visitante não consegue tirar a marcação de revisão
do $$ begin
  begin update public.pizza_flavors set price_review = false where name = 'Lombo';
  exception when others then raise notice 'OK (recusado) visitante tirar marcação: %', sqlerrm; return; end;
  if (select price_review from public.pizza_flavors where name = 'Lombo') then raise notice 'OK (sem efeito) visitante tirar marcação';
  else raise exception 'FALHOU: visitante alterou a marcação'; end if;
end $$;
