import { test, expect } from '@playwright/test';

// Rodar com o banco local recém-criado (bash dev/reset-db.sh).

const opt = (page, name) => page.locator('label.opt').filter({
  has: page.locator('.opt-name', { hasText: new RegExp(`^${name}\\s*\\d?$`) }),
});

let consoleErrors;
let waUrl;
test.beforeEach(async ({ page, context }) => {
  consoleErrors = [];
  waUrl = null;
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  // o WhatsApp é externo: só registramos o link que seria aberto
  await context.route(/wa\.me|whatsapp\.com/, (r) => { waUrl ??= r.request().url(); r.fulfill({ status: 200, body: 'ok' }); });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.card').first()).toBeVisible();
});
test.afterEach(() => expect(consoleErrors, 'erros no console').toEqual([]));

async function addPizza(page, { size = 'Grande', flavors = ['Mussarela', 'Frango com catupiry'], crust, extras = [], qty = 1 } = {}) {
  await page.locator('.card', { hasText: 'Pizza salgada' }).click();
  await opt(page, size).click();
  for (const f of flavors) await opt(page, f).click();
  if (crust) await opt(page, crust).click();
  for (const e of extras) await opt(page, e).click();
  for (let i = 1; i < qty; i++) await page.locator('.sheet-foot .qty button').nth(1).click();
  await page.locator('.sheet-foot .btn').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}

test('1-3. carrega o cardápio com categorias, preços e aviso de demonstração', async ({ page }) => {
  await expect(page.locator('h1')).toHaveText('Pizzaria Demonstração');
  await expect(page.locator('.demo-banner')).toContainText('fictícios');
  await expect(page.locator('.cat-link')).toHaveText(['Promoções', 'Pizzas', 'Esfihas e combos', 'Porções', 'Bebidas', 'Rodízio', 'Doces']);
  await expect(page.locator('.card', { hasText: 'Anéis de cebola' })).toContainText('R$ 30,00');
  await expect(page.locator('.card', { hasText: 'Anéis de cebola' })).toContainText('R$ 26,00');
  await expect(page.locator('.card', { hasText: 'Pizza salgada' })).toContainText('a partir deR$ 30,00');
});

test('2. busca ignora acentos e mostra estado vazio', async ({ page }) => {
  await page.locator('#search').fill('aneis');
  await expect(page.locator('.card')).toHaveCount(1);
  await page.locator('#search').fill('calabresa'); // acha a pizza pelo sabor
  await expect(page.locator('.card', { hasText: 'Pizza salgada' })).toBeVisible();
  await page.locator('#search').fill('xyz123');
  await expect(page.locator('.state')).toContainText('Nada encontrado');
  await page.locator('.search-clear').click();
  await expect(page.locator('.section')).toHaveCount(7);
});

test('2. navegação por categoria rola até a seção', async ({ page }) => {
  await page.locator('.cat-link', { hasText: 'Bebidas' }).click();
  await expect(page.locator('.section', { hasText: 'Refrigerante' })).toBeInViewport();
});

test('4-5. personalização: tamanho, limite de sabores, borda, adicionais e preço', async ({ page }) => {
  await page.locator('.card', { hasText: 'Pizza salgada' }).click();
  const btn = page.locator('.sheet-foot .btn');
  await btn.click({ force: true }); // sem tamanho (botão marcado aria-disabled, mas mostra os erros)
  await expect(page.locator('.errors')).toContainText('Escolha o tamanho');
  await opt(page, 'Grande').click();
  await opt(page, 'Mussarela').click();
  await expect(btn).toContainText('R$ 50,00');
  await opt(page, 'Frango com catupiry').click();
  await expect(btn).toContainText('R$ 56,00'); // regra "maior"
  await expect(opt(page, 'Calabresa').locator('input')).toBeDisabled(); // limite de 2
  await opt(page, 'Catupiry').click();
  await opt(page, 'Bacon').click();
  await opt(page, 'Azeitona').click();
  await expect(btn).toContainText('R$ 75,00'); // 56 + 10 + 6 + 3
  await page.locator('.sheet-foot .qty button').nth(1).click();
  await expect(btn).toContainText('R$ 150,00');
  await opt(page, 'Broto').click(); // troca de tamanho recalcula
  await expect(btn).toContainText('R$ 102,00'); // (36 + 6 + 6 + 3) x 2
});

test('6-7. carrinho separa personalizações, edita e persiste ao recarregar', async ({ page }) => {
  await addPizza(page, { flavors: ['Mussarela'] });
  await addPizza(page, { flavors: ['Mussarela'] });               // igual: soma
  await addPizza(page, { flavors: ['Mussarela'], extras: ['Bacon'] }); // diferente: separa
  await page.reload();
  await page.locator('#open-cart').click();
  const items = page.locator('.cart-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0).locator('output')).toHaveText('2');
  await expect(items.nth(1)).toContainText('Adicionais: Bacon');
  await items.nth(0).getByRole('button', { name: 'Aumentar' }).click();
  await expect(items.nth(0).locator('output')).toHaveText('3');
  await items.nth(1).getByRole('button', { name: 'Editar' }).click();
  await opt(page, 'Calabresa').click();
  await page.locator('dialog[open] .sheet-foot .btn', { hasText: 'Salvar' }).click();
  await expect(items.nth(1)).toContainText('Sabores: Mussarela / Calabresa');
  await items.nth(1).getByRole('button', { name: /Remover/ }).first().click();
  await expect(items).toHaveCount(1);
  await expect(page.locator('.total-row')).toContainText('R$ 150,00');
});

test('7. preço adulterado no localStorage é ignorado', async ({ page }) => {
  await addPizza(page, { flavors: ['Mussarela'] });
  await page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem('cardapio-cart-v1'));
    items[0].price = 0.01; items[0].unitCents = 1; items[0].quantity = 2;
    localStorage.setItem('cardapio-cart-v1', JSON.stringify(items));
  });
  await page.reload();
  await expect(page.locator('#open-cart')).toContainText('R$ 100,00');
});

