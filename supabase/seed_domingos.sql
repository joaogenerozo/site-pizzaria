-- =====================================================================
-- CARDÁPIO REAL — Domingo's Pizzas
-- Gerado por scripts/gerar-seed-domingos.mjs a partir de
-- data/cardapio_domingos_pizzas.json. Não edite à mão: altere o JSON e gere de novo,
-- ou faça as mudanças pelo painel /admin depois de carregar.
--
-- ATENÇÃO: este arquivo APAGA o cardápio atual (categorias, produtos, sabores,
-- tamanhos, bordas, adicionais, bairros e formas de pagamento) e carrega o novo.
-- Rode no SQL Editor do Supabase depois do schema.sql.
-- =====================================================================
begin;

delete from public.product_extras; delete from public.product_flavors; delete from public.product_sizes;
delete from public.products; delete from public.extras; delete from public.crust_prices; delete from public.crusts;
delete from public.flavor_prices; delete from public.pizza_flavors; delete from public.pizza_sizes;
delete from public.categories; delete from public.delivery_zones; delete from public.payment_methods;
delete from public.opening_hours;

insert into public.store_settings (id, name, tagline, about, whatsapp_number, phone_display, address_line,
  min_order_value, multi_flavor_rule, is_demo)
values (1, 'Domingo''s Pizzas', 'O sabor que reúne quem você ama!',
  'Desde 2013. Todas as pizzas acompanham molho de tomate, orégano e azeitona. Telefones: (35) 99805-8784, (35) 91024-3144 (principal), (35) 99836-0162.',
  '5535910243144', '(35) 91024-3144', 'Avenida Mario Lanzani, 261 - Vila Maganhoto',
  0, 'maior', false)
on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, about = excluded.about,
  whatsapp_number = excluded.whatsapp_number, phone_display = excluded.phone_display,
  address_line = excluded.address_line, min_order_value = excluded.min_order_value,
  multi_flavor_rule = excluded.multi_flavor_rule, is_demo = excluded.is_demo;

-- Horário: quarta-feira a segunda-feira, 18:00 às 22:00; terça-feira fechado
insert into public.opening_hours (weekday, opens_at, closes_at)
select d, '18:00', '22:00' from generate_series(0, 6) d where d <> 2; -- 2 = terça

insert into public.payment_methods (name, asks_change, sort_order) values
  ('Pix', false, 1),
  ('Dinheiro', true, 2),
  ('Cartão de crédito', false, 3),
  ('Cartão de débito', false, 4);

-- Pendente de confirmação (não consta no cardápio impresso)
insert into public.delivery_zones (name, fee, sort_order) values ('Entrega (taxa a combinar)', null, 1);

insert into public.pizza_sizes (name, slices, max_flavors, sort_order) values
  ('P', 4, 2, 1),
  ('M', 6, 2, 2),
  ('G', 8, 2, 3);

insert into public.categories (name, sort_order) values
  ('Pizza meio a meio', 0),
  ('Pizzas de frango', 1),
  ('Pizzas de brócolis', 2),
  ('Pizzas de calabresa', 3),
  ('Pizzas de milho, bacon e palmito', 4),
  ('Pizzas de presunto', 5),
  ('Pizzas de queijo', 6),
  ('Pizzas de lombo', 7),
  ('Pizzas de atum', 8),
  ('Pizzas de carne', 9),
  ('Pizzas de peito de peru', 10),
  ('Pizzas doces', 11);

