-- =====================================================================
-- DADOS DE DEMONSTRAÇÃO — NÃO SÃO DADOS REAIS
-- =====================================================================
-- Nome, preços, bairros e taxas abaixo são FICTÍCIOS e servem apenas
-- para testar o site. store_settings.is_demo = true faz o site exibir um
-- aviso de "modo demonstração". O WhatsApp fica vazio de propósito: o
-- botão de enviar pedido só funciona depois que o número real for
-- cadastrado no painel.
--
-- Para usar dados reais: cadastre tudo pelo painel /admin e desligue o
-- modo demonstração (ou rode o bloco "LIMPAR DEMONSTRAÇÃO" no final).
-- =====================================================================

insert into public.store_settings (
  id, name, tagline, about, whatsapp_number, address_line,
  delivery_time_min, delivery_time_max, pickup_time_min, pickup_time_max,
  min_order_value, multi_flavor_rule, is_demo
) values (
  1, 'Pizzaria Demonstração', 'Cardápio de exemplo — dados fictícios',
  'Este é um cardápio de demonstração. Nenhuma informação aqui é real.',
  null, 'Endereço de demonstração',
  30, 50, 15, 20,
  20.00, 'maior', true
) on conflict (id) do nothing;

insert into public.opening_hours (weekday, opens_at, closes_at)
select d, '18:00', '23:30' from generate_series(0, 6) d where d <> 1; -- fechado às segundas (demo)

insert into public.payment_methods (name, asks_change, sort_order) values
  ('Dinheiro', true, 1),
  ('Pix', false, 2),
  ('Cartão de crédito (na entrega)', false, 3),
  ('Cartão de débito (na entrega)', false, 4);

insert into public.delivery_zones (name, fee, sort_order) values
  ('Bairro Demo Centro', 5.00, 1),
  ('Bairro Demo Norte', 7.00, 2),
  ('Bairro Demo Sul', 8.00, 3);

insert into public.categories (name, sort_order) values
  ('Promoções', 1), ('Pizzas', 2), ('Esfihas e combos', 3),
  ('Porções', 4), ('Bebidas', 5), ('Rodízio', 6), ('Doces', 7);

insert into public.pizza_sizes (name, slices, max_flavors, sort_order) values
  ('Broto', 4, 2, 1),
  ('Grande', 8, 2, 2),
  ('Gigante', 12, 3, 3);

insert into public.pizza_flavors (name, description, sort_order) values
  ('Mussarela', 'Molho de tomate, mussarela e orégano.', 1),
  ('Calabresa', 'Calabresa fatiada, cebola e orégano.', 2),
  ('Margherita', 'Mussarela, tomate e manjericão.', 3),
  ('Frango com catupiry', 'Frango desfiado e catupiry.', 4),
  ('Portuguesa', 'Presunto, ovo, cebola, ervilha e mussarela.', 5),
  ('Chocolate', 'Chocolate ao leite.', 6);

-- Preços fictícios por tamanho
insert into public.flavor_prices (flavor_id, size_id, price)
select f.id, s.id,
  case s.name when 'Broto' then 30 when 'Grande' then 50 else 70 end
  + case f.name when 'Frango com catupiry' then 6 when 'Portuguesa' then 8 when 'Chocolate' then 4 else 0 end
from public.pizza_flavors f cross join public.pizza_sizes s;

-- Uma promoção de sabor (demo)
update public.flavor_prices fp set promo_price = fp.price - 5
from public.pizza_flavors f, public.pizza_sizes s
where f.id = fp.flavor_id and s.id = fp.size_id and f.name = 'Calabresa' and s.name = 'Grande';

insert into public.crusts (name, sort_order) values ('Catupiry', 1), ('Cheddar', 2), ('Chocolate', 3);
insert into public.crust_prices (crust_id, size_id, price)
select c.id, s.id, case s.name when 'Broto' then 6 when 'Grande' then 10 else 14 end
from public.crusts c cross join public.pizza_sizes s;

insert into public.extras (name, price, sort_order) values
  ('Bacon', 6.00, 1), ('Cheddar extra', 5.00, 2), ('Azeitona', 3.00, 3), ('Ovo', 3.00, 4);

-- Produtos
insert into public.products (category_id, kind, name, description, price, promo_price, qty_promo_min, qty_promo_price, badge, sort_order)
select c.id, v.kind, v.name, v.description, v.price, v.promo_price, v.qmin, v.qprice, v.badge, v.ord
from (values
  ('Pizzas',           'pizza',  'Pizza salgada',        'Escolha o tamanho e até o limite de sabores do tamanho.', null::numeric, null::numeric, null::int, null::numeric, null, 1),
  ('Doces',            'pizza',  'Pizza doce',           'Pizza de sobremesa.', null, null, null, null, null, 1),
  ('Esfihas e combos', 'simple', 'Esfiha de carne',      'Unidade. A partir de 10 unidades, preço promocional.', 7.00, null, 10, 5.50, 'Leve 10+', 1),
  ('Esfihas e combos', 'simple', 'Esfiha de queijo',     'Unidade.', 7.00, null, null, null, null, 2),
  ('Porções',          'simple', 'Batata frita',         'Porção de 400 g.', 32.00, null, null, null, null, 1),
  ('Porções',          'simple', 'Anéis de cebola',      'Porção de 350 g.', 30.00, 26.00, null, null, 'Promoção', 2),
  ('Bebidas',          'simple', 'Refrigerante 2 L',     'Consulte os sabores disponíveis.', 14.00, null, null, null, null, 1),
  ('Bebidas',          'simple', 'Suco natural 500 ml',  null, 10.00, null, null, null, null, 2),
  ('Promoções',        'simple', 'Combo demo: 2 grandes + refri', 'Exemplo de combo promocional (dados fictícios).', 120.00, 99.90, null, null, 'Promoção', 1),
  ('Rodízio',          'simple', 'Rodízio adulto',       'Valor por pessoa (demonstração).', 59.90, null, null, null, null, 1)
) as v(cat, kind, name, description, price, promo_price, qmin, qprice, badge, ord)
join public.categories c on c.name = v.cat;

insert into public.product_sizes (product_id, size_id)
select p.id, s.id from public.products p cross join public.pizza_sizes s
where p.kind = 'pizza' and (p.name = 'Pizza salgada' or s.name <> 'Gigante');

insert into public.product_flavors (product_id, flavor_id)
select p.id, f.id from public.products p cross join public.pizza_flavors f
where (p.name = 'Pizza salgada' and f.name <> 'Chocolate')
   or (p.name = 'Pizza doce' and f.name = 'Chocolate');

insert into public.product_extras (product_id, extra_id)
select p.id, e.id from public.products p cross join public.extras e
where p.name = 'Pizza salgada'
   or (p.name = 'Batata frita' and e.name in ('Bacon', 'Cheddar extra'));

-- =====================================================================
-- LIMPAR DEMONSTRAÇÃO (rode só quando for cadastrar os dados reais)
-- =====================================================================
-- delete from public.product_extras; delete from public.product_flavors;
-- delete from public.product_sizes;  delete from public.products;
-- delete from public.extras; delete from public.crust_prices; delete from public.crusts;
-- delete from public.flavor_prices; delete from public.pizza_flavors; delete from public.pizza_sizes;
-- delete from public.categories; delete from public.delivery_zones;
-- delete from public.payment_methods; delete from public.opening_hours;
-- update public.store_settings set is_demo = false;