test('8-11. checkout: validação, taxa de entrega, desconto e mensagem do WhatsApp', async ({ page }) => {
  await addPizza(page, { flavors: ['Mussarela', 'Frango com catupiry'], crust: 'Catupiry', extras: ['Bacon'] });
  await page.locator('.card', { hasText: 'Esfiha de carne' }).click();
  for (let i = 0; i < 10; i++) await page.locator('.sheet-foot .qty button').nth(1).click();
  await page.locator('.sheet-foot .btn').click();

  await page.locator('#open-cart').click();
  await page.locator('#go-details').click();
  await page.locator('#go-review').click();
  for (const msg of ['Informe seu nome', 'telefone válido', 'Selecione o bairro', 'Informe a rua', 'Informe o número', 'forma de pagamento']) {
    await expect(page.locator('.field-error', { hasText: msg })).toBeVisible();
  }
  await page.locator('#f-name').fill('José Ação');
  await page.locator('#f-phone').fill('123');
  await page.locator('#f-zoneId').selectOption({ label: 'Bairro Demo Norte — R$ 7,00' });
  await page.locator('#f-street').fill('Rua São João & Cia');
  await page.locator('#f-number').fill('45');
  await opt(page, 'Dinheiro').click();
  await page.locator('label.opt', { hasText: 'Preciso de troco' }).click();
  await page.locator('#f-changeFor').fill('50');
  await page.locator('#go-review').click();
  await expect(page.locator('.field-error', { hasText: 'telefone válido' })).toBeVisible();
  await page.locator('#f-phone').fill('(35) 99876-5432');
  await page.locator('#go-review').click();
  await expect(page.locator('.field-error')).toContainText('troco precisa ser'); // 50 < total
  await page.locator('#f-changeFor').fill('200');
  await page.locator('#go-review').click();

  await expect(page.locator('.total-row.discount')).toContainText('- R$ 16,50');
  await expect(page.locator('.total-row', { hasText: 'Taxa' })).toContainText('R$ 7,00');
  await expect(page.locator('.total-row.grand')).toContainText('R$ 139,50'); // 72 + 77 - 16,50 + 7
  await expect(page.locator('.notice').last()).toContainText('só está confirmado quando a pizzaria responder');

  const popup = context_popup(page);
  await page.locator('#send-whatsapp').click();
  await (await popup).waitForLoadState();
  expect(waUrl).toMatch(/^https:\/\/wa\.me\/5511900000000\?text=/);
  const encoded = waUrl.split('?text=')[1];
  expect(encoded).not.toMatch(/[ \n&#<>ãçé—×]/);
  const text = new URL(waUrl).searchParams.get('text');
  expect(text).toContain('Cliente: José Ação');
  expect(text).toContain('Endereço: Rua São João & Cia, 45 - Bairro Demo Norte');
  expect(text).toContain('Sabores: Mussarela / Frango com catupiry');
  expect(text).toContain('TOTAL: R$ 139,50');
  expect(text).toContain('Troco para: R$ 200,00');
  await expect(page.locator('.state h2')).toHaveText('Confira o WhatsApp');
  await expect(page.locator('#open-cart')).toBeAttached(); // carrinho só é limpo quando o cliente confirma
});

function context_popup(page) {
  return page.context().waitForEvent('page');
}

test('9. retirada não cobra taxa e não pede endereço', async ({ page }) => {
  await page.locator('.card', { hasText: 'Batata frita' }).click();
  await page.locator('.sheet-foot .btn').click();
  await page.locator('#open-cart').click();
  await page.locator('#go-details').click();
  await page.locator('.segmented label', { hasText: 'Retirada' }).click();
  await expect(page.locator('#f-street')).toHaveCount(0);
  await page.locator('#f-name').fill('Ana');
  await page.locator('#f-phone').fill('35998765432');
  await opt(page, 'Pix').click();
  await page.locator('#go-review').click();
  await expect(page.locator('.total-row', { hasText: 'Taxa' })).toContainText('Retirada');
  await expect(page.locator('.total-row.grand')).toContainText('R$ 32,00');
});

test('16. sem rolagem horizontal e layout responsivo', async ({ page }) => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `largura ${width}`).toBeLessThanOrEqual(0);
  }
});

test('informações da loja abrem com horários e taxas', async ({ page }) => {
  await page.locator('.info-btn').click();
  await expect(page.locator('dialog[open]')).toContainText('Horário de funcionamento');
  await expect(page.locator('dialog[open]')).toContainText('Bairro Demo Centro');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});