insert into public.pizza_flavors (name, description, price_review, sort_order) values
  ('Frango com Catupiry', 'Frango desfiado e catupiry', false, 1),
  ('Frango Cheddar', 'Frango desfiado e cheddar', false, 2),
  ('Frango 3', 'Frango desfiado com requeijão cremoso e tiras de bacon', false, 3),
  ('Frango 4', 'Frango desfiado, milho, tiras de bacon e requeijão cremoso', false, 4),
  ('Frango Barbecue', 'Frango desfiado com molho barbecue e tiras de bacon, mussarela e cheddar', true, 5),
  ('Strogonoff de Frango', 'Mussarela, requeijão cremoso, strogonoff de frango e batata palha', false, 6),
  ('Brócolis', 'Mussarela e brócolis com alho frito', false, 7),
  ('Brócolis Especial', 'Mussarela, brócolis com alho frito, requeijão e bacon', false, 8),
  ('Brócolis 1', 'Mussarela, brócolis com alho frito e requeijão', false, 9),
  ('Brócolis 2', 'Mussarela, brócolis com alho frito e cheddar', false, 10),
  ('Brócolis 3', 'Mussarela, brócolis com alho frito, cheddar e bacon', false, 11),
  ('Calabresa', 'Calabresa acebolada ao azeite e azeitonas', false, 12),
  ('Calabresa da Casa', 'Mussarela, calabresa acebolada ao azeite e azeitonas', false, 13),
  ('Americana', 'Mussarela, calabresa, cheddar, tiras de bacon e geleia de pimenta', false, 14),
  ('Baiana', 'Mussarela, calabresa, cebola, azeite, ovos e pimenta calabresa', false, 15),
  ('Milho', 'Mussarela e milho', false, 16),
  ('Milho Bacon', 'Mussarela, milho e bacon', false, 17),
  ('Milho Especial', 'Mussarela, milho, bacon e requeijão', true, 18),
  ('Bacon', 'Mussarela e bacon', false, 19),
  ('Bacon e Palmito', 'Mussarela, bacon e palmito', false, 20),
  ('Siciliana', 'Mussarela, champignon e bacon', false, 21),
  ('Bauru', 'Presunto, mussarela e tomate', false, 22),
  ('Portuguesa', 'Presunto, cebola, ovos e mussarela', false, 23),
  ('Portugal', 'Presunto, cebola, ovo, requeijão e mussarela', false, 24),
  ('Presunto', 'Presunto e mussarela', false, 25),
  ('Presunto 1', 'Presunto e requeijão', false, 26),
  ('Júlia', 'Presunto, cebola, palmito picado, tomate e mussarela', false, 27),
  ('Mussarela', 'Mussarela', true, 28),
  ('3 Queijos', 'Mussarela, requeijão e parmesão', false, 29),
  ('4 Queijos', 'Mussarela, requeijão, parmesão e provolone', false, 30),
  ('5 Queijos', 'Mussarela, requeijão, parmesão, provolone e gorgonzola', false, 31),
  ('Catupiry', 'Mussarela e requeijão', false, 32),
  ('Catupiry com Bacon', 'Mussarela, requeijão e bacon', false, 33),
  ('Marguerita', 'Mussarela, tomate e manjericão', false, 34),
  ('Lombo', 'Mussarela, lombo defumado e cebola', true, 35),
  ('Lombo Especial', 'Lombo, mussarela, champignon e bacon', false, 36),
  ('Lombo Cheddar', 'Mussarela, lombo defumado e cheddar', false, 37),
  ('Lombo Requeijão', 'Lombo defumado, requeijão e mussarela', false, 38),
  ('Polly', 'Lombo defumado, mussarela, cheddar e bacon', false, 39),
  ('Atum', 'Mussarela, atum e cebola', false, 40),
  ('Atum Especial', 'Mussarela, atum, cebola e tomate', false, 41),
  ('Strogonoff de Boi', 'Mussarela, strogonoff de boi com champignon e batata palha', false, 42),
  ('Churrasco', 'Mussarela com fraldinha flambada no alho e azeite e cebolas', false, 43),
  ('Peru', 'Mussarela, peito de peru e requeijão', false, 44),
  ('Califa', 'Mussarela, peito de peru, cheddar, abacaxi e bacon', false, 45),
  ('Peru Especial', 'Mussarela, peito de peru, requeijão e geléia de pimenta', false, 46),
  ('Uva Branca', 'Chocolate branco, uvas verdes, brownie, cacau em pó e amendoim', false, 47),
  ('Doce Delírio', 'Chocolate branco, chocolate preto, uvas verdes, morango e sonho de valsa branco', false, 48),
  ('Moça', 'Creme de leite moça com leite em pó, morangos e raspas de lima', false, 49),
  ('Banana Nevada', 'Bananas fatiadas com chocolate branco', false, 50),
  ('Banana Tradicional', 'Bananas fatiadas com mussarela, canela e açúcar', false, 51),
  ('Romeu e Julieta', 'Mussarela com goiaba', false, 52);

