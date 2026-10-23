import { describe, it, expect } from 'vitest';
import { toCents, formatCents } from '../../src/lib/money.js';
import { openStatus, describeStatus } from '../../src/lib/hours.js';
import { createCart, sanitizeItem } from '../../src/lib/cart.js';
import { buildOrderMessage, whatsappLink, normalizeBrPhone, cleanText } from '../../src/lib/whatsapp.js';
import { buildCatalog } from '../../src/lib/catalog.js';
import { priceItem } from '../../src/lib/pricing.js';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('dinheiro', () => {
  it('converte para centavos sem erro de ponto flutuante', () => {
    expect(toCents('0.1') + toCents('0.2')).toBe(30);
    expect(toCents('19,90')).toBe(1990);
    expect(toCents('abc')).toBeNull();
    expect(toCents(null)).toBeNull();
  });
  it('formata em reais', () => {
    expect(formatCents(13750)).toBe('R$ 137,50');
    expect(formatCents(NaN)).toBe('—');
  });
});

describe('horário de funcionamento', () => {
  const hours = [{ weekday: 5, opens_at: '18:00:00', closes_at: '01:00:00' }]; // sexta, vira a meia-noite
  // 2026-10-23 é sexta-feira. Horários em UTC; São Paulo = UTC-3.
  it('aberto durante o turno', () => {
    expect(openStatus(hours, 'America/Sao_Paulo', new Date('2026-10-23T23:00:00Z')).open).toBe(true); // 20h
  });
  it('continua aberto depois da meia-noite', () => {
    expect(openStatus(hours, 'America/Sao_Paulo', new Date('2026-10-24T03:30:00Z')).open).toBe(true); // sáb 0h30
  });
  it('fechado e informa a próxima abertura', () => {
    const st = openStatus(hours, 'America/Sao_Paulo', new Date('2026-10-24T05:00:00Z')); // sáb 2h
    expect(st.open).toBe(false);
    expect(describeStatus(st)).toBe('Fechado · abre sexta às 18:00');
  });
  it('sem horários cadastrados', () => {
    expect(describeStatus(openStatus([], 'America/Sao_Paulo'))).toBe('Horário não informado');
  });
});

describe('carrinho', () => {
  const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
  const pizza = (flavors, extras = []) => ({ productId: id(1), quantity: 1, sizeId: id(2), flavorIds: flavors, extraIds: extras });

  it('junta itens idênticos e separa personalizações diferentes', () => {
    const cart = createCart(memory());
    cart.add(pizza([id(10), id(11)]));
    cart.add(pizza([id(11), id(10)])); // mesma pizza, ordem diferente
    cart.add(pizza([id(10)]));
    cart.add(pizza([id(10)], [id(20)]));
    expect(cart.items.map((i) => i.quantity)).toEqual([2, 1, 1]);
  });
  it('persiste e recarrega sem guardar preços', () => {
    const storage = memory();
    const a = createCart(storage);
    a.add({ ...pizza([id(10)]), price: 0.01, unitCents: 1 });
    const raw = storage.getItem('cardapio-cart-v1');
    expect(raw).not.toMatch(/price|Cents/);
    expect(createCart(storage).items).toHaveLength(1);
  });
  it('rejeita quantidades e dados inválidos', () => {
    for (const q of [0, -1, 1.5, '2', NaN, 100, Infinity]) {
      expect(sanitizeItem({ productId: id(1), quantity: q }), String(q)).toBeNull();
    }
    expect(sanitizeItem({ productId: '<script>', quantity: 1 })).toBeNull();
  });
  it('ignora localStorage corrompido ou adulterado', () => {
    const storage = memory();
    storage.setItem('cardapio-cart-v1', '{não é json');
    expect(createCart(storage).items).toEqual([]);
    storage.setItem('cardapio-cart-v1', JSON.stringify([{ productId: id(1), quantity: -5 }, { productId: id(1), quantity: 2, flavorIds: ['x', id(3)] }]));
    const items = createCart(storage).items;
    expect(items).toHaveLength(1);
    expect(items[0].flavorIds).toEqual([id(3)]);
  });
  it('altera quantidade, remove e limita ao máximo', () => {
    const cart = createCart(memory());
    cart.add(pizza([id(10)]));
    cart.setQuantity(0, 500);
    expect(cart.items[0].quantity).toBe(99);
    cart.setQuantity(0, 0);
    expect(cart.items).toHaveLength(0);
  });
  it('edição que fica igual a outro item soma as quantidades', () => {
    const cart = createCart(memory());
    cart.add(pizza([id(10)]));
    cart.add(pizza([id(11)]));
    cart.replace(1, pizza([id(10)]));
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(2);
  });
});

