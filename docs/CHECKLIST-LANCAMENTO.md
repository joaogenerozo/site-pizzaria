# Checklist de lançamento

Marque cada item **no site publicado**, num celular e num computador.

## Supabase
- [ ] Projeto criado na região São Paulo.
- [ ] `schema.sql` e `storage.sql` executados sem erro.
- [ ] Todas as tabelas com "RLS enabled".
- [ ] Cadastro público de usuários **desligado**.
- [ ] Primeiro administrador criado e inserido em `public.admins`.
- [ ] Nenhuma chave `service_role`/secret em arquivos do site ou do repositório.

## Dados reais
- [ ] Modo demonstração **desligado** e dados fictícios removidos.
- [ ] Nome, logo, endereço, link do mapa e telefone conferidos pela pizzaria.
- [ ] Horários de funcionamento conferidos (inclusive turnos após meia-noite).
- [ ] Regra de preço para 2+ sabores definida.
- [ ] Produtos, tamanhos, sabores, preços por tamanho, bordas e adicionais conferidos.
- [ ] Bairros, taxas e pedido mínimo conferidos.
- [ ] Formas de pagamento conferidas.
- [ ] WhatsApp no formato `55DDDNÚMERO`, testado pelo botão do painel.
- [ ] Fotos próprias (ou com direito de uso). Nada copiado do site de referência.

## Publicação
- [ ] `npm run build` com `.env.production.local` do projeto real (incluindo `VITE_SITE_URL` com o domínio final).
- [ ] Conteúdo de `dist/` (com `.htaccess`) em `public_html`.
- [ ] Domínio apontando para a Hostinger.
- [ ] SSL ativo; `http://` redireciona para `https://`.
- [ ] Site URL do Supabase = domínio final.

## Testes no site publicado
- [ ] Cardápio carrega; categorias e busca funcionam.
- [ ] Pizza com 1 e 2 sabores, borda e adicional: preço confere com a tabela da pizzaria.
- [ ] Carrinho mantém os itens ao recarregar a página.
- [ ] Pedido de **entrega** e de **retirada** de teste enviados ao WhatsApp real; a mensagem chega legível (acentos, R$, endereço).
- [ ] Total da mensagem confere com o total da revisão.
- [ ] `/admin/` sem login mostra só a tela de entrada.
- [ ] Login de administrador funciona; conta não administradora vê "Sem permissão".
- [ ] Alterar um preço no painel e ver a mudança no cardápio.
- [ ] Enviar uma foto pelo painel e vê-la no cardápio.
- [ ] Pausar pedidos ("Aceitando pedidos agora") mostra o aviso no carrinho e bloqueia o "Continuar".
- [ ] Link do site enviado num grupo de WhatsApp mostra "Domingo's Pizzas" e a imagem de prévia.
- [ ] Pedido de teste feito pelo navegador do Instagram (link na bio) abre o WhatsApp.
- [ ] Console do navegador (F12) sem erros.
- [ ] Teste em iPhone (Safari) e Android (Chrome).

## Operação
- [ ] A equipe sabe que o pedido só vale após responder o cliente no WhatsApp.
- [ ] A equipe confere o total antes de confirmar (o texto pode ser editado pelo cliente).
- [ ] Senha do administrador guardada com segurança; ative 2FA no Supabase e na Hostinger.