insert into public.flavor_prices (flavor_id, size_id, price)
select f.id, s.id, v.price from (values
  ('Frango com Catupiry', 'P', 50.90),
  ('Frango com Catupiry', 'M', 55.00),
  ('Frango com Catupiry', 'G', 57.00),
  ('Frango Cheddar', 'P', 50.00),
  ('Frango Cheddar', 'M', 58.00),
  ('Frango Cheddar', 'G', 68.00),
  ('Frango 3', 'P', 52.00),
  ('Frango 3', 'M', 55.00),
  ('Frango 3', 'G', 59.90),
  ('Frango 4', 'P', 52.00),
  ('Frango 4', 'M', 55.00),
  ('Frango 4', 'G', 59.90),
  ('Frango Barbecue', 'P', 55.00),
  ('Frango Barbecue', 'M', 65.00),
  ('Frango Barbecue', 'G', 65.00),
  ('Strogonoff de Frango', 'P', 50.00),
  ('Strogonoff de Frango', 'M', 55.00),
  ('Strogonoff de Frango', 'G', 65.00),
  ('Brócolis', 'P', 40.00),
  ('Brócolis', 'M', 45.00),
  ('Brócolis', 'G', 55.90),
  ('Brócolis Especial', 'P', 45.00),
  ('Brócolis Especial', 'M', 55.00),
  ('Brócolis Especial', 'G', 65.00),
  ('Brócolis 1', 'P', 40.00),
  ('Brócolis 1', 'M', 50.00),
  ('Brócolis 1', 'G', 60.00),
  ('Brócolis 2', 'P', 43.00),
  ('Brócolis 2', 'M', 53.00),
  ('Brócolis 2', 'G', 63.00),
  ('Brócolis 3', 'P', 43.00),
  ('Brócolis 3', 'M', 53.00),
  ('Brócolis 3', 'G', 63.00),
  ('Calabresa', 'P', 37.00),
  ('Calabresa', 'M', 45.00),
  ('Calabresa', 'G', 55.00),
  ('Calabresa da Casa', 'P', 40.00),
  ('Calabresa da Casa', 'M', 50.00),
  ('Calabresa da Casa', 'G', 60.00),
  ('Americana', 'P', 55.00),
  ('Americana', 'M', 65.00),
  ('Americana', 'G', 70.00),
  ('Baiana', 'P', 55.00),
  ('Baiana', 'M', 65.00),
  ('Baiana', 'G', 70.00),
  ('Milho', 'P', 40.00),
  ('Milho', 'M', 45.00),
  ('Milho', 'G', 55.90),
  ('Milho Bacon', 'P', 45.00),
  ('Milho Bacon', 'M', 55.00),
  ('Milho Bacon', 'G', 63.00),
  ('Milho Especial', 'P', 50.00),
  ('Milho Especial', 'M', 50.00),
  ('Milho Especial', 'G', 65.00),
  ('Bacon', 'P', 40.00),
  ('Bacon', 'M', 45.00),
  ('Bacon', 'G', 55.90),
  ('Bacon e Palmito', 'P', 40.00),
  ('Bacon e Palmito', 'M', 50.00),
  ('Bacon e Palmito', 'G', 60.00),
  ('Siciliana', 'P', 50.00),
  ('Siciliana', 'M', 55.00),
  ('Siciliana', 'G', 59.00),
  ('Bauru', 'P', 40.00),
  ('Bauru', 'M', 45.00),
  ('Bauru', 'G', 55.00),
  ('Portuguesa', 'P', 40.00),
  ('Portuguesa', 'M', 45.00),
  ('Portuguesa', 'G', 55.90),
  ('Portugal', 'P', 45.00),
  ('Portugal', 'M', 55.00),
  ('Portugal', 'G', 60.00),
  ('Presunto', 'P', 40.00),
  ('Presunto', 'M', 45.00),
  ('Presunto', 'G', 55.90),
  ('Presunto 1', 'P', 40.00),
  ('Presunto 1', 'M', 45.00),
  ('Presunto 1', 'G', 55.90),
  ('Júlia', 'P', 50.00),
  ('Júlia', 'M', 55.00),
  ('Júlia', 'G', 65.90),
  ('Mussarela', 'P', 40.00),
  ('Mussarela', 'M', 55.00),
  ('Mussarela', 'G', 55.90),
  ('3 Queijos', 'P', 40.00),
  ('3 Queijos', 'M', 50.00),
  ('3 Queijos', 'G', 60.00),
  ('4 Queijos', 'P', 45.00),
  ('4 Queijos', 'M', 55.00),
  ('4 Queijos', 'G', 65.00),
  ('5 Queijos', 'P', 50.00),
  ('5 Queijos', 'M', 60.00),
  ('5 Queijos', 'G', 70.00),
  ('Catupiry', 'P', 40.00),
  ('Catupiry', 'M', 50.00),
  ('Catupiry', 'G', 55.90),
  ('Catupiry com Bacon', 'P', 45.00),
  ('Catupiry com Bacon', 'M', 55.00),
  ('Catupiry com Bacon', 'G', 59.90),
  ('Marguerita', 'P', 40.00),
  ('Marguerita', 'M', 45.00),
  ('Marguerita', 'G', 55.90),
  ('Lombo', 'P', 50.00),
  ('Lombo', 'M', 45.00),
  ('Lombo', 'G', 55.90),
  ('Lombo Especial', 'P', 45.00),
  ('Lombo Especial', 'M', 55.00),
  ('Lombo Especial', 'G', 65.00),
  ('Lombo Cheddar', 'P', 40.00),
  ('Lombo Cheddar', 'M', 50.00),
  ('Lombo Cheddar', 'G', 60.00),
  ('Lombo Requeijão', 'P', 40.00),
  ('Lombo Requeijão', 'M', 50.00),
  ('Lombo Requeijão', 'G', 55.00),
  ('Polly', 'P', 45.00),
  ('Polly', 'M', 55.00),
  ('Polly', 'G', 65.00),
  ('Atum', 'P', 45.00),
  ('Atum', 'M', 55.00),
  ('Atum', 'G', 65.00),
  ('Atum Especial', 'P', 47.00),
  ('Atum Especial', 'M', 57.00),
  ('Atum Especial', 'G', 67.00),
  ('Strogonoff de Boi', 'P', 50.00),
  ('Strogonoff de Boi', 'M', 60.00),
  ('Strogonoff de Boi', 'G', 70.00),
  ('Churrasco', 'P', 50.00),
  ('Churrasco', 'M', 60.00),
  ('Churrasco', 'G', 70.00),
  ('Peru', 'P', 40.00),
  ('Peru', 'M', 50.00),
  ('Peru', 'G', 60.00),
  ('Califa', 'P', 50.00),
  ('Califa', 'M', 60.00),
  ('Califa', 'G', 70.00),
  ('Peru Especial', 'P', 45.00),
  ('Peru Especial', 'M', 55.00),
  ('Peru Especial', 'G', 65.00),
  ('Uva Branca', 'P', 50.00),
  ('Uva Branca', 'M', 60.00),
  ('Uva Branca', 'G', 70.00),
  ('Doce Delírio', 'P', 50.00),
  ('Doce Delírio', 'M', 60.00),
  ('Doce Delírio', 'G', 70.00),
  ('Moça', 'P', 50.00),
  ('Moça', 'M', 60.00),
  ('Moça', 'G', 70.00),
  ('Banana Nevada', 'P', 45.00),
  ('Banana Nevada', 'M', 55.00),
  ('Banana Nevada', 'G', 63.00),
  ('Banana Tradicional', 'P', 45.00),
  ('Banana Tradicional', 'M', 55.00),
  ('Banana Tradicional', 'G', 65.00),
  ('Romeu e Julieta', 'P', 45.00),
  ('Romeu e Julieta', 'M', 55.00),
  ('Romeu e Julieta', 'G', 65.00)
) as v(flavor, size, price)
join public.pizza_flavors f on f.name = v.flavor
join public.pizza_sizes s on s.name = v.size;

