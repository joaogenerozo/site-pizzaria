import { toCents } from './money.js';
import { nowInZone } from './hours.js';

// Transforma as linhas das tabelas num catálogo navegável.
// Visitantes já recebem só itens ativos (RLS), mas filtramos de novo aqui
// porque as tabelas de ligação (product_sizes etc.) são sempre públicas.
export function buildCatalog(raw) {
  const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name), 'pt-BR');

  const sizes = new Map(raw.sizes.filter((s) => s.active).map((s) => [s.id, s]));
  const flavors = new Map(raw.flavors.filter((f) => f.active).map((f) => [f.id, f]));
  const crusts = new Map(raw.crusts.filter((c) => c.active).map((c) => [c.id, c]));
  const extras = new Map(raw.extras.filter((e) => e.active).map((e) => [e.id, { ...e, priceCents: toCents(e.price) }]));

  // Promoção da semana: vale no dia de hoje no fuso da loja (o banco faz a mesma conta)
  const today = Number.isInteger(raw.today) ? raw.today : nowInZone(raw.settings?.timezone).weekday;
  const weeklyRows = (raw.weeklyPromos || []).filter((w) => w.active && flavors.has(w.flavor_id) && sizes.has(w.size_id));
  const weeklyToday = new Map(weeklyRows.filter((w) => w.weekday === today)
    .map((w) => [`${w.flavor_id}|${w.size_id}`, toCents(w.price)]));

  const flavorPrice = new Map(); // `${flavor}|${size}` -> { priceCents, promoCents, effectiveCents, weekly }
  for (const fp of raw.flavorPrices) {
    const key = `${fp.flavor_id}|${fp.size_id}`;
    const priceCents = toCents(fp.price);
    let promoCents = toCents(fp.promo_price);
    const weeklyCents = weeklyToday.get(key) ?? null;
    // Como no banco: só vale se for menor que o preço do sabor
    const weekly = weeklyCents !== null && weeklyCents < (promoCents ?? priceCents);
    if (weekly) promoCents = weeklyCents;
    flavorPrice.set(key, { priceCents, promoCents, effectiveCents: promoCents ?? priceCents, weekly });
  }
  const crustPrice = new Map(raw.crustPrices.map((cp) => [`${cp.crust_id}|${cp.size_id}`, toCents(cp.price)]));

  const group = (rows, key, val) => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r[key])) m.set(r[key], []);
      m.get(r[key]).push(r[val]);
    }
    return m;
  };
  const prodSizes = group(raw.productSizes, 'product_id', 'size_id');
  const prodFlavors = group(raw.productFlavors, 'product_id', 'flavor_id');
  const prodExtras = group(raw.productExtras, 'product_id', 'extra_id');

  const categories = raw.categories.filter((c) => c.active).sort(bySort);
  const activeCategoryIds = new Set(categories.map((c) => c.id));

  const products = raw.products
    .filter((p) => p.available && activeCategoryIds.has(p.category_id))
    .map((p) => {
      const product = {
        ...p,
        priceCents: toCents(p.price),
        promoCents: toCents(p.promo_price),
        qtyPromoMin: p.qty_promo_min,
        qtyPromoCents: toCents(p.qty_promo_price),
        extras: (prodExtras.get(p.id) || []).map((id) => extras.get(id)).filter(Boolean).sort(bySort),
        sizes: [],
        flavors: [],
      };
      if (p.kind === 'pizza') {
        product.sizes = (prodSizes.get(p.id) || []).map((id) => sizes.get(id)).filter(Boolean).sort(bySort);
        product.flavors = (prodFlavors.get(p.id) || []).map((id) => flavors.get(id)).filter(Boolean).sort(bySort);
        // Tamanho só aparece se ao menos um sabor tiver preço nele
        product.sizes = product.sizes.filter((s) => product.flavors.some((f) => flavorPrice.has(`${f.id}|${s.id}`)));
      }
      product.fromCents = startingPrice(product, flavorPrice);
      return product;
    })
    .filter((p) => p.kind === 'simple' || (p.sizes.length && p.flavors.length))
    .sort(bySort);

  // Promoções por dia, para a faixa "Promoção de hoje" e a tabela da semana.
  // Cada sabor aponta para o card dele (produto de um sabor só), quando existe.
  const singleProduct = new Map();
  for (const p of products) {
    if (p.kind === 'pizza' && p.flavors.length === 1 && !singleProduct.has(p.flavors[0].id)) singleProduct.set(p.flavors[0].id, p);
  }
  const weeklyPromos = [];
  for (const w of [...weeklyRows].sort((a, b) => a.weekday - b.weekday || bySort(a, b))) {
    const fp = flavorPrice.get(`${w.flavor_id}|${w.size_id}`);
    if (!fp) continue;
    weeklyPromos.push({
      weekday: w.weekday, flavor: flavors.get(w.flavor_id), size: sizes.get(w.size_id),
      priceCents: toCents(w.price), regularCents: fp.priceCents, product: singleProduct.get(w.flavor_id) || null,
      today: w.weekday === today && fp.weekly,
    });
  }

  return {
    settings: raw.settings,
    today,
    weeklyPromos,
    todayPromos: weeklyPromos.filter((w) => w.today),
    hours: raw.hours,
    payments: raw.payments.filter((p) => p.active).sort(bySort),
    zones: raw.zones.filter((z) => z.active).sort(bySort),
    categories: categories
      .map((c) => ({ ...c, products: products.filter((p) => p.category_id === c.id) }))
      .filter((c) => c.products.length),
    products: new Map(products.map((p) => [p.id, p])),
    sizes, flavors, crusts, extras,
    crustList: [...crusts.values()].sort(bySort),
    flavorPrice: (flavorId, sizeId) => flavorPrice.get(`${flavorId}|${sizeId}`) || null,
    crustPrice: (crustId, sizeId) => crustPrice.get(`${crustId}|${sizeId}`) ?? null,
  };
}

