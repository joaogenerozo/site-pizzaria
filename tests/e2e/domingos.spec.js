import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

// Cardápio real (supabase/seed_domingos.sql). Recria o banco com ele antes e
// volta para a demonstração depois, para não afetar os outros testes.
test.beforeAll(() => execSync('bash dev/reset-db.sh', { stdio: 'ignore', env: { ...process.env, SEED: 'domingos' } }));
test.afterAll(() => execSync('bash dev/reset-db.sh', { stdio: 'ignore' }));

let consoleErrors;
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(e.message));
});
test.afterEach(() => expect(consoleErrors, 'erros no console').toEqual([]));

const card = (page, name) => page.locator('.card').filter({ has: page.locator('.card-name', { hasText: new RegExp(`^${name}$`) }) });

test('cardápio real: 11 categorias, 51 sabores e preços por tamanho', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.section-title')).toHaveCount(11);
  await expect(page.locator('.card')).toHaveCount(51);
  await expect(card(page, 'Calabresa')).toHaveAttribute('aria-label', 'Calabresa, P R$ 37,00, M R$ 45,00, G R$ 55,00');
  await expect(card(page, 'Júlia')).toHaveAttribute('aria-label', /G R\$ 65,90/);
  for (const name of ['Lombo', 'Mussarela', 'Milho Especial', 'Frango Barbecue']) {
    await expect(card(page, name)).toContainText('Preço em confirmação');
  }
});

test('15. admin confirma o preço do Lombo e o cardápio passa a aceitar o pedido', async ({ page }) => {
  await page.goto('/admin/');
  await page.fill('#login-email', 'admin@teste.local');
  await page.fill('#login-password', 'senha-admin-local');
  await page.click('#login-submit');
  await page.evaluate(() => { location.hash = 'pizzas'; });
  const row = page.locator('.adm-table tr').filter({ has: page.locator('strong', { hasText: /^Lombo$/ }) });
  await expect(row).toContainText('Preço em confirmação');
  await page.getByLabel('Lombo P preço').fill('40,00');
  await page.getByRole('button', { name: 'Salvar preços' }).first().click();
  await expect(page.locator('.toast')).toHaveText('Preços salvos.');
  await row.getByRole('button', { name: 'Editar' }).click();
  await page.locator('#fld-price_review').uncheck();
  await page.click('#adm-save');
  await expect(page.locator('.toast')).toHaveText('Salvo.');
  await expect(row).not.toContainText('Preço em confirmação');

  // persiste no banco: outra página (visitante) já vê o preço confirmado
  await page.goto('/');
  await expect(card(page, 'Lombo')).toHaveAttribute('aria-label', 'Lombo, P R$ 40,00, M R$ 45,00, G R$ 55,90');
  await card(page, 'Lombo').click();
  await page.locator('label.opt', { hasText: /^P/ }).first().click();
  await page.locator('.sheet-foot .btn').click({ force: true });
  await expect(page.locator('.cart-count')).toHaveText('1');
});