-- Um produto por sabor, na categoria do cardápio impresso
insert into public.products (category_id, kind, name, description, sort_order)
select c.id, 'pizza', v.name, v.description, v.ord from (values
  ('Pizzas de frango', 'Frango com Catupiry', 'Frango desfiado e catupiry', 1),
  ('Pizzas de frango', 'Frango Cheddar', 'Frango desfiado e cheddar', 2),
  ('Pizzas de frango', 'Frango 3', 'Frango desfiado com requeijão cremoso e tiras de bacon', 3),
  ('Pizzas de frango', 'Frango 4', 'Frango desfiado, milho, tiras de bacon e requeijão cremoso', 4),
  ('Pizzas de frango', 'Frango Barbecue', 'Frango desfiado com molho barbecue e tiras de bacon, mussarela e cheddar', 5),
  ('Pizzas de frango', 'Strogonoff de Frango', 'Mussarela, requeijão cremoso, strogonoff de frango e batata palha', 6),
  ('Pizzas de brócolis', 'Brócolis', 'Mussarela e brócolis com alho frito', 1),
  ('Pizzas de brócolis', 'Brócolis Especial', 'Mussarela, brócolis com alho frito, requeijão e bacon', 2),
  ('Pizzas de brócolis', 'Brócolis 1', 'Mussarela, brócolis com alho frito e requeijão', 3),
  ('Pizzas de brócolis', 'Brócolis 2', 'Mussarela, brócolis com alho frito e cheddar', 4),
  ('Pizzas de brócolis', 'Brócolis 3', 'Mussarela, brócolis com alho frito, cheddar e bacon', 5),
  ('Pizzas de calabresa', 'Calabresa', 'Calabresa acebolada ao azeite e azeitonas', 1),
  ('Pizzas de calabresa', 'Calabresa da Casa', 'Mussarela, calabresa acebolada ao azeite e azeitonas', 2),
  ('Pizzas de calabresa', 'Americana', 'Mussarela, calabresa, cheddar, tiras de bacon e geleia de pimenta', 3),
  ('Pizzas de calabresa', 'Baiana', 'Mussarela, calabresa, cebola, azeite, ovos e pimenta calabresa', 4),
  ('Pizzas de milho, bacon e palmito', 'Milho', 'Mussarela e milho', 1),
  ('Pizzas de milho, bacon e palmito', 'Milho Bacon', 'Mussarela, milho e bacon', 2),
  ('Pizzas de milho, bacon e palmito', 'Milho Especial', 'Mussarela, milho, bacon e requeijão', 3),
  ('Pizzas de milho, bacon e palmito', 'Bacon', 'Mussarela e bacon', 4),
  ('Pizzas de milho, bacon e palmito', 'Bacon e Palmito', 'Mussarela, bacon e palmito', 5),
  ('Pizzas de milho, bacon e palmito', 'Siciliana', 'Mussarela, champignon e bacon', 6),
  ('Pizzas de presunto', 'Bauru', 'Presunto, mussarela e tomate', 1),
  ('Pizzas de presunto', 'Portuguesa', 'Presunto, cebola, ovos e mussarela', 2),
  ('Pizzas de presunto', 'Portugal', 'Presunto, cebola, ovo, requeijão e mussarela', 3),
  ('Pizzas de presunto', 'Presunto', 'Presunto e mussarela', 4),
  ('Pizzas de presunto', 'Presunto 1', 'Presunto e requeijão', 5),
  ('Pizzas de presunto', 'Júlia', 'Presunto, cebola, palmito picado, tomate e mussarela', 6),
  ('Pizzas de queijo', 'Mussarela', 'Mussarela', 1),
  ('Pizzas de queijo', '3 Queijos', 'Mussarela, requeijão e parmesão', 2),
  ('Pizzas de queijo', '4 Queijos', 'Mussarela, requeijão, parmesão e provolone', 3),
  ('Pizzas de queijo', '5 Queijos', 'Mussarela, requeijão, parmesão, provolone e gorgonzola', 4),
  ('Pizzas de queijo', 'Catupiry', 'Mussarela e requeijão', 5),
  ('Pizzas de queijo', 'Catupiry com Bacon', 'Mussarela, requeijão e bacon', 6),
  ('Pizzas de queijo', 'Marguerita', 'Mussarela, tomate e manjericão', 7),
  ('Pizzas de lombo', 'Lombo', 'Mussarela, lombo defumado e cebola', 1),
  ('Pizzas de lombo', 'Lombo Especial', 'Lombo, mussarela, champignon e bacon', 2),
  ('Pizzas de lombo', 'Lombo Cheddar', 'Mussarela, lombo defumado e cheddar', 3),
  ('Pizzas de lombo', 'Lombo Requeijão', 'Lombo defumado, requeijão e mussarela', 4),
  ('Pizzas de lombo', 'Polly', 'Lombo defumado, mussarela, cheddar e bacon', 5),
  ('Pizzas de atum', 'Atum', 'Mussarela, atum e cebola', 1),
  ('Pizzas de atum', 'Atum Especial', 'Mussarela, atum, cebola e tomate', 2),
  ('Pizzas de carne', 'Strogonoff de Boi', 'Mussarela, strogonoff de boi com champignon e batata palha', 1),
  ('Pizzas de carne', 'Churrasco', 'Mussarela com fraldinha flambada no alho e azeite e cebolas', 2),
  ('Pizzas de peito de peru', 'Peru', 'Mussarela, peito de peru e requeijão', 1),
  ('Pizzas de peito de peru', 'Califa', 'Mussarela, peito de peru, cheddar, abacaxi e bacon', 2),
  ('Pizzas de peito de peru', 'Peru Especial', 'Mussarela, peito de peru, requeijão e geléia de pimenta', 3),
  ('Pizzas doces', 'Uva Branca', 'Chocolate branco, uvas verdes, brownie, cacau em pó e amendoim', 1),
  ('Pizzas doces', 'Doce Delírio', 'Chocolate branco, chocolate preto, uvas verdes, morango e sonho de valsa branco', 2),
  ('Pizzas doces', 'Moça', 'Creme de leite moça com leite em pó, morangos e raspas de lima', 3),
  ('Pizzas doces', 'Banana Nevada', 'Bananas fatiadas com chocolate branco', 4),
  ('Pizzas doces', 'Banana Tradicional', 'Bananas fatiadas com mussarela, canela e açúcar', 5),
  ('Pizzas doces', 'Romeu e Julieta', 'Mussarela com goiaba', 6)
) as v(cat, name, description, ord)
join public.categories c on c.name = v.cat;

