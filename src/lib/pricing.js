// Estimativa de preço no navegador, espelhando public.calculate_order.
// Serve só para mostrar o valor enquanto o cliente monta o item; o valor
// usado no pedido é sempre o recalculado pelo banco (ver cart/checkout).

export const MULTI_FLAVOR_RULES = {
  maior: 'Pizzas com mais de um sabor são cobradas pelo sabor de maior valor.',
  media: 'Pizzas com mais de um sabor são cobradas pela média dos valores dos sabores.',
};

// selection: { productId, quantity, sizeId?, flavorIds?, crustId?, extraIds? }
export function priceItem(catalog, selection) {
  const errors = [];
  const product = catalog.products.get(selection.productId);
  if (!product) return { ok: false, errors: ['Produto indisponível.'] };

  const quantity = selection.quantity;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) errors.push('Quantidade inválida.');

  const extraIds = selection.extraIds || [];
  let extrasCents = 0;
  if (new Set(extraIds).size !== extraIds.length) errors.push('Adicional repetido.');
  for (const id of extraIds) {
    const extra = product.extras.find((e) => e.id === id);
    if (!extra) errors.push('Adicional indisponível.');
    else extrasCents += extra.priceCents;
  }

  let baseCents = 0;
  let crustCents = 0;

  if (product.kind === 'simple') {
    baseCents = product.promoCents ?? product.priceCents;
  } else {
    const size = product.sizes.find((s) => s.id === selection.sizeId);
    const flavorIds = selection.flavorIds || [];
    if (!size) {
      errors.push('Escolha o tamanho.');
    } else {
      if (flavorIds.length < 1) errors.push('Escolha ao menos um sabor.');
      if (flavorIds.length > size.max_flavors) errors.push(`Escolha no máximo ${size.max_flavors} sabor(es) para ${size.name}.`);
      if (new Set(flavorIds).size !== flavorIds.length) errors.push('Sabor repetido.');

      const rule = catalog.settings.multi_flavor_rule;
      if (flavorIds.length > 1 && !rule) {
        errors.push('A pizzaria ainda não definiu como cobra pizzas com mais de um sabor.');
      }

      const prices = [];
      for (const fid of flavorIds) {
        const allowed = product.flavors.some((f) => f.id === fid);
        const fp = allowed ? catalog.flavorPrice(fid, size.id) : null;
        if (!fp) errors.push('Sabor indisponível neste tamanho.');
        else prices.push(fp.effectiveCents);
      }
      if (prices.length) {
        baseCents = rule === 'media'
          ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
          : Math.max(...prices);
      }

      if (selection.crustId) {
        const cp = catalog.crustPrice(selection.crustId, size.id);
        if (cp === null || !catalog.crusts.has(selection.crustId)) errors.push('Borda indisponível neste tamanho.');
        else crustCents = cp;
      }
    }
  }

  const unitCents = baseCents + crustCents + extrasCents;
  if (!Number.isInteger(unitCents) || unitCents < 0) errors.push('Valor inválido.');

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    unitCents,
    lineCents: Number.isInteger(quantity) ? unitCents * quantity : NaN,
  };
}
