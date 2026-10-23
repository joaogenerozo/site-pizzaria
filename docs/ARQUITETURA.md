# Cardápio digital — Arquitetura (ETAPA 2)

Status: planejamento aprovado para implementação. Nenhuma conta externa
(Supabase, Hostinger, domínio, WhatsApp) foi configurada ainda.

## 1. Visão geral

```
Navegador do cliente ──► Site estático (Hostinger)
                           │  HTML/CSS/JS gerado pelo Vite (pasta dist/)
                           │
                           ├─► Supabase (URL + chave publicável "anon")
                           │     • leitura do cardápio (RLS: só itens ativos)
                           │     • RPC calculate_order: recalcula preços no banco
                           │     • Auth: login do administrador
                           │
                           └─► wa.me/<número>?text=<pedido codificado>
                                 o cliente confirma o envio no próprio WhatsApp
```

- **Frontend:** Vite + JavaScript (sem framework pesado), compilado com
  `npm run build` para `dist/`. Funciona em hospedagem estática comum.
- **Rotas:** `/` (cardápio) e `/admin/` (painel) são páginas HTML separadas,
  sem depender de reescrita de URL no servidor.
- **Backend:** só o Supabase (Postgres + Auth + Storage). Não há servidor
  próprio nesta versão, porque nenhuma operação precisa da chave secreta:
  as gravações do admin são autorizadas pelo RLS.
- **Chaves:** o frontend recebe apenas `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_ANON_KEY` (chave publicável). A `service_role` nunca entra
  no projeto.

## 2. Estrutura de pastas planejada

```
cardapio/
├── index.html            cardápio público
├── admin/index.html      painel administrativo
├── src/
│   ├── lib/              supabase.js, money.js, whatsapp.js, cart.js, hours.js
│   ├── public/           componentes do cardápio, personalização de pizza, checkout
│   ├── admin/            telas do painel
│   └── styles/
├── public/               imagens/ícones próprios, .htaccess
├── supabase/
│   ├── schema.sql        tabelas, RLS, políticas, função de cálculo
│   ├── storage.sql       bucket de imagens
│   ├── seed_demo.sql     dados FICTÍCIOS de demonstração
│   └── tests/            testes SQL de segurança e preços
├── tests/                testes automatizados do frontend (Vitest + Playwright)
├── .env.example          só nomes das variáveis públicas, sem valores
└── docs/
```

## 3. Banco de dados

| Tabela | Conteúdo |
|---|---|
| `admins` | IDs dos usuários do Auth que são administradores |
| `store_settings` | linha única: nome, logo, sobre, WhatsApp, endereço, tempos, pedido mínimo, regra de sabores, `is_demo` |
| `opening_hours` | horários por dia da semana (aceita virar a meia-noite) |
| `payment_methods` | formas de pagamento; `asks_change` pergunta o troco |
| `delivery_zones` | bairros/regiões com taxa e pedido mínimo próprio opcional |
| `categories` | categorias, ordem, ativa/inativa |
| `products` | `kind = simple` (preço fixo) ou `pizza`; promoção, promoção por quantidade, selo, disponibilidade, ordem |
| `pizza_sizes` | tamanhos, fatias e **limite de sabores** |
| `pizza_flavors` + `flavor_prices` | sabores e o preço de cada sabor em cada tamanho (com promoção opcional) |
| `product_sizes` / `product_flavors` | quais tamanhos e sabores cada pizza aceita (ex.: "Pizza doce" só sabores doces) |
| `crusts` + `crust_prices` | bordas com preço por tamanho |
| `extras` + `product_extras` | adicionais com preço próprio e em quais produtos podem ser usados |

Todas as tabelas têm `created_at`/`updated_at` (atualizado por gatilho) e
restrições que impedem preço negativo, promoção maior que o preço e
WhatsApp fora do formato só com dígitos (`55` + DDD + número).

## 4. Permissões e RLS

| Ação | Visitante | Logado não admin | Admin |
|---|---|---|---|
| Ler cardápio ativo e configurações públicas | ✅ | ✅ | ✅ |
| Ler itens desativados | ❌ | ❌ | ✅ |
| Criar/editar/excluir produtos, preços, categorias, configurações | ❌ | ❌ | ✅ |
| Enviar imagens ao bucket `menu-images` | ❌ | ❌ | ✅ |
| Ler a tabela `admins` | ❌ | só a própria linha (vazia) | só a própria linha |
| Inserir/alterar/apagar em `admins` | ❌ | ❌ | ❌ (só pelo SQL Editor) |

