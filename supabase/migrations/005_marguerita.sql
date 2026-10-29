-- Marguerita: sabor novo para a promoção de sexta, com os preços da Portuguesa
-- (P 40,00 · M 45,00 · G 55,90), pedido de João Paulo em 29/10/2026.
-- Entra em "Pizzas de queijo", no meio a meio e na sexta (G por R$ 50,00).
-- Pode rodar mais de uma vez.
begin;
insert into public.pizza_flavors (name, description, sort_order)
select 'Marguerita', 'Mussarela, tomate e manjericão', coalesce(max(sort_order), 0) + 1
from public.pizza_flavors
having not exists (select 1 from public.pizza_flavors where name = 'Marguerita');

insert into public.flavor_prices (flavor_id, size_id, price)
select f.id, s.id, v.price
from (values ('P', 40.00), ('M', 45.00), ('G', 55.90)) as v(size, price)
join public.pizza_sizes s on s.name = v.size
join public.pizza_flavors f on f.name = 'Marguerita'
on conflict (flavor_id, size_id) do nothing;

insert into public.products (category_id, kind, name, description, sort_order)
select c.id, 'pizza', 'Marguerita', 'Mussarela, tomate e manjericão',
       (select coalesce(max(p.sort_order), 0) + 1 from public.products p where p.category_id = c.id)
from public.categories c
where c.name = 'Pizzas de queijo'
  and not exists (select 1 from public.products where name = 'Marguerita' and kind = 'pizza');

insert into public.product_sizes (product_id, size_id)
select p.id, s.id from public.products p cross join public.pizza_sizes s
where p.name = 'Marguerita' and p.kind = 'pizza'
on conflict do nothing;

insert into public.product_flavors (product_id, flavor_id)
select p.id, f.id from public.products p join public.pizza_flavors f on f.name = 'Marguerita'
where p.kind = 'pizza' and p.name in ('Marguerita', 'Pizza 2 sabores (meio a meio)')
on conflict do nothing;

insert into public.product_extras (product_id, extra_id)
select p.id, e.id from public.products p cross join public.extras e
where p.name = 'Marguerita' and p.kind = 'pizza'
on conflict do nothing;

insert into public.weekly_promotions (weekday, flavor_id, size_id, price, sort_order)
select 5, f.id, s.id, 50.00, 1
from public.pizza_flavors f, public.pizza_sizes s
where f.name = 'Marguerita' and s.name = 'G'
on conflict (weekday, flavor_id, size_id) do nothing;
commit;
