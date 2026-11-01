import path from 'node:path';
import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { signJwt } from '../../dev/make-jwt.mjs';

// Usa o login falso de dev/mock-auth.mjs e o banco local recém-criado.
const ADMIN = ['admin@teste.local', 'senha-admin-local'];
const CLIENT = ['cliente@teste.local', 'senha-cliente-local'];
const REST = 'http://localhost:5173/rest/v1';

// Os testes do painel alteram o banco: recria antes e depois para não afetar os outros testes.
const resetDb = () => execSync('bash dev/reset-db.sh', { stdio: 'ignore' });
test.beforeAll(resetDb);
test.afterAll(resetDb);

let consoleErrors;
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 40[0-9]/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(e.message));
});
test.afterEach(() => expect(consoleErrors, 'erros no console').toEqual([]));

async function login(page, [email, password]) {
  await page.goto('/admin/');
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('#login-submit');
}

test('12. sem login o painel só mostra a tela de entrada', async ({ page }) => {
  await page.goto('/admin/#produtos');
  await expect(page.locator('#login-email')).toBeVisible();
  await expect(page.locator('.adm-table')).toHaveCount(0);
});

test('13. login com senha errada é recusado', async ({ page }) => {
  await login(page, [ADMIN[0], 'errada']);
  await expect(page.locator('.errors')).toHaveText('E-mail ou senha incorretos.');
});

test('esqueci minha senha: pede o link sem revelar se o e-mail existe', async ({ page }) => {
  await page.goto('/admin/');
  await page.fill('#login-email', ADMIN[0]);
  await page.click('#forgot');
  await expect(page.locator('#forgot-email')).toHaveValue(ADMIN[0]);
  await page.click('#forgot-submit');
  await expect(page.locator('.adm-login [role=status]')).toContainText('o link chega em alguns minutos');
  await page.getByRole('button', { name: 'Voltar para o login' }).click();
  await expect(page.locator('#login-email')).toBeVisible();
});