describe('preço no navegador', () => {
  const raw = {
    settings: { multi_flavor_rule: 'maior' },
    hours: [], payments: [], zones: [],
    categories: [{ id: id(100), name: 'Pizzas', active: true, sort_order: 1 }],
    products: [
      { id: id(1), category_id: id(100), kind: 'pizza', name: 'Pizza', available: true },
      { id: id(5), category_id: id(100), kind: 'simple', name: 'Batata', price: '32.00', promo_price: '29.90', available: true },
    ],
    sizes: [{ id: id(2), name: 'Grande', max_flavors: 2, active: true }],
    flavors: [{ id: id(10), name: 'A', active: true }, { id: id(11), name: 'B', active: true }, { id: id(12), name: 'C', active: true }],
    flavorPrices: [
      { flavor_id: id(10), size_id: id(2), price: '50.00', promo_price: null },
      { flavor_id: id(11), size_id: id(2), price: '56.00', promo_price: null },
      { flavor_id: id(12), size_id: id(2), price: '60.00', promo_price: '45.00' },
    ],
    productSizes: [{ product_id: id(1), size_id: id(2) }],
    productFlavors: [{ product_id: id(1), flavor_id: id(10) }, { product_id: id(1), flavor_id: id(11) }, { product_id: id(1), flavor_id: id(12) }],
    crusts: [{ id: id(30), name: 'Catupiry', active: true }],
    crustPrices: [{ crust_id: id(30), size_id: id(2), price: '10.00' }],
    extras: [{ id: id(20), name: 'Bacon', price: '6.00', active: true }],
    productExtras: [{ product_id: id(1), extra_id: id(20) }],
  };
  const sel = (o) => ({ productId: id(1), quantity: 1, sizeId: id(2), flavorIds: [id(10), id(11)], ...o });

  it('regra "maior" + borda + adicional', () => {
    const r = priceItem(buildCatalog(raw), sel({ crustId: id(30), extraIds: [id(20)], quantity: 2 }));
    expect(r.ok).toBe(true);
    expect(r.unitCents).toBe(7200);
    expect(r.lineCents).toBe(14400);
  });
  it('regra "media"', () => {
    const c = buildCatalog({ ...raw, settings: { multi_flavor_rule: 'media' } });
    expect(priceItem(c, sel()).unitCents).toBe(5300);
  });
  it('usa preço promocional do sabor', () => {
    expect(priceItem(buildCatalog(raw), sel({ flavorIds: [id(12)] })).unitCents).toBe(4500);
  });
  it('regra não definida bloqueia 2 sabores', () => {
    const c = buildCatalog({ ...raw, settings: { multi_flavor_rule: null } });
    expect(priceItem(c, sel()).ok).toBe(false);
    expect(priceItem(c, sel({ flavorIds: [id(10)] })).ok).toBe(true);
  });
  it('respeita limite de sabores e exige tamanho e sabor', () => {
    const c = buildCatalog(raw);
    expect(priceItem(c, sel({ flavorIds: [id(10), id(11), id(12)] })).ok).toBe(false);
    expect(priceItem(c, sel({ flavorIds: [] })).ok).toBe(false);
    expect(priceItem(c, sel({ sizeId: null })).ok).toBe(false);
  });
  it('produto simples usa promoção', () => {
    expect(priceItem(buildCatalog(raw), { productId: id(5), quantity: 3 }).lineCents).toBe(8970);
  });
});

describe('mensagem do WhatsApp', () => {
  const order = {
    customer: { name: 'José Ação', phone: '35998765432' },
    mode: 'delivery',
    address: { street: 'Rua São João', number: '10', complement: '', district: 'Centro', reference: 'Perto da praça' },
    payment: { name: 'Dinheiro', changeFor: 10000 },
    notes: 'Tocar a campainha\n2x',
    items: [{ quantity: 2, name: 'Pizza', size: 'Grande', flavors: ['Calabresa', 'Mussarela'], crust: null, extras: ['Bacon'], notes: 'sem cebola & <b>', unitCents: 5600, lineCents: 11200 }],
    subtotalCents: 11200, discountCents: 0, deliveryFeeCents: 500, totalCents: 11700,
  };
  it('monta o texto no formato combinado', () => {
    const msg = buildOrderMessage(order);
    expect(msg).toContain('NOVO PEDIDO — CARDÁPIO DIGITAL');
    expect(msg).toContain('Telefone: (35) 99876-5432');
    expect(msg).toContain('2 × Pizza\nTamanho: Grande\nSabores: Calabresa / Mussarela\nBorda: Sem borda\nAdicionais: Bacon');
    expect(msg).toContain('Valor do item: R$ 112,00 (R$ 56,00 cada)');
    expect(msg).toContain('TOTAL: R$ 117,00');
    expect(msg).toContain('Endereço: Rua São João, 10 - Centro');
    expect(msg).toContain('Troco para: R$ 100,00');
    expect(msg).toContain('Observações do pedido: Tocar a campainha 2x');
    expect(msg).not.toContain('Desconto');
  });
  it('codifica acentos e símbolos na URL e decodifica igual', () => {
    const msg = buildOrderMessage(order);
    const url = whatsappLink('5535999999999', msg);
    expect(url.startsWith('https://wa.me/5535999999999?text=')).toBe(true);
    expect(url.split('?text=')[1]).not.toMatch(/[ \n<>ãçé—×&#]/);
    expect(new URL(url).searchParams.get('text')).toBe(msg);
  });
  it('recusa número comercial inválido ou ausente', () => {
    expect(() => whatsappLink(null, 'x')).toThrow();
    expect(() => whatsappLink('(35) 9999-9999', 'x')).toThrow();
  });
  it('valida telefone do cliente', () => {
    expect(normalizeBrPhone('(35) 99876-5432')).toBe('35998765432');
    expect(normalizeBrPhone('+55 35 3333-4444')).toBe('3533334444');
    expect(normalizeBrPhone('12345')).toBeNull();
    expect(normalizeBrPhone('(00) 99876-5432')).toBeNull();
  });
  it('remove caracteres de controle do texto livre', () => {
    expect(cleanText('a\u0000b\n\nc   d')).toBe('a b c d');
  });
});
