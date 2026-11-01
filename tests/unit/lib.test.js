import { describe, it, expect } from 'vitest';
import { toCents, formatCents } from '../../src/lib/money.js';
import { openStatus, describeStatus } from '../../src/lib/hours.js';
import { createCart, sanitizeItem } from '../../src/lib/cart.js';
import { buildOrderMessage, whatsappLink, normalizeBrPhone, cleanText } from '../../src/lib/whatsapp.js';
import { buildCatalog } from '../../src/lib/catalog.js';
import { priceItem } from '../../src/lib/pricing.js';
import { productImageAlt, slugify, matchImageFiles } from '../../src/lib/text.js';

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
  it('preço em confirmação bloqueia o pedido e sai do "a partir de"', () => {
    const flagged = (key, n) => raw[key].map((r) => (r.id === id(n) ? { ...r, price_review: true } : r));
    const c1 = buildCatalog({ ...raw, flavors: flagged('flavors', 12) });
    const r = priceItem(c1, sel({ flavorIds: [id(12)] }));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('em confirmação');
    expect(c1.products.get(id(1)).fromCents).toBe(5000); // C (45,00) fica de fora
    expect(priceItem(buildCatalog({ ...raw, crusts: flagged('crusts', 30) }), sel({ crustId: id(30) })).ok).toBe(false);
    expect(priceItem(buildCatalog({ ...raw, extras: flagged('extras', 20) }), sel({ extraIds: [id(20)] })).ok).toBe(false);
    const c2 = buildCatalog({ ...raw, products: flagged('products', 5) });
    expect(priceItem(c2, { productId: id(5), quantity: 1 }).ok).toBe(false);
    expect(c2.products.get(id(5)).fromCents).toBeNull();
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
  it('nome da pizzaria, taxa a combinar e sabor único sem repetição', () => {
    const msg = buildOrderMessage({
      ...order, storeName: "Domingo's Pizzas", deliveryFeePending: true, deliveryFeeCents: 0, totalCents: 11200,
      items: [{ ...order.items[0], name: 'Calabresa', size: 'G', flavors: ['Calabresa'] }],
    });
    expect(msg.startsWith("NOVO PEDIDO — Domingo's Pizzas")).toBe(true);
    expect(msg).toContain('2 × Calabresa\nTamanho: G\nBorda: Sem borda');
    expect(msg).not.toContain('Sabores:');
    expect(msg).toContain('Taxa de entrega: a combinar com a pizzaria');
    expect(msg).toContain('TOTAL (sem a taxa de entrega): R$ 112,00');
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

describe('texto alternativo das fotos', () => {
  it('junta a categoria quando ela acrescenta informação', () => {
    expect(productImageAlt('Calabresa', 'Pizzas de calabresa')).toBe('Calabresa - Pizzas de calabresa');
    expect(productImageAlt('Coca-Cola 2L', 'Bebidas')).toBe('Coca-Cola 2L - Bebidas');
  });
  it('fica só com o nome quando a categoria repete o nome ou falta', () => {
    expect(productImageAlt('Pizza doce', 'Pizza')).toBe('Pizza doce');
    expect(productImageAlt('Pizza meio a meio', 'Pizza meio a meio')).toBe('Pizza meio a meio');
    expect(productImageAlt('Batata frita', undefined)).toBe('Batata frita');
  });
});

describe('várias fotos de uma vez: arquivo -> produto pelo nome', () => {
  const items = ['Bacon', 'Milho Bacon', 'Catupiry com Bacon', 'Frango com Catupiry', 'Brócolis 1', 'Brócolis', 'Pizza 2 sabores (meio a meio)', 'Júlia']
    .map((name) => ({ name, slug: `pizza-${slugify(name)}` }));
  const run = (...names) => matchImageFiles(names.map((name) => ({ name })), items);
  const show = (rows) => rows.map((r) => [r.file.name, r.status, r.item?.name ?? null]);

  it('slug sem acentos nem símbolos', () => {
    expect(slugify('Brócolis 1')).toBe('brocolis-1');
    expect(slugify('Pizza 2 sabores (meio a meio)')).toBe('pizza-2-sabores-meio-a-meio');
  });
  it('aceita nome com espaços e acentos, com hífens ou com o endereço do produto', () => {
    expect(show(run('Frango com Catupiry.JPG', 'brocolis-1.webp', 'julia.png', 'pizza-bacon.avif'))).toEqual([
      ['Frango com Catupiry.JPG', 'exact', 'Frango com Catupiry'], ['brocolis-1.webp', 'exact', 'Brócolis 1'],
      ['julia.png', 'exact', 'Júlia'], ['pizza-bacon.avif', 'exact', 'Bacon']]);
  });
  it('nome exato vence o parcial (bacon não vira Milho Bacon)', () => {
    expect(show(run('bacon.webp', 'brocolis.webp'))).toEqual([['bacon.webp', 'exact', 'Bacon'], ['brocolis.webp', 'exact', 'Brócolis']]);
  });
  it('parecido com um único produto vem marcado para conferir', () => {
    expect(show(run('meio-a-meio.webp'))).toEqual([['meio-a-meio.webp', 'partial', 'Pizza 2 sabores (meio a meio)']]);
  });
  it('mais de um produto possível: não escolhe sozinho e lista as opções', () => {
    const [r] = run('catupiry.webp');
    expect(r.status).toBe('ambiguous');
    expect(r.item).toBeNull();
    expect(r.candidates.map((c) => c.name)).toEqual(['Catupiry com Bacon', 'Frango com Catupiry']);
  });
  it('dois arquivos para o mesmo produto: nenhum é escolhido sozinho', () => {
    const r = run('Bacon.jpg', 'bacon.webp');
    expect(show(r)).toEqual([['Bacon.jpg', 'ambiguous', null], ['bacon.webp', 'ambiguous', null]]);
    expect(r[0].duplicate).toBe(true);
  });
  it('sem produto parecido fica sem associação', () => {
    expect(show(run('calabresa.jpg', 'IMG_2024.jpg'))).toEqual([['calabresa.jpg', 'none', null], ['IMG_2024.jpg', 'none', null]]);
  });
});

describe('texto alternativo sugerido para a foto enviada no painel', () => {
  it('descreve a pizza pelo sabor, e bebidas pelo nome', async () => {
    const { suggestImageAlt } = await import('../../src/lib/text.js');
    expect(suggestImageAlt('Frango com Catupiry', { kind: 'pizza', groupType: 'pizzas_salgadas' })).toBe('Pizza de Frango com Catupiry');
    expect(suggestImageAlt('Banana Nevada', { kind: 'pizza', groupType: 'pizzas_doces' })).toBe('Pizza doce de Banana Nevada');
    expect(suggestImageAlt('Pizza 2 sabores (meio a meio)', { kind: 'pizza' })).toBe('Pizza 2 sabores (meio a meio)');
    expect(suggestImageAlt('Coca-Cola 2L', { kind: 'simple', groupType: 'bebidas' })).toBe('Coca-Cola 2L');
  });
});

describe('envio de imagens: tipo real pelo conteúdo do arquivo', () => {
  const bytes = (...parts) => new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
  it('reconhece JPG, PNG, WebP e AVIF pela assinatura', async () => {
    const { sniffImageType } = await import('../../src/admin/images.js');
    expect(sniffImageType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffImageType(bytes('RIFF', [1, 2, 3, 4], 'WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(bytes([0, 0, 0, 28], 'ftypavif', [0, 0, 0, 0], 'avifmif1'))).toBe('image/avif');
    expect(sniffImageType(bytes([0, 0, 0, 28], 'ftypmif1', [0, 0, 0, 0], 'mif1avif'))).toBe('image/avif');
  });
  it('recusa executável, HTML, SVG e HEIC mesmo com extensão de imagem', async () => {
    const { sniffImageType } = await import('../../src/admin/images.js');
    expect(sniffImageType(bytes('MZ', [0x90, 0]))).toBeNull(); // .exe
    expect(sniffImageType(bytes([0x7f], 'ELF'))).toBeNull();
    expect(sniffImageType(bytes('<html><script>'))).toBeNull();
    expect(sniffImageType(bytes('<svg xmlns='))).toBeNull();
    expect(sniffImageType(bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0], 'mif1heic'))).toBeNull();
    expect(sniffImageType(bytes([]))).toBeNull();
  });
});