-- Pizza 2 sabores (meio a meio): todos os sabores, cobrada pelo sabor mais caro
insert into public.products (category_id, kind, name, description, sort_order)
select c.id, 'pizza', 'Pizza 2 sabores (meio a meio)', 'Escolha o tamanho e dois sabores diferentes.', 1 from public.categories c where c.name = 'Pizza meio a meio';

insert into public.product_sizes (product_id, size_id)
select p.id, s.id from public.products p cross join public.pizza_sizes s where p.kind = 'pizza';
insert into public.product_flavors (product_id, flavor_id)
select p.id, f.id from public.products p join public.pizza_flavors f on f.name = p.name where p.kind = 'pizza';
insert into public.product_flavors (product_id, flavor_id)
select p.id, f.id from public.products p cross join public.pizza_flavors f where p.name = 'Pizza 2 sabores (meio a meio)';

-- Bordas: o cardápio mostra um preço só; usado igual em P, M e G
insert into public.crusts (name, sort_order) values
  ('Borda de requeijão', 1),
  ('Borda de cheddar', 2),
  ('Borda mista', 3);
insert into public.crust_prices (crust_id, size_id, price)
select c.id, s.id, v.price from (values
  ('Borda de requeijão', 15.00),
  ('Borda de cheddar', 18.00),
  ('Borda mista', 20.00)
) as v(crust, price)
join public.crusts c on c.name = v.crust cross join public.pizza_sizes s;

