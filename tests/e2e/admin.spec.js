import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

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
