-- Promoção de sexta: o brócolis é o Brócolis 3 (cheddar e bacon), não o Brócolis Especial.
-- Confirmado por João Paulo em 29/10/2026. Pode rodar mais de uma vez.
begin;
delete from public.weekly_promotions wp
using public.pizza_flavors f
where wp.flavor_id = f.id and wp.weekday = 5 and f.name = 'Brócolis Especial';

insert into public.weekly_promotions (weekday, flavor_id, size_id, price, sort_order)
select 5, f.id, s.id, 50.00, 2
from public.pizza_flavors f, public.pizza_sizes s
where f.name = 'Brócolis 3' and s.name = 'G'
on conflict (weekday, flavor_id, size_id) do nothing;

update public.weekly_promotions wp set sort_order = 3
from public.pizza_flavors f
where wp.flavor_id = f.id and wp.weekday = 5 and f.name = 'Calabresa da Casa';
commit;

-- Conferência: deve mostrar Brócolis 3 e Calabresa da Casa, G por R$ 50,00
select f.name as sabor, s.name as tamanho, wp.price as preco
from public.weekly_promotions wp
join public.pizza_flavors f on f.id = wp.flavor_id
join public.pizza_sizes s on s.id = wp.size_id
where wp.weekday = 5
order by wp.sort_order;