insert into public.extras (name, price, sort_order) values
  ('Mussarela', 20.00, 1),
  ('Bacon', 10.00, 2),
  ('Milho', 5.00, 3),
  ('Palmito', 8.00, 4),
  ('Cebola', 5.00, 5),
  ('Tomate', 5.00, 6);
insert into public.product_extras (product_id, extra_id)
select p.id, e.id from public.products p cross join public.extras e where p.kind = 'pizza';

-- Promoções da semana: G por R$ 50,00 (0 = domingo)
insert into public.weekly_promotions (weekday, flavor_id, size_id, price, sort_order)
select v.weekday, f.id, s.id, v.price, v.ord from (values
  (1, 'Portuguesa', 50.00, 1),
  (1, 'Bacon', 50.00, 2),
  (1, '4 Queijos', 50.00, 3),
  (3, 'Mussarela', 50.00, 1),
  (3, 'Bauru', 50.00, 2),
  (3, 'Siciliana', 50.00, 3),
  (4, 'Strogonoff de Boi', 50.00, 1),
  (4, 'Strogonoff de Frango', 50.00, 2),
  (4, 'Frango com Catupiry', 50.00, 3),
  (5, 'Marguerita', 50.00, 1),
  (5, 'Brócolis 3', 50.00, 2),
  (5, 'Calabresa da Casa', 50.00, 3),
  (6, 'Portuguesa', 50.00, 1),
  (6, 'Milho', 50.00, 2),
  (6, 'Lombo Requeijão', 50.00, 3),
  (0, 'Mussarela', 50.00, 1),
  (0, 'Bacon e Palmito', 50.00, 2),
  (0, 'Banana Nevada', 50.00, 3)
) as v(weekday, flavor, price, ord)
join public.pizza_flavors f on f.name = v.flavor
join public.pizza_sizes s on s.name = 'G';

commit;

-- Conferência rápida (deve mostrar 52 sabores e 4 com preço em confirmação):
-- select count(*), count(*) filter (where price_review) from public.pizza_flavors;
