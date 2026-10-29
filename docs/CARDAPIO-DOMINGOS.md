# Cardápio da Domingo's Pizzas

Fonte: **CARDÁPIO DE ENTREGA - 08-09-26** (PDF de 2 páginas enviado por João
Paulo em 26/10/2026). O arquivo `cardapio_domingos_pizzas.json` citado no
pedido não foi recebido. Por isso os dados foram transcritos do PDF para
[`data/cardapio_domingos_pizzas.json`](../data/cardapio_domingos_pizzas.json),
que passa a ser a fonte do cardápio.

## O que entrou

| Item | Quantidade |
|---|---|
| Categorias | 11 (frango, brócolis, calabresa, milho/bacon/palmito, presunto, queijo, lombo, atum, carne, peito de peru, doces) |
| Sabores | 51, cada um com ingredientes e preço em P, M e G (153 preços) |
| Tamanhos | P = 4 pedaços, M = 6 pedaços, G = 8 pedaços |
| Bordas | Requeijão R$ 15,00 · Cheddar R$ 18,00 · Mista R$ 20,00 |
| Adicionais | Mussarela R$ 20,00 · Bacon R$ 10,00 · Milho R$ 5,00 · Palmito R$ 8,00 · Cebola R$ 5,00 · Tomate R$ 5,00 |
| Loja | Domingo's Pizzas, Avenida Mario Lanzani, 261 - Vila Maganhoto; WhatsApp principal (35) 91024-3144; quarta a segunda, 18h às 22h; terça fechado |

No cardápio impresso, "Pizzas bacon" é um bloco separado. No site, essas
três pizzas (Bacon, Bacon e Palmito, Siciliana) ficam em **Pizzas de milho,
bacon e palmito**, seguindo a lista de categorias do pedido.

## Preços em confirmação (não podem ser pedidos até você confirmar)

Esses sabores aparecem no site com o aviso **"Preço em confirmação"**. O
cliente vê o sabor e os ingredientes, mas não consegue adicionar ao carrinho,
e o banco recusa o pedido mesmo que alguém tente burlar o site. Os valores do
PDF foram mantidos como estão, sem correção.

| Sabor | P | M | G | Motivo |
|---|---|---|---|---|
| Lombo | 50,00 | 45,00 | 55,90 | P mais caro que o M |
| Mussarela | 40,00 | 55,00 | 55,90 | M quase igual ao G (outras de G 55,90 custam 45,00 no M) |
| Milho Especial | 50,00 | 50,00 | 65,00 | P igual ao M |
| Frango Barbecue | 55,00 | 65,00 | 65,00 | M igual ao G |

**Para liberar:** painel `/admin/` → aba **Pizzas** → corrija o valor na
tabela "Preço dos sabores por tamanho" (se precisar) e clique em **Salvar
preços** → em **Sabores**, clique em **Editar** no sabor e desmarque
"Preço em confirmação" → **Salvar**. A mudança vale na hora para todos.

### Para conferir, mas sem bloqueio

- **Banana Tradicional:** o cardápio impresso diz "mussarela, **caneça** e açúcar".
  No site foi corrigido para "canela"; se for outro ingrediente, ajuste pelo painel.
- **Frango com Catupiry:** P 50,90 · M 55,00 · G 57,00 (diferença pequena entre M e G).
- **Siciliana:** G 59,00 (as outras terminam em ,90 ou ,00 redondo).

## O que o cardápio impresso não informa

Nada disso foi inventado. Enquanto você não informar, o site funciona assim:

| Assunto | Como está no site | O que preciso de você |
|---|---|---|
| Taxa de entrega | Região "Entrega (taxa a combinar)". O cliente digita o bairro e o total sai **sem a taxa**, e a mensagem diz "a combinar com a pizzaria" | Bairros e taxas (ou uma taxa fixa) |
| Preço das bordas por tamanho | Mesmo valor em P, M e G | A borda custa igual nos três tamanhos? |
| Pedido mínimo e tempo de entrega | Sem mínimo; tempo não exibido | Valores, se houver |
| Fotos e logo | Ilustração própria do site | Logo e fotos que vocês tenham direito de usar |

Tudo isso pode ser ajustado depois no painel, sem mexer no código.

## Como os sabores foram integrados

- Cada sabor virou um **produto do tipo pizza** com um único sabor e os
  tamanhos P, M e G. Assim cada sabor tem o próprio card, com os
  ingredientes e os três preços.
- O preço continua sendo **recalculado no banco** (`calculate_order`) a
  partir dos IDs. O navegador nunca envia preço, e cálculos usam centavos
  inteiros, não texto formatado.
- Novo campo `price_review` ("preço em confirmação") em sabores, produtos,
  bordas e adicionais. Pode ser marcado e desmarcado no painel.
- Taxa de entrega vazia num bairro = **taxa a combinar**.
- A mensagem do WhatsApp agora começa com o nome da pizzaria e não repete o
  sabor quando ele é o próprio nome da pizza.
- O site não carrega o JSON: ele lê os dados do Supabase. O JSON só alimenta
  o arquivo `supabase/seed_domingos.sql`. Por isso não há risco de o JSON
  não ser encontrado na Hostinger.

## Como atualizar o cardápio no futuro

**Pelo painel (recomendado):** `/admin/` → Pizzas (sabores, preços por
tamanho, bordas), Adicionais, Produtos (categoria, descrição, disponível),
Categorias, Entrega/pagamento/horários e Dados da loja. Salva no Supabase e
vale para todos os aparelhos na hora.

