# Cardápio digital com pedidos pelo WhatsApp

Site estático (HTML, CSS e JavaScript gerados pelo Vite) para hospedagem comum
da Hostinger, com banco, login e permissões no **Supabase**. O cliente monta o
pedido e o envia pelo **WhatsApp** da pizzaria. Não há pagamento online nesta
versão.

- Cardápio público: `/`
- Painel administrativo: `/admin/`
- Arquitetura, banco, RLS e regra de preço: [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
- Registro das etapas e testes: [docs/ETAPAS.md](docs/ETAPAS.md)
- Checklist de lançamento: [docs/CHECKLIST-LANCAMENTO.md](docs/CHECKLIST-LANCAMENTO.md)
- Cardápio real da Domingo's Pizzas (sabores, preços em revisão, como atualizar): [docs/CARDAPIO-DOMINGOS.md](docs/CARDAPIO-DOMINGOS.md)

> **O que depende de você:** conta no Supabase, conta na Hostinger com o
> domínio, número de WhatsApp da pizzaria e os dados reais (nome, logo,
> endereço, horários, preços, bairros e taxas). Nada disso foi configurado
> ainda. Os dados de `supabase/seed_demo.sql` são **fictícios**.

---

## 1. Criar e configurar o projeto no Supabase

1. Acesse <https://supabase.com>, crie uma conta e clique em **New project**.
   Escolha a região **South America (São Paulo)** e guarde a senha do banco
   num gerenciador de senhas (ela **não** vai para o site).
2. Em **Project Settings → API** (ou **API Keys**), copie:
   - **Project URL** (ex.: `https://abcd1234.supabase.co`);
   - a chave **publishable** (`sb_publishable_…`) ou, em projetos antigos, a
     **anon public**.
   - **Nunca** copie para o site a chave `service_role`/**secret**.
3. Em **Authentication → Sign In / Providers**, mantenha **Email** ativo e
   **desligue "Allow new users to sign up"**. Assim ninguém cria conta sozinho.
   (Mesmo que crie, não vira administrador; isso só reduz lixo e abuso.)
4. Em **Authentication → URL Configuration**, coloque em **Site URL** o
   endereço do site (ex.: `https://www.suapizzaria.com.br`) e, em
   **Redirect URLs**, adicione o endereço do painel
   (ex.: `https://www.suapizzaria.com.br/admin/`). É para lá que volta o link
   do e-mail de "Esqueci minha senha".

## 2. Executar o SQL do banco (tabelas + RLS)

No Supabase, abra **SQL Editor → New query** e execute, **nesta ordem**,
o conteúdo de cada arquivo (copiar, colar, **Run**):

1. `supabase/schema.sql`: tabelas, restrições, RLS em todas as tabelas,
   políticas e as funções `calculate_order` e `menu_data` (o cardápio inteiro
   numa consulta só).
2. `supabase/storage.sql`: bucket público `menu-images` (leitura pública,
   envio só por administradores).
3. **Cardápio da Domingo's Pizzas:** `supabase/seed_domingos.sql` carrega os
   51 sabores, tamanhos P/M/G, bordas, adicionais, horário e WhatsApp do
   cardápio impresso (veja [docs/CARDAPIO-DOMINGOS.md](docs/CARDAPIO-DOMINGOS.md)).
   Ele **substitui** o cardápio que estiver no banco.
   Se você já tinha rodado uma versão antiga do `schema.sql`, rode antes
   `supabase/migrations/001_preco_em_confirmacao.sql` e
   `supabase/migrations/002_cardapio_numa_consulta.sql`.

   **Alternativa:** `supabase/seed_demo.sql` cria dados de demonstração
   (com aviso de "modo demonstração" no site). Se preferir começar vazio, não rode
   o seed. Nesse caso, crie a linha da loja com:

   ```sql
   insert into public.store_settings (id, name) values (1, 'Nome da pizzaria');
   ```

**Conferir o RLS:** em **Table Editor**, toda tabela deve mostrar
"RLS enabled". Em **Authentication → Policies** aparecem as políticas
`public_read`, `admin_insert`, `admin_update`, `admin_delete` e
`admins_select_self`. A tabela `admins` não tem política de escrita **de
propósito**.

## 3. Cadastrar o primeiro administrador com segurança

1. **Authentication → Users → Add user → Create new user**: e-mail e uma senha
   forte; marque **Auto Confirm User**.
2. Copie o **User UID** do usuário criado.
3. No **SQL Editor**, rode (trocando pelo UID):

   ```sql
   insert into public.admins (user_id) values ('COLE-O-UID-AQUI');
   ```

Para remover um administrador: `delete from public.admins where user_id = '…';`.
Cadastre **dois administradores** (por exemplo, o dono e um funcionário de
confiança). Quem esquecer a senha usa **"Esqueci minha senha"** na tela de
login do painel e recebe um link por e-mail para criar outra.
Administradores **não** conseguem promover ninguém pelo site. Só quem tem
acesso ao painel do Supabase consegue.

## 4. Configurar o WhatsApp e os dados da loja

1. Entre em `/admin/` com o administrador.
2. Aba **Dados da loja**: preencha nome, endereço, tempos, pedido mínimo,
   **regra de preço para 2+ sabores** e o **WhatsApp** no formato internacional
   só com números: `55` + DDD + número (ex.: `5535999999999`). Use o botão
   "Testar este número no WhatsApp".
3. Desmarque **Modo demonstração** quando os dados forem reais.
4. Cadastre categorias, produtos, tamanhos, sabores e preços por tamanho,
   bordas, adicionais, bairros/taxas, formas de pagamento e horários.
   Fotos enviadas pelo painel são reduzidas automaticamente (até 1600 px) antes
   do envio, e a foto antiga é apagada do Storage quando você troca ou exclui.
   Para trocar a demonstração pelos dados reais, rode o bloco
   "LIMPAR DEMONSTRAÇÃO" no fim de `supabase/seed_demo.sql`.

## 5. Testar localmente

Requisitos: Node.js 20 ou superior.

```bash
npm install
cp .env.example .env.local      # preencha com a URL e a chave publicável do SEU projeto
npm run dev                     # abre http://localhost:5173 e http://localhost:5173/admin/
npm test                        # testes de unidade (Vitest)
```

Também há um ambiente 100% local que imita o Supabase (PostgreSQL + PostgREST
+ login falso), usado nos testes automatizados. Veja `dev/README.md`. Com ele:

```bash
bash supabase/tests/run.sh                       # 85 testes de RLS e preço no banco
LOCAL_ANON_KEY=$(node dev/make-jwt.mjs anon) \
  npx playwright test                            # 68 testes no navegador (celular e desktop)
SEED=domingos bash dev/reset-db.sh               # abre o site local com o cardápio real
```

## 6. Gerar os arquivos de produção

1. Crie `.env.production.local` (não vai para o Git) com:

   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
   VITE_SITE_URL=https://www.suapizzaria.com.br
   ```

   `VITE_SITE_URL` é o endereço final do site (com `https://`, sem barra no
   fim). Ele é opcional, mas sem ele o link compartilhado no WhatsApp/Instagram
   sai sem a imagem de prévia (`og-image.png`) e o build não gera o
   `sitemap.xml` nem o endereço canônico, que ajudam o Google. Quando o domínio
   mudar, gere e envie o site de novo. Se a URL ou a chave do Supabase faltarem, o build **para
   com um erro** em vez de gerar um site que não carrega.

2. Rode `npm run build`. O resultado fica na pasta **`dist/`**:

   ```
   dist/
   ├── index.html        cardápio
   ├── admin/index.html  painel
   ├── assets/           JS e CSS com hash no nome
   ├── favicon.png       ícone da aba (símbolo da Domingo's)
   ├── apple-touch-icon.png  ícone ao salvar o site na tela do celular
   ├── og-image.png      imagem da prévia do link
   ├── robots.txt        regras para buscadores (o /admin/ fica de fora)
   ├── sitemap.xml       mapa do site para o Google (só com VITE_SITE_URL)
   └── .htaccess         HTTPS, cabeçalhos de segurança, cache e compressão
   ```

   Os caminhos são relativos: funciona na raiz do domínio ou numa subpasta.
   A chave publicável fica visível no JavaScript, **e isso é esperado**: a
   proteção é o RLS.

## 7. Enviar para a Hostinger

> **Ative o SSL antes de enviar** (passo 8.2). O `.htaccess` manda todo
> visitante para `https://`; se o certificado ainda não existir, o site fica
> inacessível até o SSL ficar pronto.

1. hPanel → **Sites → Gerenciar → Gerenciador de Arquivos** → abra `public_html`.
2. Apague a página padrão (`default.php`/`index.php`) se existir.
3. Envie **o conteúdo** da pasta `dist/` (não a pasta em si), incluindo o
   arquivo oculto `.htaccess`. Dica: compacte o conteúdo de `dist/` em `.zip`,
   envie e use **Extrair**.
4. Alternativa: FTP (hPanel → **Arquivos → Contas FTP**) com o FileZilla,
   enviando para `public_html/`.

## 8. Conectar o domínio e ativar HTTPS

1. **Domínio comprado na Hostinger:** já aponta para a hospedagem.
   **Comprado em outro lugar (ex.: Registro.br):** troque os servidores DNS para
   os da Hostinger (`ns1.dns-parking.com` e `ns2.dns-parking.com`, ou os que o
   hPanel mostrar em **Domínios**) ou crie um registro **A** apontando para o IP
   mostrado no hPanel. A propagação pode levar até 24–48 h.
2. hPanel → **Segurança → SSL** → instale o SSL gratuito no domínio (e no `www`).
3. O `.htaccess` já força HTTPS. Depois que o SSL estiver ativo, acesse
   `http://seudominio` e confirme que redireciona para `https://`.
4. Atualize o **Site URL** no Supabase (passo 1.4) com o domínio final.

## 9. Verificar depois de publicar

Siga [docs/CHECKLIST-LANCAMENTO.md](docs/CHECKLIST-LANCAMENTO.md). No mínimo:
o cardápio carrega, um pedido de teste chega no WhatsApp da pizzaria, o
`/admin/` pede login, uma alteração de preço aparece no site e não há erros
no console do navegador (F12).

### Aparecer no Google

- O site já sai pronto para buscadores: título e descrição, endereço canônico,
  `robots.txt`, `sitemap.xml`, dados da pizzaria em JSON-LD (endereço,
  telefone e horários vêm do painel) e textos alternativos nas imagens.
- O **domínio temporário** da Hostinger (`*.hostingersite.com`) é bloqueado
  para o Google pela própria Hostinger. O site só entra no Google depois de
  conectado a um domínio próprio (passo 8) e gerado com esse domínio em
  `VITE_SITE_URL`.
- Com o domínio no ar, cadastre o site no
  [Google Search Console](https://search.google.com/search-console), envie
  `https://seudominio/sitemap.xml` em **Sitemaps** e peça a indexação da
  página inicial. Crie também o **Perfil da Empresa no Google** com o mesmo
  endereço e telefone e o link do site.

## 10. Manter o Supabase ativo (plano grátis)

O plano grátis do Supabase **pausa o projeto depois de 7 dias sem uso**, e aí
o cardápio não carrega. Com clientes entrando todo dia isso não acontece, mas
no começo pode acontecer. O repositório tem uma tarefa automática
(`.github/workflows/supabase-ativo.yml`) que consulta o banco duas vezes por
semana. Para ligá-la, no GitHub: **Settings → Secrets and variables →
Actions → Variables → New repository variable** e crie:

- `SUPABASE_URL` = a Project URL;
- `SUPABASE_ANON_KEY` = a chave publicável (a mesma do site).

Se o Supabase não responder, a tarefa falha e o GitHub manda um e-mail
avisando. Se o projeto estiver pausado, entre em supabase.com e clique em
**Restore project**.

## Limitação de segurança dos valores (importante)

O site recalcula todos os preços **no banco** (`calculate_order`) a partir dos
IDs do carrinho. Preços salvos no navegador são ignorados. Porém a mensagem
final é um **texto que o cliente pode editar no WhatsApp** antes de enviar.
Por isso a pizzaria deve **conferir o total** pelo cardápio antes de aceitar
o pedido. Para pagamento online no futuro: gravar o pedido no servidor
(Edge Function), recalcular o total lá e só então criar a cobrança, nunca
usando valores vindos do navegador.
