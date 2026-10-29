import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

// Cardápio real (supabase/seed_domingos.sql). Recria o banco com ele antes e
// volta para a demonstração depois, para não afetar os outros testes.
// As promoções da semana dependem do dia: começam apagadas e o teste de promoção cria as de "hoje".
const sql = (q) => execSync(`psql -q -d dev -c "${q}"`, { stdio: 'ignore', env: { PGHOST: 'localhost', PGPORT: '5432', PGUSER: 'postgres', ...process.env } });
test.beforeAll(() => {
  execSync('bash dev/reset-db.sh', { stdio: 'ignore', env: { ...process.env, SEED: 'domingos' } });
  sql('delete from public.weekly_promotions');
});
test.afterAll(() => execSync('bash dev/reset-db.sh', { stdio: 'ignore' }));

let consoleErrors;
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(e.message));
});
test.afterEach(() => expect(consoleErrors, 'erros no console').toEqual([]));

const card = (page, name) => page.locator('.card').filter({ has: page.locator('.card-name', { hasText: new RegExp(`^${name}$`) }) });

test('cardápio real: 12 categorias, 52 sabores + meio a meio e preços por tamanho', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.section-title')).toHaveCount(12);
  await expect(page.locator('.section-title').first()).toHaveText('Pizza meio a meio');
  await expect(page.locator('.card')).toHaveCount(53);
  await expect(card(page, 'Pizza 2 sabores \\(meio a meio\\)')).toContainText('até 2 sabores');
  await expect(card(page, 'Calabresa').locator('.card-open')).toHaveAttribute('aria-label', 'Calabresa, P R$ 37,00, M R$ 45,00, G R$ 55,00');
  await expect(card(page, 'Júlia').locator('.card-open')).toHaveAttribute('aria-label', /G R\$ 65,90/);
  for (const name of ['Lombo', 'Mussarela', 'Milho Especial', 'Frango Barbecue']) {
    await expect(card(page, name)).toContainText('Preço em confirmação');
  }
});

