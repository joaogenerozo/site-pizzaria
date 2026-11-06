import { test, expect } from '@playwright/test';

// Experiência de compra: animações e retornos visuais não podem mudar itens, preços
// nem a mensagem do WhatsApp. Rodar com o banco local de demonstração (bash dev/reset-db.sh).

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
  await context.route(/wa\.me|whatsapp\.com/, (r) => { waUrl ??= r.request().url(); r.fulfill({ status: 200, body: 'ok' }); });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.card').first()).toBeVisible();
});
test.afterEach(() => expect(consoleErrors, 'erros no console').toEqual([]));

async function addSimple(page, name, qty = 1) {
  await page.locator('.card', { hasText: name }).first().click();
  for (let i = 1; i < qty; i++) await page.locator('dialog[open] .sheet-foot .qty button').nth(1).click();
  await page.locator('dialog[open] .sheet-foot .btn').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}

test('adicionar: check no botão, notificação que some, sacola pulsa e contador sobe', async ({ page }) => {
  await page.locator('.card', { hasText: 'Batata frita' }).click();
  const confirm = page.locator('dialog[open] .sheet-foot .btn');
  await confirm.click();
  await expect(confirm).toHaveClass(/is-done/); // check de confirmação
  const note = page.locator('.notify');
  await expect(note).toContainText('Produto adicionado à sacola!');
  await expect(note).toContainText('1 × Batata frita');
  await expect(note).toHaveAttribute('role', 'status');
  await expect(page.locator('.cart-count')).toHaveText('1');
  await expect(page.locator('#open-cart')).toContainText('Ver sacola');
  // segundo item: o ícone da sacola pulsa e o contador anima
  await addSimple(page, 'Batata frita', 2);
  await expect(page.locator('.cart-count')).toHaveText('3');
  await expect(page.locator('.cart-bag')).toHaveClass(/is-pulse/);
  await expect(page.locator('#open-cart')).toHaveAttribute('aria-label', 'Ver sacola: 3 itens, R$ 96,00');
  await expect(note).toHaveCount(0, { timeout: 6000 }); // some sozinha
});

test('toque duplo no Adicionar entra uma vez só', async ({ page }) => {
  await page.locator('.card', { hasText: 'Batata frita' }).click();
  await page.locator('dialog[open] .sheet-foot .btn').dblclick();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('.cart-count')).toHaveText('1');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cardapio-cart-v1')));
  expect(saved).toHaveLength(1);
  expect(saved[0].quantity).toBe(1);
});

test('sacola: aumentar, diminuir, remover, subtotal e continuar comprando', async ({ page }) => {
  await addSimple(page, 'Batata frita');
  await addSimple(page, 'Esfiha de carne', 3);
  await page.locator('#open-cart').click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.locator('.sheet-title')).toHaveText('Sua sacola');
  const items = sheet.locator('.cart-item');
  await expect(items).toHaveCount(2);
  await expect(items.locator('.cart-thumb')).toHaveCount(2);
  await expect(sheet.locator('.sheet-body')).not.toContainText('null'); // texto "null" aparecia embaixo do subtotal
  const subtotal = sheet.locator('.total-row');
  await expect(subtotal).toContainText('4 itens');
  const first = await subtotal.locator('span').last().textContent();

  await items.nth(0).getByRole('button', { name: 'Aumentar' }).click();
  await expect(items.nth(0).locator('output')).toHaveText('2');
  await expect(subtotal).toContainText('5 itens');
  expect(await subtotal.locator('span').last().textContent()).not.toBe(first);
  await expect(subtotal).toHaveClass(/is-updated/);

  // diminuir até zero remove o item (com animação de saída)
  await items.nth(0).getByRole('button', { name: 'Diminuir' }).click();
  await items.nth(0).getByRole('button', { name: /^Remover Batata/ }).first().click();
  await expect(items).toHaveCount(1);
  await expect(subtotal).toContainText('3 itens');

  await sheet.getByRole('button', { name: 'Continuar comprando' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('.cart-count')).toHaveText('3');

  // atualizar a página não perde a sacola
  await page.reload();
  await expect(page.locator('.cart-count')).toHaveText('3');
  await page.locator('#open-cart').click();
  await page.locator('dialog[open] .cart-item').getByRole('button', { name: /^Remover/ }).first().click();
  await expect(page.locator('dialog[open] .state h2')).toHaveText('Sua sacola está vazia');
  await expect(page.locator('#open-cart')).toHaveCount(0);
});