- RLS ligado em **todas** as tabelas; privilégios revogados e concedidos
  explicitamente (os padrões amplos do Supabase não valem).
- `is_admin()` é `security definer` com `search_path` vazio.
- Nenhum usuário consegue se tornar admin pelo navegador: não existe
  política de escrita em `admins`. O primeiro admin é cadastrado com um
  `insert` no SQL Editor do Supabase (passo a passo na ETAPA 8).
- Esconder a página `/admin` **não** é a proteção: mesmo com o painel
  aberto, o banco recusa gravações de quem não é admin (testado).

## 5. Regra de preço da pizza

Preço de uma pizza =
**preço dos sabores (pela regra)** + **borda do tamanho** + **soma dos adicionais**.

A regra para 2+ sabores fica em `store_settings.multi_flavor_rule` e é
escolhida pelo administrador:

| Valor | Cálculo | Exemplo (Grande: Mussarela R$ 50 + Frango R$ 56) |
|---|---|---|
| `maior` | preço do sabor mais caro | R$ 56,00 |
| `media` | média dos sabores, arredondada a centavos | R$ 53,00 |
| vazio | **pedido recusado** para pizzas com 2+ sabores até o admin escolher | — |

Se um sabor tiver preço promocional naquele tamanho, a regra usa o preço
promocional. Os valores do exemplo são fictícios. Se a pizzaria usar outra
regra (ex.: preço fixo por tamanho), dá para acrescentar uma nova opção.

## 6. Cálculo confiável e limitação do WhatsApp

- O carrinho no navegador guarda **apenas IDs, quantidades e escolhas**.
  Os preços exibidos e os da mensagem vêm da função
  `calculate_order` no banco, que valida produto, tamanho, limite de
  sabores, borda, adicionais, quantidade (1 a 99), bairro, pedido mínimo e
  se a loja está aceitando pedidos. Preços enviados pelo navegador são
  ignorados (testado).
- **Limitação:** a mensagem final é texto que o cliente pode editar no
  WhatsApp antes de enviar. A pizzaria deve conferir o total pelo próprio
  cardápio/painel antes de aceitar o pedido. Sem gateway de pagamento,
  nenhum valor é cobrado automaticamente.
- **Futuro pagamento online:** obrigatório gravar o pedido no servidor
  (Edge Function do Supabase), recalcular o total lá com a mesma regra e
  só então criar a cobrança. Nunca usar o total vindo do navegador.

## 7. O que foi verificado no site de referência

Lido diretamente: cabeçalho com nome, endereço com link de mapa, tempos de
entrega (20–40 min) e retirada (10 min), categorias navegáveis, busca e
cards com nome, descrição, imagem e preço "a partir de"; pizzas por
tamanho com "até 2 sabores"; promoção de esfiha por quantidade.

**Não verificado** (carregado por JavaScript): tela de escolha de
sabores, carrinho, checkout. O fluxo será desenhado a partir dos requisitos
e ajustado quando houver capturas de tela. Nenhum logotipo, imagem ou texto
da referência será copiado.

## 8. Testes desta etapa

`supabase/tests/run.sh` roda o esquema num PostgreSQL 16 local com um
simulador mínimo do Supabase (papéis `anon`/`authenticated`, `auth.uid()`
e `storage`). Resultado: **63 de 63 verificações passaram**.

- 28 de permissão/RLS: visitante, usuário comum e admin; tentativas de
  alterar preço, WhatsApp, categorias, imagens e de virar admin.
- 35 de preço e validação: regras `maior`/`media`/não configurada,
  promoção de sabor e de produto, adicionais, promoção por quantidade
  somando linhas, taxa por bairro, pedido mínimo, quantidades inválidas,
  sabores/tamanhos/adicionais não permitidos ou repetidos, produto
  indisponível, preço falso enviado pelo navegador.

Ainda falta rodar os mesmos SQL num projeto Supabase real (depende da sua
conta).

## 9. Pendências que dependem de você

1. Nome real da pizzaria, logo, endereço, horários, WhatsApp, bairros,
   taxas, formas de pagamento e preços (até lá: demonstração).
2. Qual regra de preço para 2+ sabores a pizzaria usa.
3. Repositório no GitHub para guardar o código.
4. Projeto no Supabase (URL e chave publicável).
5. Acesso à Hostinger e ao domínio (só na ETAPA 7).
6. Capturas de tela do fluxo de pedido da referência (opcional).