test('meio a meio pelo sabor mais caro e pagamento por Pix, dinheiro e cartões', async ({ page, context }) => {
  let waUrl = null;
  await context.route(/wa\.me|whatsapp\.com/, (r) => { waUrl ??= r.request().url(); r.fulfill({ status: 200, body: 'ok' }); });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const opt = (name) => page.locator('label.opt').filter({ has: page.locator('.opt-name', { hasText: new RegExp(`^${name}\\s*\\d?$`) }) });

  await card(page, 'Pizza 2 sabores \\(meio a meio\\)').click();
  await opt('G').click();
  await expect(page.locator('.rule-note')).toHaveText('Pizzas com mais de um sabor são cobradas pelo sabor de maior valor.');
  await opt('Calabresa').click();
  await opt('Strogonoff de Boi').click();
  await expect(opt('Atum').locator('input')).toBeDisabled(); // no máximo 2
  await expect(page.locator('.sheet-foot .btn')).toContainText('R$ 70,00');
  await page.locator('.sheet-foot .btn').click();
  await expect(page.locator('#open-cart')).toContainText('R$ 70,00');

  await page.locator('#open-cart').click();
  await page.locator('#go-details').click();
  await page.locator('.segmented label', { hasText: 'Retirada' }).click();
  for (const name of ['Pix', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito']) await expect(opt(name)).toBeVisible();
  await expect(page.locator('label.opt', { hasText: 'combinar' })).toHaveCount(0);
  await page.locator('#f-name').fill('Maria');
  await page.locator('#f-phone').fill('(35) 99876-5432');
  await opt('Pix').click();
  await page.locator('#go-review').click();
  await expect(page.locator('.total-row.grand')).toContainText('R$ 70,00');
  const popup = page.context().waitForEvent('page');
  await page.locator('#send-whatsapp').click();
  await (await popup).waitForLoadState();
  const text = new URL(waUrl).searchParams.get('text');
  expect(text).toContain('Pizza 2 sabores (meio a meio)');
  expect(text).toContain('Sabores: Calabresa / Strogonoff de Boi');
  expect(text).toContain('Pagamento: Pix');
  expect(text).toContain('TOTAL: R$ 70,00');
});

test('taxa a combinar não aparece como grátis e sabor em confirmação explica no botão', async ({ page }) => {
  await page.goto('/');
  await page.locator('.info-btn').click();
  await expect(page.locator('dialog tr', { hasText: 'Entrega (taxa a combinar)' })).toContainText('A combinar');
  await expect(page.locator('dialog')).not.toContainText('Grátis');
  await page.keyboard.press('Escape');
  await card(page, 'Lombo').click();
  await expect(page.locator('.sheet-foot .btn')).toHaveText('Preço em confirmação');
  await page.locator('.sheet-foot .btn').click({ force: true });
  await expect(page.locator('.errors li')).toHaveCount(0);
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
  await expect(card(page, 'Lombo').locator('.card-open')).toHaveAttribute('aria-label', 'Lombo, P R$ 40,00, M R$ 45,00, G R$ 55,90');
  await card(page, 'Lombo').click();
  await page.locator('label.opt', { hasText: /^P/ }).first().click();
  await page.locator('.sheet-foot .btn').click({ force: true });
  await expect(page.locator('.cart-count')).toHaveText('1');
});

test('SEO: dados estruturados da pizzaria (JSON-LD) e link direto para uma categoria', async ({ page }) => {
  await page.goto('/#pizzas-doces');
  await expect(page.locator('section#pizzas-doces')).toBeInViewport();
  const ld = JSON.parse(await page.locator('script#ld-restaurant').textContent());
  expect(ld).toMatchObject({
    '@type': 'Restaurant',
    name: "Domingo's Pizzas",
    servesCuisine: 'Pizza',
    telephone: '+5535910243144',
    address: { streetAddress: 'Avenida Mario Lanzani, 261 - Vila Maganhoto', addressCountry: 'BR' },
  });
  // quarta a segunda, 18h às 22h (terça fechado)
  expect(ld.openingHoursSpecification).toHaveLength(6);
  expect(ld.openingHoursSpecification.map((d) => d.dayOfWeek)).not.toContain('https://schema.org/Tuesday');
  expect(ld.openingHoursSpecification[0]).toMatchObject({ opens: '18:00', closes: '22:00' });
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('.footer')).toContainText('Desde 2013');
});

test('promoção de hoje: faixa no topo, G por R$ 50 até o WhatsApp e sabor em confirmação liberado só no G', async ({ page, context }) => {
  const today = "extract(dow from now() at time zone 'America/Sao_Paulo')";
  sql(`insert into public.weekly_promotions (weekday, flavor_id, size_id, price, sort_order)
    select ${today}, f.id, s.id, 50, f.sort_order from public.pizza_flavors f, public.pizza_sizes s
    where s.name = 'G' and f.name in ('Mussarela', 'Siciliana')`);
  sql(`insert into public.weekly_promotions (weekday, flavor_id, size_id, price)
    select (${today}::int + 1) % 7, f.id, s.id, 40 from public.pizza_flavors f, public.pizza_sizes s where s.name = 'G' and f.name = 'Atum'`);
  try {
    let waUrl = null;
    await context.route(/wa\.me|whatsapp\.com/, (r) => { waUrl ??= r.request().url(); r.fulfill({ status: 200, body: 'ok' }); });
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('.promo-title')).toContainText('pizza G por R$ 50,00');
    await expect(page.locator('.promo-item')).toHaveText([/Siciliana.*R\$ 50,00/, /Mussarela.*R\$ 50,00/]);
    await expect(card(page, 'Siciliana')).toContainText('Promoção de hoje');
    await expect(card(page, 'Siciliana').locator('.card-open')).toHaveAttribute('aria-label', /M R\$ 55,00, G R\$ 59,00 R\$ 50,00/);
    await expect(card(page, 'Atum')).not.toContainText('Promoção de hoje'); // promoção de amanhã
    await expect(card(page, 'Mussarela')).not.toContainText('Preço em confirmação');

    // Mussarela (preço em confirmação) pela faixa: abre no G e só o G pode ser pedido
    await page.locator('.promo-item', { hasText: 'Mussarela' }).click();
    const opt = (name) => page.locator('label.opt').filter({ has: page.locator('.opt-name', { hasText: new RegExp(`^${name}$`) }) });
    await expect(opt('M').locator('input')).toBeDisabled();
    await expect(opt('G').locator('input')).toBeChecked();
    await expect(page.locator('.sheet-foot .btn')).toContainText('R$ 50,00');
    await page.locator('.sheet-foot .btn').click();
    await card(page, 'Siciliana').click();
    await opt('M').click();
    await expect(page.locator('.sheet-foot .btn')).toContainText('R$ 55,00');
    await opt('G').click();
    await expect(page.locator('.sheet-foot .btn')).toContainText('R$ 50,00');
    await page.locator('.sheet-foot .btn').click();
    await expect(page.locator('#open-cart')).toContainText('R$ 100,00');

    await page.locator('#open-cart').click();
    await page.locator('#go-details').click();
    await page.locator('.segmented label', { hasText: 'Retirada' }).click();
    await page.locator('#f-name').fill('Maria');
    await page.locator('#f-phone').fill('(35) 99876-5432');
    await opt('Pix').click();
    await page.locator('#go-review').click();
    await expect(page.locator('.total-row.grand')).toContainText('R$ 100,00');
    const popup = page.context().waitForEvent('page');
    await page.locator('#send-whatsapp').click();
    await (await popup).waitForLoadState();
    const text = new URL(waUrl).searchParams.get('text');
    expect(text).toContain('Valor do item: R$ 50,00 (promoção do dia)');
    expect(text).toContain('TOTAL: R$ 100,00');
  } finally {
    sql('delete from public.weekly_promotions');
  }
});