test('link do e-mail abre a tela de senha nova e depois entra no painel', async ({ page }) => {
  const token = signJwt({ sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated', email: ADMIN[0], aud: 'authenticated' });
  await page.goto(`/admin/#access_token=${token}&refresh_token=refresh-${ADMIN[0]}&expires_in=3600&expires_at=${Math.floor(Date.now() / 1000) + 3600}&token_type=bearer&type=recovery`);
  await expect(page.locator('#new-password')).toBeVisible();
  await page.fill('#new-password', 'nova-senha-123');
  await page.fill('#new-password-2', 'outra-coisa-123');
  await page.click('#new-password-submit');
  await expect(page.locator('.errors')).toHaveText('As duas senhas não são iguais.');
  await page.fill('#new-password-2', 'nova-senha-123');
  await page.click('#new-password-submit');
  await expect(page.locator('.adm-table').first()).toBeVisible();
  expect(page.url()).not.toContain('access_token');
});

test('link de redefinição expirado volta ao login com aviso', async ({ page }) => {
  await page.goto('/admin/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await expect(page.locator('.errors')).toContainText('expirou');
  await expect(page.locator('#login-email')).toBeVisible();
});

test('13. usuário logado que não é admin não entra no painel', async ({ page }) => {
  await login(page, CLIENT);
  await expect(page.locator('h1')).toHaveText('Sem permissão');
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.locator('#login-email')).toBeVisible();
});

test('15. escrita direta na API é recusada para visitante e para usuário comum', async ({ request }) => {
  // a chave pública (anon) é a mesma que qualquer visitante encontra no site
  const anon = process.env.LOCAL_ANON_KEY;
  test.skip(!anon, 'defina LOCAL_ANON_KEY');
  const headers = { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

  let r = await request.patch(`${REST}/products?name=eq.Batata%20frita`, { headers, data: { price: 0.01 } });
  expect(r.status(), 'visitante altera preço').toBe(401);
  r = await request.post(`${REST}/admins`, { headers, data: { user_id: '22222222-2222-2222-2222-222222222222' } });
  expect(r.status(), 'visitante vira admin').toBe(401);

  // usuário comum autenticado
  const tok = await (await request.post('http://localhost:5173/auth/v1/token?grant_type=password', { data: { email: CLIENT[0], password: CLIENT[1] } })).json();
  const uh = { ...headers, Authorization: `Bearer ${tok.access_token}` };
  r = await request.patch(`${REST}/products?name=eq.Batata%20frita`, { headers: uh, data: { price: 0.01 } });
  expect(await r.json(), 'comum altera preço: nenhuma linha').toEqual([]);
  r = await request.post(`${REST}/admins`, { headers: uh, data: { user_id: '22222222-2222-2222-2222-222222222222' } });
  expect(r.status(), 'comum vira admin').toBe(403);
  r = await request.patch(`${REST}/store_settings?id=eq.1`, { headers: uh, data: { whatsapp_number: '5500000000000' } });
  expect(await r.json()).toEqual([]);
  r = await request.post(`${REST}/categories`, { headers: uh, data: { name: 'hack' } });
  expect(r.status()).toBe(403);

  // o preço continua o original
  r = await request.get(`${REST}/products?name=eq.Batata%20frita&select=price`, { headers });
  expect((await r.json())[0].price).toBe(32);
});

test('14. admin altera preço e o cardápio mostra o novo valor', async ({ page }) => {
  await login(page, ADMIN);
  const row = page.locator('.adm-table tr', { hasText: 'Batata frita' });
  await row.getByRole('button', { name: 'Editar' }).click();
  await page.fill('#fld-price', '-5');
  await page.click('#adm-save');
  await expect(page.locator('dialog .field-error:not([hidden])')).toContainText('Valor inválido');
  await page.fill('#fld-price', '34,50');
  await page.fill('#fld-promo_price', '40');
  await page.click('#adm-save');
  await expect(page.locator('dialog .errors')).toContainText('menor que o preço normal');
  await page.fill('#fld-promo_price', '');
  await page.click('#adm-save');
  await expect(page.locator('.toast')).toHaveText('Salvo.');
  await expect(row).toContainText('R$ 34,50');
  await page.goto('/');
  await expect(page.locator('.card', { hasText: 'Batata frita' })).toContainText('R$ 34,50');
});

test('admin cria, desativa e exclui produto com confirmação', async ({ page }) => {
  await login(page, ADMIN);
  await page.getByRole('button', { name: 'Novo' }).click();
  await page.fill('#fld-name', 'Guaraná lata');
  await page.selectOption('#fld-category_id', { label: 'Bebidas' });
  await page.fill('#fld-price', '6');
  await page.click('#adm-save');
  const row = page.locator('.adm-table tr', { hasText: 'Guaraná lata' });
  await expect(row).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.card', { hasText: 'Guaraná lata' })).toContainText('R$ 6,00');

  await page.goto('/admin/');
  await row.locator('input.switch').uncheck();
  await expect(page.locator('.toast')).toHaveText('Desativado.');
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  await expect(page.locator('.card', { hasText: 'Guaraná lata' })).toHaveCount(0);

  await page.goto('/admin/');
  await row.getByRole('button', { name: 'Excluir' }).click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Excluir' }).click();
  await page.click('#cf-ok');
  await expect(row).toHaveCount(0);
});

test('admin cria pizza nova com tamanhos e sabores', async ({ page }) => {
  await login(page, ADMIN);
  await page.getByRole('button', { name: 'Novo' }).click();
  await page.fill('#fld-name', 'Pizza especial');
  await page.selectOption('#fld-category_id', { label: 'Pizzas' });
  await page.selectOption('#fld-kind', 'pizza');
  await expect(page.locator('#fld-price')).toBeHidden();
  await page.click('#adm-save');
  await expect(page.locator('dialog .errors')).toContainText('ao menos um tamanho e um sabor');
  await page.locator('#fld-size_ids label', { hasText: 'Grande' }).click();
  await page.locator('#fld-flavor_ids label', { hasText: 'Calabresa' }).click();
  await page.click('#adm-save');
  await expect(page.locator('.adm-table tr', { hasText: 'Pizza especial' })).toContainText('pelos sabores');
  await page.goto('/');
  await expect(page.locator('.card', { hasText: 'Pizza especial' })).toContainText('R$ 45,00');
});

test('admin altera preço de sabor por tamanho e valida promoção', async ({ page }) => {
  await login(page, ADMIN);
  await page.goto('/admin/#pizzas');
  const price = page.getByLabel('Mussarela Grande preço');
  const promo = page.getByLabel('Mussarela Grande promoção');
  await price.fill('52,00');
  await promo.fill('60');
  await page.getByRole('button', { name: 'Salvar preços' }).first().click();
  await expect(page.locator('.adm-card .errors').first()).toContainText('promoção precisa ser menor');
  await promo.fill('');
  await page.getByRole('button', { name: 'Salvar preços' }).first().click();
  await expect(page.locator('.toast')).toHaveText('Preços salvos.');
  await expect(page.getByLabel('Mussarela Grande preço')).toHaveValue('52,00');
});

test('admin configura WhatsApp com validação e regra de sabores', async ({ page }) => {
  await login(page, ADMIN);
  await page.goto('/admin/#loja');
  await page.fill('#fld-whatsapp_number', '(35) 9999-99');
  await page.click('#save-settings');
  await expect(page.locator('.adm-field', { has: page.locator('#fld-whatsapp_number') }).locator('.field-error')).toContainText('formato internacional');
  await page.fill('#fld-whatsapp_number', '+55 (35) 98888-7777');
  await page.selectOption('#fld-multi_flavor_rule', 'media');
  await page.click('#save-settings');
  await expect(page.locator('.toast')).toHaveText('Dados da loja salvos.');
  await page.reload();
  await expect(page.locator('#fld-whatsapp_number')).toHaveValue('5535988887777');
  await expect(page.locator('#fld-multi_flavor_rule')).toHaveValue('media');
});

test('admin cadastra horário, bairro e forma de pagamento', async ({ page }) => {
  await login(page, ADMIN);
  await page.goto('/admin/#entrega');
  const zones = page.locator('.adm-card', { hasText: 'Bairros e taxas' });
  await zones.getByRole('button', { name: 'Novo' }).click();
  await page.fill('#fld-name', 'Vila Nova');
  await page.fill('#fld-fee', '9,50');
  await page.click('#adm-save');
  await expect(zones.locator('tr', { hasText: 'Vila Nova' })).toContainText('R$ 9,50');

  const hours = page.locator('.adm-card', { hasText: 'Horários de funcionamento' });
  await hours.getByRole('button', { name: 'Novo' }).click();
  await page.selectOption('#fld-weekday', '1');
  await page.fill('#fld-opens_at', '18:00');
  await page.fill('#fld-closes_at', '18:00');
  await page.click('#adm-save');
  await expect(page.locator('dialog .errors')).toContainText('não podem ser iguais');
  await page.fill('#fld-closes_at', '01:00');
  await page.click('#adm-save');
  await expect(hours.locator('tr', { hasText: 'Segunda' })).toContainText('01:00');
});

const FIX = (name) => path.join(import.meta.dirname, 'fixtures', name);

test('imagem de um produto: prévia antes de salvar, cancelar não grava, salvar grava miniatura e texto alternativo', async ({ page }) => {
  resetDb();
  await login(page, ADMIN);
  await page.click('a[href="#imagens"]');
  await expect(page.locator('#photo-summary')).toHaveText(/^0 de \d+ produtos com imagem\.$/);
  const tile = page.locator('.adm-photo[data-name="Batata frita"]');
  await expect(tile.locator('label.btn')).toHaveText('Adicionar imagem');
  await expect(tile.locator('.tag-warn')).toHaveText('Sem imagem');

  // escolhe a foto e desiste: nada muda
  await tile.locator('input[type=file]').setInputFiles(FIX('batata-frita.jpg'));
  await expect(page.locator('#rep-preview')).toBeVisible();
  await expect(page.locator('#rep-info')).toContainText('1800×1200 px');
  await expect(page.locator('#rep-info')).toContainText('1200×800 px');
  await page.click('#rep-cancel');
  await expect(page.locator('#rep-t')).toHaveCount(0);
  await expect(tile.locator('.tag-warn')).toHaveText('Sem imagem');

  // agora salva, com texto alternativo próprio
  await tile.locator('input[type=file]').setInputFiles(FIX('batata-frita.jpg'));
  await expect(page.locator('#rep-ok')).toBeEnabled();
  await page.fill('#rep-alt', 'Porção de batata frita crocante');
  await page.click('#rep-ok');
  await expect(page.locator('.toast')).toHaveText('Imagem de “Batata frita” salva.');
  await expect(page.locator('#photo-summary')).toHaveText(/^1 de \d+ produtos com imagem\.$/);
  await expect(tile.locator('label.btn')).toHaveText('Trocar imagem');
  await expect(tile.locator('img')).toHaveAttribute('src', /\/produtos\/batata-frita-[a-z0-9]{6}-mini\.webp$/);
  await expect(tile.locator('.adm-alt input')).toHaveValue('Porção de batata frita crocante');

  // visualizar abre a imagem grande
  await tile.getByRole('button', { name: 'Visualizar', exact: true }).click();
  await expect(page.locator('#view-img')).toHaveAttribute('src', /\/produtos\/batata-frita-[a-z0-9]{6}\.webp$/);
  await expect(page.locator('.adm-viewer')).toContainText('Texto alternativo: Porção de batata frita crocante');
  await page.getByRole('button', { name: 'Fechar', exact: true }).last().click();

  // o cardápio mostra a miniatura com o texto alternativo
  const pub = await page.context().newPage();
  await pub.goto('/');
  const img = pub.locator('.card', { hasText: 'Batata frita' }).locator('img.thumb');
  await expect(img).toHaveAttribute('alt', 'Porção de batata frita crocante');
  await expect(img).toHaveAttribute('src', /-mini\.webp$/);
  expect(await img.evaluate((el) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  await pub.close();

  // remover: some do produto, mas continua na biblioteca
  await tile.getByRole('button', { name: 'Remover imagem de Batata frita' }).click();
  await page.click('#rm-ok');
  await expect(page.locator('.toast')).toHaveText('Imagem de “Batata frita” removida.');
  await expect(tile.locator('.tag-warn')).toHaveText('Sem imagem');
  await page.click('#seg-biblioteca');
  await expect(page.locator('#photo-summary')).toHaveText('1 imagem na biblioteca. 1 está sem produto.');
});

test('várias imagens: associa pelo nome, pede escolha na dúvida, recusa arquivo falso e mostra o progresso', async ({ page }) => {
  resetDb();
  await login(page, ADMIN);
  await page.click('a[href="#imagens"]');
  await page.locator('#photo-bulk').setInputFiles([
    FIX('Esfiha de queijo.png'), FIX('esfiha.webp'), FIX('logo-antiga.jpg'), FIX('nao-e-imagem.jpg')]);
  const row = (name) => page.locator(`.adm-bulk-row[data-file="${name}"]`);
  await expect(row('Esfiha de queijo.png').locator('.adm-match')).toContainText('Nome igual ao do produto');
  await expect(row('Esfiha de queijo.png').locator('select')).toHaveValue(/.+/);
  // "esfiha" serve para duas esfihas: não escolhe sozinho e não deixa enviar
  await expect(row('esfiha.webp').locator('.adm-match')).toContainText('Mais de um produto possível');
  await expect(row('esfiha.webp').locator('select')).toHaveValue('');
  await expect(row('logo-antiga.jpg').locator('select')).toHaveValue('__biblioteca__');
  // conteúdo não é imagem (executável com extensão .jpg): fica de fora
  await expect(row('nao-e-imagem.jpg')).toHaveClass(/error/);
  await expect(row('nao-e-imagem.jpg')).toContainText('não é uma imagem JPG, PNG, WebP ou AVIF');
  await expect(page.locator('#bulk-ok')).toBeDisabled();
  await expect(page.locator('#bulk-note')).toContainText('1 precisa que você escolha o produto');

  // escolher a mesma esfiha das duas linhas também bloqueia
  await row('esfiha.webp').locator('select').selectOption({ label: 'Esfiha de queijo' });
  await expect(page.locator('#bulk-ok')).toBeDisabled();
  await expect(page.locator('#bulk-note')).toContainText('dois arquivos estão no mesmo produto');
  await row('esfiha.webp').locator('select').selectOption({ label: 'Esfiha de carne' });
  await expect(page.locator('#bulk-ok')).toHaveText('Enviar 3 imagens');
  await page.click('#bulk-ok');
  await expect(page.locator('#bulk-cancel')).toHaveText('Fechar');
  await expect(page.locator('#bulk-note')).toHaveText('3 imagens salvas.');
  await expect(row('Esfiha de queijo.png').locator('.adm-bulk-state')).toHaveText('Salva em Esfiha de queijo');
  await expect(row('esfiha.webp').locator('.adm-bulk-state')).toHaveText('Salva em Esfiha de carne');
  await expect(row('logo-antiga.jpg').locator('.adm-bulk-state')).toHaveText('Guardada na biblioteca');
  await page.click('#bulk-cancel');
  await expect(page.locator('#photo-summary')).toHaveText(/^2 de \d+ produtos com imagem\./);

  // biblioteca: a sem produto aparece e pode ser associada depois
  await page.click('#seg-biblioteca');
  await expect(page.locator('#photo-summary')).toHaveText('3 imagens na biblioteca. 1 está sem produto.');
  await page.check('#lib-orphans');
  const orphan = page.locator('.adm-photo[data-name="logo-antiga.jpg"]');
  await expect(orphan.locator('.tag-warn')).toHaveText('Sem produto');
  await orphan.getByRole('button', { name: 'Associar' }).click();
  await page.selectOption('#assign-product', { label: 'Esfiha de queijo' });
  await expect(page.locator('#assign-warn')).toContainText('já tem imagem');
  await page.click('#assign-ok');
  await expect(page.locator('.toast')).toHaveText('Imagem associada a “Esfiha de queijo”.');
  // a foto que saiu da esfiha virou "sem produto" e pode ser excluída de vez
  const old = page.locator('.adm-photo[data-name="Esfiha de queijo.png"]');
  await expect(old.locator('.tag-warn')).toHaveText('Sem produto');
  await old.getByRole('button', { name: 'Excluir' }).click();
  await page.click('#rm-ok');
  await expect(page.locator('.toast')).toHaveText('Imagem excluída.');
  await page.uncheck('#lib-orphans');
  await expect(page.locator('#photo-summary')).toHaveText('2 imagens na biblioteca.');
});

test('imagens: visitante e usuário comum não enviam arquivos nem leem a biblioteca', async ({ request }) => {
  const anon = process.env.LOCAL_ANON_KEY;
  test.skip(!anon, 'defina LOCAL_ANON_KEY');
  const STORAGE = 'http://localhost:5173/storage/v1/object/menu-images/produtos/teste.webp';
  const body = { headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'image/webp' }, data: Buffer.from('RIFF0000WEBPVP8 ') };
  expect((await request.post(STORAGE, body)).status(), 'visitante envia imagem').toBe(403);
  let r = await request.get(`${REST}/media_images`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
  expect(r.status(), 'visitante lê a biblioteca').toBe(401);
  const tok = await (await request.post('http://localhost:5173/auth/v1/token?grant_type=password', { data: { email: CLIENT[0], password: CLIENT[1] } })).json();
  const uh = { apikey: anon, Authorization: `Bearer ${tok.access_token}` };
  expect((await request.post(STORAGE, { ...body, headers: { ...body.headers, ...uh } })).status(), 'comum envia imagem').toBe(403);
  r = await request.get(`${REST}/media_images`, { headers: uh });
  expect(await r.json(), 'comum não vê a biblioteca').toEqual([]);
  r = await request.post(`${REST}/media_images`, { headers: { ...uh, 'Content-Type': 'application/json' }, data: { path: 'x.webp', url: 'https://x/x.webp', mime: 'image/webp' } });
  expect(r.status(), 'comum grava na biblioteca').toBe(403);
});