// Itens marcados com "preço em confirmação" não entram no "a partir de":
// o valor ainda não foi confirmado pela pizzaria. Sem nenhum preço confirmado → null.
function startingPrice(product, flavorPrice) {
  if (product.kind === 'simple') return product.price_review ? null : product.promoCents ?? product.priceCents;
  let min = null;
  for (const s of product.sizes) {
    for (const f of product.flavors) {
      const fp = flavorPrice.get(`${f.id}|${s.id}`);
      if (!fp || (f.price_review && !fp.weekly)) continue;
      if (min === null || fp.effectiveCents < min) min = fp.effectiveCents;
    }
  }
  return min;
}

// Bordas disponíveis para um tamanho (só as que têm preço nele)
export function crustsForSize(catalog, sizeId) {
  return catalog.crustList
    .map((c) => ({ ...c, priceCents: catalog.crustPrice(c.id, sizeId) }))
    .filter((c) => c.priceCents !== null);
}

// Texto legível das escolhas de um item do carrinho
export function describeSelection(catalog, item) {
  const product = catalog.products.get(item.productId);
  const size = item.sizeId ? catalog.sizes.get(item.sizeId) : null;
  return {
    name: product?.name ?? 'Produto indisponível',
    size: product?.kind === 'pizza' ? size?.name ?? null : null,
    flavors: (item.flavorIds || []).map((id) => catalog.flavors.get(id)?.name).filter(Boolean),
    crust: item.crustId ? catalog.crusts.get(item.crustId)?.name ?? null : null,
    extras: (item.extraIds || []).map((id) => catalog.extras.get(id)?.name).filter(Boolean),
    notes: item.notes || '',
  };
}

// Formato aceito por public.calculate_order (sem preços)
export function toOrderItems(items) {
  return items.map((i) => ({
    product_id: i.productId,
    quantity: i.quantity,
    size_id: i.sizeId,
    flavor_ids: i.flavorIds,
    crust_id: i.crustId,
    extra_ids: i.extraIds,
  }));
}