test('promoção de hoje: meio a meio com dois sabores da promoção por R$ 50', async ({ page }) => {
  const today = "extract(dow from now() at time zone 'America/Sao_Paulo')";
  sql(`insert into public.weekly_promotions (weekday, flavor_id, size_id, price, sort_order)
    select ${today}, f.id, s.id, 50, f.sort_order from public.pizza_flavors f, public.pizza_sizes s
    where s.name = 'G' and f.name in ('Portuguesa', 'Bacon', '4 Queijos')`);
  try {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('.promo-half')).toContainText('Adicione dois sabores da promoção por apenas R$ 50,00');
    await page.locator('.promo-half').click();
    // só o tamanho G e os sabores de hoje
    const group = (i) => page.locator('dialog .opt-group').nth(i);
    await expect(group(0).locator('.opt-name')).toHaveText(['G']);
    await expect(group(1).locator('.opt-name')).toHaveText([/^Bacon/, /^Portuguesa/, /^4 Queijos/]);
    await group(1).locator('label.opt', { hasText: 'Bacon' }).click();
    await group(1).locator('label.opt', { hasText: '4 Queijos' }).click();
    await expect(page.locator('.sheet-foot .btn')).toContainText('R$ 50,00');
    await page.locator('.sheet-foot .btn').click();
    await expect(page.locator('#open-cart')).toContainText('R$ 50,00');

    await page.locator('#open-cart').click();
    await page.locator('#go-details').click();
    await page.locator('.segmented label', { hasText: 'Retirada' }).click();
    await page.locator('#f-name').fill('Maria');
    await page.locator('#f-phone').fill('(35) 99876-5432');
    await page.locator('label.opt', { hasText: 'Pix' }).click();
    await page.locator('#go-review').click();
    await expect(page.locator('.total-row.grand')).toContainText('R$ 50,00');
  } finally {
    sql('delete from public.weekly_promotions');
  }
});

test('promoção de hoje com um sabor só não oferece o meio a meio', async ({ page }) => {
  const today = "extract(dow from now() at time zone 'America/Sao_Paulo')";
  sql(`insert into public.weekly_promotions (weekday, flavor_id, size_id, price)
    select ${today}, f.id, s.id, 50 from public.pizza_flavors f, public.pizza_sizes s where s.name = 'G' and f.name = 'Bacon'`);
  try {
    await page.goto('/');
    await expect(page.locator('.promo-item')).toHaveCount(1);
    await expect(page.locator('.promo-half')).toHaveCount(0);
  } finally {
    sql('delete from public.weekly_promotions');
  }
});
