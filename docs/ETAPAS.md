# Registro das etapas

## ETAPA 1 — Diagnóstico
- Projeto começa do zero (confirmado por João Paulo). Nenhum repositório ou pasta existente.
- Site de referência lido parcialmente; carrinho, escolha de sabores e checkout não foram visíveis (carregados por JavaScript).

## ETAPA 2 — Arquitetura, banco e segurança
**Arquivos:** `docs/ARQUITETURA.md`, `supabase/schema.sql`, `supabase/storage.sql`, `supabase/seed_demo.sql`, `supabase/tests/*`.
**Testes:** 63/63 no PostgreSQL 16 local com simulador do Supabase (28 de permissão/RLS, 35 de preço e validação).
**Pendente:** rodar os mesmos SQL num projeto Supabase real.

## ETAPA 3 — Cardápio público
**Arquivos:** `index.html`, `vite.config.js`, `package.json`, `src/lib/{dom,money,text,hours,catalog,pricing,supabase,api,icons}.js`, `src/public/{main,productModal}.js`, `src/styles/main.css`, `public/favicon.svg`, `dev/*` (ambiente local).
**Entregue:** topo com nome/logo/capa configuráveis, status aberto/fechado no fuso da loja, tempos de entrega e retirada, pedido mínimo, janela de informações (sobre, endereço, mapa, horários, taxas por bairro, pagamentos), busca sem acentos (inclui sabores), categorias com destaque automático ao rolar, cards com promoção, ilustrações próprias quando não há foto, carregamento/erro/vazio, aviso de demonstração, rodapé.
**Personalização de pizza:** tamanho, sabores com limite por tamanho e ordem, borda por tamanho, adicionais, observações, quantidade, preço atualizado e validação.

## ETAPA 4 — Carrinho e WhatsApp
**Arquivos:** `src/lib/{cart,whatsapp}.js`, `src/public/cartDrawer.js`.
**Entregue:** carrinho com quantidades, edição, remoção e persistência (sem preços); itens só se juntam quando todas as escolhas são iguais; dados do pedido com validação (nome, telefone com DDD, entrega/retirada, bairro, rua, número, complemento, referência, pagamento, troco ≥ total, observações); revisão com valores recalculados no banco (`calculate_order`); link `wa.me` com a mensagem codificada; o carrinho só é limpo quando o cliente confirma que enviou; aviso de que o pedido só vale após resposta da pizzaria; envio bloqueado enquanto o WhatsApp da loja não estiver cadastrado.

**Testes (ETAPAS 3 e 4):**
- 23 testes de unidade (Vitest): dinheiro, horários (inclusive virando a meia-noite), carrinho (agrupamento, persistência, adulteração do localStorage, quantidades inválidas), preços, mensagem e codificação do WhatsApp, telefone.
- 392 combinações de pizza/produto: preço do navegador idêntico ao do banco, nas regras "maior" e "média".
- 20 testes de navegador (Playwright, celular Pixel 7 e desktop 1280px): carregamento, busca, categorias, personalização, carrinho, persistência, preço adulterado ignorado, validação do endereço, taxa de entrega, desconto, mensagem do WhatsApp com acentos e símbolos, retirada, sem rolagem horizontal de 320 a 1440px, zero erros no console.
- XSS: produto cadastrado com `<img onerror>` e `<script>` aparece como texto e nada executa.
- Build de produção (`npm run build`) gera `dist/` sem erros.

**Pendências:** dados reais da loja; regra de preço de 2+ sabores; fotos dos produtos; teste do link num celular real com o número verdadeiro (depende do número).

## ETAPA 5 — Painel administrativo e login
**Arquivos:** `admin/index.html`, `src/admin/{main,crud,fields,views,ui}.js`, `src/styles/admin.css`, `dev/mock-auth.mjs` (login falso só para testes locais), `tests/e2e/admin.spec.js`.
**Entregue:** login por e-mail e senha (Supabase Auth); verificação de administrador pela função `is_admin()` do banco; tela "Sem permissão" para contas comuns; abas Produtos, Categorias, Pizzas (tamanhos, limite de sabores, sabores, bordas e tabelas de preço por tamanho com promoção), Adicionais, Entrega/pagamento/horários e Dados da loja (nome, logo, capa, WhatsApp com validação e botão de teste, endereço, mapa, tempos, pedido mínimo, regra de 2+ sabores, pausa de pedidos, modo demonstração). Criar, editar, excluir com confirmação, ativar/desativar e reordenar com setas. Envio de imagens ao Storage (JPG/PNG/WEBP até 2 MB).
**Segurança:** esconder o painel não é a proteção; o banco recusa gravações de quem não está em `admins`. Não existe forma de virar admin pelo navegador.
**Pendente:** o envio de imagem ao Storage só pode ser testado num projeto Supabase real (o ambiente local não tem Storage); recomenda-se desligar o cadastro público de usuários no Supabase (passo na documentação final).

## ETAPA 6 — Segurança, regras comerciais e responsividade
- Revisão: nenhuma chave secreta no código nem no `dist/` (varredura por `service_role`/segredos: nada encontrado); textos do banco sempre como texto (sem `innerHTML` com dados); links passam por filtro de protocolo; carrinho sem preços; preços recalculados no banco; `npm audit` sem vulnerabilidades (o Vitest foi atualizado para a 5.0.5, que corrige falhas nas ferramentas de teste; nada disso vai para o site).
- `public/.htaccess`: HTTPS obrigatório, HSTS, CSP (scripts só do próprio site, dados só do Supabase), `nosniff`, bloqueio de iframe, bloqueio de `.env`/`.sql`/`.md`.
- Testes acumulados: 63 no banco, 23 de unidade, 392 combinações de preço navegador × banco, 40 no navegador (celular e desktop), teste de XSS.

## ETAPA 7 — Build e preparação para a Hostinger
- `npm run build` gera `dist/` (index, admin, assets com hash, favicon, .htaccess) com caminhos relativos.
- Testado: build servido numa **subpasta** com a CSP aplicada; cardápio, carrinho e login do painel funcionaram sem nenhuma violação de CSP ou erro no console.

## ETAPA 8 — Documentação
- `README.md`: Supabase (projeto, SQL, RLS, primeiro admin, desligar cadastro), WhatsApp, teste local, build, envio à Hostinger, domínio, HTTPS e verificação.
- `docs/CHECKLIST-LANCAMENTO.md`: checklist completo para o dia da publicação.

## O que ainda NÃO foi feito (depende de contas/dados reais)
- Rodar o SQL num projeto Supabase real e testar login, RLS e envio de imagens lá.
- Publicar na Hostinger, apontar o domínio e ativar o SSL.
- Enviar um pedido real para o WhatsApp da pizzaria.
- Cadastrar os dados reais e desligar o modo demonstração.
**Por isso o projeto ainda não está pronto para produção.**