test('finalizar: pedido preparado (nunca "confirmado"), resumo e WhatsApp com os mesmos valores', async ({ page }) => {
  await addSimple(page, 'Batata frita', 2);
  await page.locator('#open-cart').click();
  await expect(page.locator('#go-details')).toHaveText('Finalizar pedido');
  await page.locator('#go-details').click();
  await expect(page.locator('dialog[open] .sheet-title')).toHaveText('Dados do pedido');
  // erro: botão balança e os campos mostram o motivo
  await page.locator('#go-review').click();
  await expect(page.locator('#go-review')).toHaveClass(/is-shake/);
  await page.locator('.segmented label', { hasText: 'Retirada' }).click();
  await page.locator('#f-name').fill('Ana');
  await page.locator('#f-phone').fill('35998765432');
  await opt(page, 'Pix').click();
  await expect(opt(page, 'Pix')).toHaveCSS('box-shadow', /inset/); // escolha destacada
  await page.locator('#go-review').click();

  const prepared = page.locator('.prepared');
  await expect(prepared).toContainText('Pedido preparado com sucesso!');
  await expect(prepared.locator('h3')).toHaveText('Seu pedido está quase pronto!');
  await expect(prepared).toContainText('Confira os detalhes e continue pelo WhatsApp para concluir seu pedido.');
  await expect(page.locator('dialog[open]')).not.toContainText(/pedido confirmado|pedido recebido/i);
  await expect(page.locator('dialog[open] .cart-item')).toContainText('2 × Batata frita');
  await expect(page.locator('dialog[open] .cart-item')).toContainText('R$ 32,00 cada');
  await expect(page.locator('.total-row.grand')).toContainText('R$ 64,00');
  await expect(page.locator('.notice').last()).toContainText('só está confirmado quando a pizzaria responder');

  const send = page.locator('#send-whatsapp');
  await expect(send).toHaveText('Enviar pedido pelo WhatsApp');
  const popup = page.context().waitForEvent('page');
  await send.click();
  await (await popup).waitForLoadState();
  const text = new URL(waUrl).searchParams.get('text');
  expect(text).toContain('2 × Batata frita');
  expect(text).toContain('TOTAL: R$ 64,00');
  await expect(page.locator('.state h2')).toHaveText('Confira o WhatsApp');
  await page.getByRole('button', { name: 'Já enviei, limpar sacola' }).click();
  await expect(page.locator('#open-cart')).toHaveCount(0);
});

test('com "reduzir movimento" no aparelho tudo funciona sem partículas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await addSimple(page, 'Batata frita');
  await expect(page.locator('.cart-count')).toHaveText('1');
  await page.locator('#open-cart').click();
  await page.locator('#go-details').click();
  await page.locator('.segmented label', { hasText: 'Retirada' }).click();
  await page.locator('#f-name').fill('Ana');
  await page.locator('#f-phone').fill('35998765432');
  await opt(page, 'Pix').click();
  await page.locator('#go-review').click();
  await expect(page.locator('.prepared')).toContainText('Pedido preparado com sucesso!');
  await expect(page.locator('.burst')).toHaveCount(0);
});

test('teclado: Esc fecha a janela e o foco volta para o card', async ({ page }) => {
  const open = page.locator('.card', { hasText: 'Batata frita' }).locator('.card-open');
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog[open] .sheet-title')).toHaveText('Batata frita');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(open).toBeFocused();
});

test('computador: sacola abre pela lateral direita', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'só no computador');
  await addSimple(page, 'Batata frita');
  await page.locator('#open-cart').click();
  const sheet = page.locator('dialog[open].cart-sheet');
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(400); // fim da animação de entrada
  const box = await sheet.boundingBox();
  const vp = page.viewportSize();
  expect(Math.round(box.x + box.width)).toBe(vp.width);
  expect(Math.round(box.height)).toBe(vp.height);
});