**Recarregar tudo a partir de um cardápio novo:** edite
`data/cardapio_domingos_pizzas.json`, rode `node scripts/gerar-seed-domingos.mjs`
e execute o `supabase/seed_domingos.sql` gerado no SQL Editor do Supabase.
Atenção: isso **apaga e substitui** o cardápio inteiro, inclusive o que foi
alterado pelo painel.

## Confirmado pela pizzaria (26/10/2026)

- **Meio a meio:** card "Pizza 2 sabores (meio a meio)", primeiro do cardápio, com os
  51 sabores. Até 2 sabores em P, M e G, cobrada pelo sabor mais caro.
  Exemplo: G Calabresa (55,00) + Strogonoff de Boi (70,00) = R$ 70,00.
- **Formas de pagamento:** Pix, Dinheiro (pergunta o troco), Cartão de crédito e
  Cartão de débito.

## Promoções da semana (pedido de 28/10/2026)

Três sabores por dia, **pizza G por R$ 50,00**. O tamanho G foi o escolhido
porque em P e M vários desses sabores já custam R$ 50,00 ou menos.

| Dia | Sabores |
|---|---|
| Segunda | Portuguesa, Bacon, 4 Queijos |
| Terça | sem promoção (pizzaria fechada) |
| Quarta | Mussarela, Bauru, Siciliana |
| Quinta | Strogonoff de Boi (pedido como "strogonoff de carne"), Strogonoff de Frango, Frango com Catupiry |
| Sexta | Brócolis 3 (cheddar e bacon), Calabresa da Casa · **Marguerita não existe no cardápio** |
| Sábado | Portuguesa, Milho, Lombo Requeijão |
| Domingo | Mussarela, Bacon e Palmito (pedido como "palmito com bacon"), Banana Nevada |

- Vale só no dia, pelo horário de Brasília, e o **banco** aplica o preço
  (`calculate_order`), então carrinho, revisão e WhatsApp mostram o mesmo valor.
  A mensagem marca o item com "(promoção do dia)".
- Borda e adicionais continuam cobrados à parte.
- Meio a meio: com a regra do sabor mais caro, sai por R$ 50,00 quando os dois
  sabores estão na promoção do dia.
- **Mussarela** está com "preço em confirmação", mas na quarta e no domingo pode
  ser pedida no G por R$ 50,00 (o preço da promoção é definido). P e M continuam bloqueados.
- No site: faixa "Promoção de hoje" no topo do cardápio (com a lista dos outros
  dias), selo "Promoção de hoje" no card e o preço antigo riscado.
- Para mudar: painel `/admin/` → aba **Promoções da semana** (dia, sabor,
  tamanho, preço, ativa). Vale na hora.

## Testes feitos (ambiente local que imita o Supabase)

| # | Teste | Resultado |
|---|---|---|
| 1 | Todas as 12 categorias carregam (11 + meio a meio) | OK |
| 2 | Os 51 sabores aparecem | OK |
| 3 | Ingredientes nos cards e na busca (ex.: "requeijao" sem acento, "goiaba") | OK |
| 4-5 | Escolha de P, M, G e preço atualizado (Calabresa 37,00 / 45,00 / 55,00) | OK |
| 6-7 | Adicionar, remover e alterar quantidade no carrinho | OK |
| 8 | Total: 2 × Calabresa G + borda de cheddar + bacon = R$ 166,00 | OK |
| 9 | Bordas e adicionais | OK |
| 10 | Mensagem do pedido (nome da loja, itens, tamanho, borda, adicionais, valores, endereço, observações) | OK |
| 11 | Link `wa.me/5535910243144` com a mensagem codificada | OK (link gerado e conferido; **não testado num celular de verdade**) |
| 12 | Celular (390px) e computador (1280px), sem rolagem lateral | OK |
| 13 | Nenhum erro no console | OK |
| 14 | Build de produção servido numa subpasta com a política de segurança da Hostinger | OK |
| 15 | Admin confirma o preço do Lombo e o cardápio passa a aceitar o pedido (gravado no banco) | OK |
| — | Todos os 153 preços no banco iguais ao arquivo de dados | OK, 0 divergências |
| 16 | Meio a meio G Calabresa + Strogonoff de Boi = R$ 70,00, pago com Pix, até a mensagem do WhatsApp | OK |
| — | Sabor em confirmação, 3 sabores e taxa a combinar recusados/tratados pelo banco | OK |

Totais: 87 testes no banco, 25 de unidade e 56 no navegador (celular e
desktop), todos passando.

**Ainda não testado:** projeto Supabase real, publicação na Hostinger e envio
real pelo WhatsApp num celular. Esses passos dependem das suas contas.

## Publicar na Hostinger

1. No Supabase (SQL Editor), rode `supabase/schema.sql`, `supabase/storage.sql`
   e `supabase/seed_domingos.sql`. Se o schema antigo já tinha sido rodado,
   rode antes `supabase/migrations/001_preco_em_confirmacao.sql`.
2. Cadastre o administrador (README, passo 3).
3. Gere os arquivos: `npm run build` com a URL e a chave publicável do seu
   projeto em `.env.production.local` (README, passo 6).
4. Envie **o conteúdo** da pasta `dist/` (inclusive o `.htaccess`) para a
   `public_html` na Hostinger (README, passo 7).
5. Abra o site no celular, faça um pedido de teste e confira se a mensagem
   chega no WhatsApp (35) 91024-3144.
