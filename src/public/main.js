import '../styles/main.css';
import { h, clear, add } from '../lib/dom.js';
import { icon, illustration, pizzaArt } from '../lib/icons.js';
import { formatCents, formatPrice } from '../lib/money.js';
import { matchesSearch, normalize, productImageAlt } from '../lib/text.js';
import { openStatus, describeStatus, hoursByDay, nowInZone, WEEKDAYS } from '../lib/hours.js';
import { loadMenuData } from '../lib/api.js';
import { buildCatalog } from '../lib/catalog.js';
import { priceItem } from '../lib/pricing.js';
import { createCart } from '../lib/cart.js';
import { openProductModal } from './productModal.js';
import { openCartDrawer } from './cartDrawer.js';

const app = document.getElementById('app');
export const cart = createCart();
let catalog = null;
let query = '';
let slugs = new Map(); // id da categoria -> âncora legível (#pizzas-de-calabresa)

// O index.html já traz o topo com a marca e o esqueleto do cardápio: a página
// pinta antes do JavaScript e dos dados chegarem (melhora FCP/LCP). A faixa da
// marca é reaproveitada no topo definitivo, sem baixar ou pintar de novo.
const loadingShell = [...app.childNodes].map((n) => n.cloneNode(true));
let brandBanner = app.querySelector('.brand-banner');
setupBrandImages();

function setupBrandImages() {
  const wordmark = brandBanner?.querySelector('.brand-wordmark');
  const symbol = brandBanner?.querySelector('.brand-symbol');
  // Se o nome escrito não carregar, volta o topo com logo redondo e nome em texto
  const failWordmark = () => {
    brandBanner?.remove();
    brandBanner = null;
    document.querySelector('.hero .brand-name')?.classList.remove('sr-only');
    const logo = document.querySelector('.hero .logo');
    if (logo) logo.hidden = false;
  };
  const failSymbol = () => symbol.remove();
  if (wordmark) {
    if (wordmark.complete && !wordmark.naturalWidth) failWordmark();
    else wordmark.addEventListener('error', failWordmark);
  }
  if (symbol) {
    if (symbol.complete && !symbol.naturalWidth) failSymbol();
    else symbol.addEventListener('error', failSymbol);
  }
}

boot();

async function boot() {
  // Na primeira carga o esqueleto já está na página (index.html)
  if (!app.querySelector('[data-shell]')) renderLoading();
  try {
    catalog = buildCatalog(await loadMenuData());
  } catch (err) {
    console.error(err);
    renderError(err);
    return;
  }
  // descarta itens salvos que não existem mais ou ficaram inválidos
  const removed = cart.reconcile((item) => priceItem(catalog, item).ok);
  render();
  if (removed) toast(`${removed} item(ns) do seu carrinho saíram do cardápio e foram removidos.`);
}

// ---------------------------------------------------------------- estados
function renderLoading() {
  clear(app).append(...loadingShell.map((n) => n.cloneNode(true)));
}

function renderError(err) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  clear(app).append(h('main', { class: 'wrap' }, h('div', { class: 'state', role: 'alert' },
    icon('alert'),
    h('h1', {}, 'Não foi possível carregar o cardápio'),
    h('p', {}, offline ? 'Você parece estar sem internet. Verifique a conexão.' : 'Tente novamente em instantes.'),
    import.meta.env.DEV ? h('p', { style: 'font-size:13px' }, String(err.message)) : null,
    h('button', { class: 'btn', type: 'button', onclick: boot }, 'Tentar novamente'))));
}

// ---------------------------------------------------------------- página
function render() {
  const s = catalog.settings;
  document.title = `${s.name} | Cardápio e pedidos pelo WhatsApp`;
  slugs = categorySlugs(catalog.categories);
  add(clear(app),
    s.is_demo ? h('div', { class: 'demo-banner', role: 'note' },
      h('strong', {}, 'Modo demonstração: '), 'nome, produtos, preços e taxas são fictícios.') : null,
    renderHero(),
    renderToolbar(),
    h('main', { id: 'menu', class: 'wrap' }),
    renderFooter(),
    h('div', { class: 'cart-bar', id: 'cart-bar' }),
    renderContactButton(),
  );
  renderMenu();
  renderCartBar();
  cart.subscribe(renderCartBar);
  setupScrollSpy();
  renderStructuredData();
  // Link direto para uma categoria (ex.: .../#pizzas-doces) só funciona depois que o cardápio existe
  if (location.hash) goToHash(false);
  window.addEventListener('hashchange', () => goToHash(true));
}

function renderHero() {
  const s = catalog.settings;
  const status = openStatus(catalog.hours, s.timezone);
  const meta = [];
  if (!s.accepting_orders) {
    meta.push(h('span', { class: 'pill status-closed' }, 'Não estamos recebendo pedidos agora'));
  } else {
    meta.push(h('span', { class: `pill ${status.open ? 'status-open' : 'status-closed'}` }, describeStatus(status)));
  }
  if (s.delivery_enabled && s.delivery_time_min != null) meta.push(h('span', { class: 'pill' }, icon('bike'), `Entrega ${range(s.delivery_time_min, s.delivery_time_max)}`));
  if (s.pickup_enabled && s.pickup_time_min != null) meta.push(h('span', { class: 'pill' }, icon('bag'), `Retirada ${range(s.pickup_time_min, s.pickup_time_max)}`));
  if (Number(s.min_order_value) > 0) meta.push(h('span', { class: 'pill' }, `Pedido mínimo ${formatPrice(s.min_order_value)}`));

  // Marca da pizzaria no topo (vem do index.html); o nome continua no h1, o único da página,
  // para leitores de tela e buscadores. Sem a marca, aparecem o logo redondo e o nome escrito.
  const title = h('h1', { class: `brand-name${brandBanner ? ' sr-only' : ''}` }, s.name);
  const roundLogo = s.logo_url ? h('img', { class: 'logo', src: s.logo_url, alt: `Logo da ${s.name}`, hidden: !!brandBanner, width: 72, height: 72 })
    : h('div', { class: 'logo', 'aria-hidden': 'true', hidden: !!brandBanner }, pizzaArt());
  const hero = h('header', { class: `hero${s.cover_url ? ' has-cover' : ''}` },
    brandBanner,
    h('div', { class: 'wrap hero-inner' },
      h('div', { class: 'brand-row' },
        roundLogo,
        h('div', {}, title, s.tagline ? h('p', { class: 'brand-tagline' }, s.tagline) : null)),
      h('div', { class: 'meta' }, meta),
      h('button', { class: 'info-btn', type: 'button', onclick: openInfo }, icon('info'), 'Informações, horários e endereço')));
  if (s.cover_url) hero.style.backgroundImage = `url("${encodeURI(s.cover_url)}")`;
  return hero;
}

const range = (a, b) => (b != null && b !== a ? `${a}–${b} min` : `${a} min`);

// Taxa vazia (null) = "a combinar"; só 0,00 é entrega grátis.
const zoneFeeLabel = (fee) => (fee === null || fee === undefined ? 'A combinar' : Number(fee) > 0 ? formatPrice(fee) : 'Grátis');

function renderToolbar() {
  const input = h('input', {
    type: 'search', id: 'search', placeholder: 'Buscar no cardápio', autocomplete: 'off', 'aria-label': 'Buscar produtos',
  });
  const clearBtn = h('button', { class: 'search-clear', type: 'button', 'aria-label': 'Limpar busca', hidden: true },
    icon('close'));
  input.addEventListener('input', () => {
    query = input.value;
    clearBtn.hidden = !query;
    renderMenu();
  });
  clearBtn.addEventListener('click', () => { input.value = ''; query = ''; clearBtn.hidden = true; renderMenu(); input.focus(); });

  const nav = h('nav', { class: 'cat-nav', id: 'cat-nav', 'aria-label': 'Categorias' },
    catalog.categories.map((c) => categoryLink(c, 'cat-link')));
  // Setas para quem usa mouse: rolar a barra de lado com a roda é difícil
  const arrow = (dir) => h('button', {
    type: 'button', class: 'cat-arrow', 'aria-hidden': 'true', tabindex: '-1',
    onclick: () => nav.scrollBy({ left: dir * nav.clientWidth * 0.7, behavior: 'smooth' }),
  }, icon(dir < 0 ? 'left' : 'right'));
  const prev = arrow(-1);
  const next = arrow(1);
  const updateArrows = () => {
    prev.disabled = nav.scrollLeft <= 1;
    next.disabled = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 1;
  };
  nav.addEventListener('scroll', updateArrows, { passive: true });
  window.addEventListener('resize', updateArrows);
  requestAnimationFrame(updateArrows);

  return h('div', { class: 'toolbar' }, h('div', { class: 'wrap' },
    h('div', { class: 'search', role: 'search' }, icon('search'), input, clearBtn),
    h('div', { class: 'cat-row' }, prev, nav, next)));
}

// ---------------------------------------------------------------- links internos
// Cada categoria tem uma âncora legível e estável, derivada do nome
// (#pizzas-de-calabresa), em vez do código interno do banco.
const RESERVED_IDS = new Set(['app', 'menu', 'search', 'cat-nav', 'cart-bar', 'open-cart', 'contact-whatsapp', 'info-title', 'pm-title', 'cart-title']);
function categorySlugs(categories) {
  const map = new Map();
  const used = new Set(RESERVED_IDS);
  for (const c of categories) {
    const base = normalize(c.name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'categoria';
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
    used.add(slug);
    map.set(c.id, slug);
  }
  return map;
}

function categoryLink(c, className) {
  return h('a', {
    class: className, href: `#${slugs.get(c.id)}`, dataset: { cat: c.id },
    onclick: (e) => {
      e.preventDefault();
      showCategory(c.id);
      history.replaceState(null, '', `#${slugs.get(c.id)}`); // endereço compartilhável, sem encher o "voltar"
    },
  }, c.name);
}

// Aceita a âncora nova e a antiga (#cat-<id>), que pode estar em links já compartilhados
function goToHash(smooth) {
  const key = decodeURIComponent(location.hash.slice(1));
  const c = catalog.categories.find((x) => slugs.get(x.id) === key || `cat-${x.id}` === key);
  if (!c) return;
  if (key !== slugs.get(c.id)) history.replaceState(null, '', `#${slugs.get(c.id)}`);
  showCategory(c.id, smooth);
}

function showCategory(id, smooth = true) {
  // Se a busca escondeu a categoria, limpa a busca antes de rolar até ela
  if (!document.getElementById(slugs.get(id)) && query) {
    const input = document.getElementById('search');
    input.value = '';
    input.dispatchEvent(new Event('input'));
  }
  scrollToCategory(id, smooth);
}

function scrollToCategory(id, smooth = true) {
  const target = document.getElementById(slugs.get(id));
  if (!target) return;
  target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  setActiveCategory(id);
}

function renderMenu() {
  const main = document.getElementById('menu');
  clear(main);
  if (!catalog.categories.length) {
    main.append(h('div', { class: 'state' }, pizzaArt(), h('h2', {}, 'Cardápio em preparação'),
      h('p', {}, 'Ainda não há produtos disponíveis. Volte em breve!')));
    return;
  }
  if (!query.trim()) main.append(...[renderWeeklyPromos()].filter(Boolean));
  let shown = 0;
  for (const c of catalog.categories) {
    const items = c.products.filter((p) => matchesSearch(query, p.name, p.description, c.name,
      ...p.flavors.map((f) => f.name)));
    document.querySelector(`.cat-link[data-cat="${c.id}"]`)?.toggleAttribute('hidden', items.length === 0);
    if (!items.length) continue;
    shown += items.length;
    main.append(h('section', { class: 'section', id: slugs.get(c.id), dataset: { cat: c.id }, 'aria-labelledby': `t-${c.id}` },
      h('h2', { class: 'section-title', id: `t-${c.id}` }, c.name),
      c.description ? h('p', { class: 'card-desc', style: 'margin:-6px 0 12px' }, c.description) : null,
      h('div', { class: 'grid' }, items.map((p) => productCard(p, c)))));
  }
  if (!shown) {
    main.append(h('div', { class: 'state' }, icon('search'), h('h2', {}, 'Nada encontrado'),
      h('p', {}, `Nenhum produto corresponde a “${query.trim()}”.`)));
  }
}

// ---------------------------------------------------------------- promoções da semana
// Ordem de exibição: segunda a domingo
const PROMO_DAYS = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_FULL = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

// Faixa no topo do cardápio: as pizzas em promoção hoje (clicáveis) e a lista da semana
function renderWeeklyPromos() {
  const all = catalog.weeklyPromos;
  if (!all.length) return null;
  const todays = catalog.todayPromos;
  const sameOffer = (list) => list.length && list.every((w) => w.size.id === list[0].size.id && w.priceCents === list[0].priceCents);
  const offerText = (list) => (sameOffer(list) ? `pizza ${list[0].size.name} por ${formatCents(list[0].priceCents)}` : 'preços especiais');
  const flavorList = (list) => list.map((w) => w.flavor.name).join(', ').replace(/, ([^,]*)$/, ' e $1');

  const week = h('details', { class: 'promo-week' },
    h('summary', {}, 'Promoções de cada dia da semana'),
    h('table', { class: 'hours-table' }, h('tbody', {}, PROMO_DAYS.map((d) => {
      const list = all.filter((w) => w.weekday === d);
      return h('tr', { class: d === catalog.today ? 'today' : '' },
        h('td', {}, WEEKDAYS[d]),
        h('td', {}, list.length ? `${flavorList(list)} · ${offerText(list)}` : 'Sem promoção'));
    }))));

  if (!todays.length) {
    return h('section', { class: 'promo-today is-empty', 'aria-label': 'Promoções da semana' },
      h('p', { class: 'promo-sub' }, `Hoje (${WEEKDAY_FULL[catalog.today]}) não tem promoção do dia.`), week);
  }
  return h('section', { class: 'promo-today', id: 'promocao-de-hoje', 'aria-labelledby': 'promo-title' },
    h('span', { class: 'badge' }, 'Promoção de hoje'),
    h('h2', { class: 'promo-title', id: 'promo-title' },
      sameOffer(todays) ? `${capitalize(WEEKDAY_FULL[catalog.today])}: ${offerText(todays)}` : `Promoção de ${WEEKDAY_FULL[catalog.today]}`),
    h('p', { class: 'promo-sub' }, 'Escolha um destes sabores:'),
    h('div', { class: 'promo-list' }, todays.map((w) => {
      const label = [h('span', { class: 'promo-flavor' }, w.flavor.name),
        h('span', { class: 'promo-price' }, `${w.size.name} `, h('span', { class: 'price-old' }, formatCents(w.regularCents)), ` ${formatCents(w.priceCents)}`)];
      if (!w.product) return h('span', { class: 'promo-item' }, label);
      const category = catalog.categories.find((c) => c.id === w.product.category_id);
      return h('button', {
        type: 'button', class: 'promo-item',
        'aria-label': `${w.flavor.name}, ${w.size.name} por ${formatCents(w.priceCents)} (de ${formatCents(w.regularCents)})`,
        onclick: () => openProductModal({
          catalog, productId: w.product.id, categoryName: category?.name ?? '', initial: { sizeId: w.size.id },
          onConfirm: (sel) => { cart.add(sel); toast(`${w.product.name} adicionado ao carrinho`); },
        }),
      }, label);
    })),
    h('p', { class: 'promo-note' }, 'Vale só hoje, no tamanho indicado. Na meio a meio, vale quando os dois sabores estão na promoção.'),
    week);
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function productCard(p, category) {
  const hasPromo = p.kind === 'simple' && !p.price_review && p.promoCents !== null;
  let pizzaHint = null;
  let sizePrices = null;
  let weeklyPromo = false;
  if (p.kind === 'pizza' && p.sizes.length) {
    const only = p.flavors.length === 1 ? p.flavors[0] : null;
    weeklyPromo = !!only && p.sizes.some((s) => catalog.flavorPrice(only.id, s.id)?.weekly);
    if (only && (!only.price_review || weeklyPromo)) {
      // Card de um sabor: mostra o preço de cada tamanho (ex.: P R$ 40,00 · M R$ 45,00 · G R$ 55,90).
      // Sabor em confirmação só mostra o tamanho da promoção de hoje (o único com preço definido).
      sizePrices = p.sizes.map((s) => {
        const fp = catalog.flavorPrice(only.id, s.id);
        if (!fp || (only.price_review && !fp.weekly)) return null;
        return fp.weekly
          ? h('span', { class: 'size-price promo' }, h('b', {}, s.name), ' ', h('s', { class: 'price-old' }, formatCents(fp.priceCents)), ` ${formatCents(fp.effectiveCents)}`)
          : h('span', { class: 'size-price' }, h('b', {}, s.name), ` ${formatCents(fp.effectiveCents)}`);
      }).filter(Boolean);
    } else if (!only) {
      const maxF = Math.max(...p.sizes.map((s) => s.max_flavors));
      pizzaHint = `${p.sizes.map((s) => s.name).join(', ')} · até ${maxF} sabor${maxF > 1 ? 'es' : ''}`;
    }
  }
  const qtyHint = p.qtyPromoMin ? `A partir de ${p.qtyPromoMin} un.: ${formatCents(p.qtyPromoCents)} cada` : null;

  // Card = artigo com título; o botão fica no título e cobre o card inteiro (ver .card-open no CSS)
  return h('article', { class: 'card', dataset: { product: p.id } },
  h('div', { class: 'card-body' },
    weeklyPromo ? h('span', { class: 'badge promo' }, 'Promoção de hoje')
      : p.badge ? h('span', { class: `badge${hasPromo || /promo/i.test(p.badge) ? ' promo' : ''}` }, p.badge) : null,
    h('h3', { class: 'card-name' }, h('button', {
      type: 'button', class: 'card-open',
      'aria-label': p.fromCents === null ? `${p.name}, preço em confirmação`
        : sizePrices?.length ? `${p.name}${weeklyPromo ? ', promoção de hoje' : ''}, ${sizePrices.map((el) => el.textContent).join(', ')}`
          : `${p.name}, ${p.kind === 'pizza' ? 'a partir de ' : ''}${formatCents(p.fromCents)}`,
      onclick: () => openProductModal({
        catalog, productId: p.id, categoryName: category.name,
        onConfirm: (sel) => { cart.add(sel); toast(`${p.name} adicionado ao carrinho`); },
      }),
    }, p.name)),
    p.description ? h('p', { class: 'card-desc' }, p.description) : null,
    pizzaHint ? h('span', { class: 'card-hint' }, pizzaHint) : null,
    qtyHint ? h('span', { class: 'card-hint' }, qtyHint) : null,
    p.fromCents === null
      ? h('div', { class: 'card-foot' }, h('span', { class: 'price-review' }, 'Preço em confirmação'))
      : sizePrices?.length
        ? h('div', { class: 'card-foot size-prices' }, sizePrices)
        : h('div', { class: 'card-foot' },
        p.kind === 'pizza' ? h('span', { class: 'price-from' }, 'a partir de') : null,
        hasPromo ? h('span', { class: 'price-old' }, formatCents(p.priceCents)) : null,
        h('span', { class: `price${hasPromo ? ' price-promo' : ''}` }, formatCents(p.fromCents)))),
  p.image_url
    ? h('img', { class: 'thumb', src: p.image_url, alt: productImageAlt(p.name, category.name), loading: 'lazy', decoding: 'async', width: 96, height: 96 })
    : h('div', { class: 'thumb placeholder', 'aria-hidden': 'true' }, illustration(p, category.name)));
}

// ---------------------------------------------------------------- categorias ativas ao rolar
let spy;
function setupScrollSpy() {
  spy?.disconnect();
  spy = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) setActiveCategory(visible[0].target.dataset.cat);
  }, { rootMargin: '-120px 0px -60% 0px' });
  document.querySelectorAll('.section').forEach((s) => spy.observe(s));
  new MutationObserver(() => document.querySelectorAll('.section').forEach((s) => spy.observe(s)))
    .observe(document.getElementById('menu'), { childList: true });
}

function setActiveCategory(id) {
  document.querySelectorAll('.cat-link').forEach((a) => {
    const on = a.dataset.cat === id;
    a.setAttribute('aria-current', String(on));
    if (on) a.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  });
}

// ---------------------------------------------------------------- informações
function openInfo() {
  const s = catalog.settings;
  const today = nowInZone(s.timezone).weekday;
  const dialog = h('dialog', { class: 'sheet', 'aria-labelledby': 'info-title' },
    h('div', { class: 'sheet-body' },
      h('button', { type: 'button', class: 'sheet-close', 'aria-label': 'Fechar', onclick: () => dialog.close() }, icon('close')),
      h('h2', { class: 'sheet-title', id: 'info-title' }, s.name),
      h('div', { class: 'info-list' },
        s.about ? h('div', {}, h('h3', {}, 'Sobre'), h('p', {}, s.about)) : null,
        s.address_line ? h('div', {}, h('h3', {}, 'Endereço'), h('p', {}, s.address_line),
          s.maps_url ? h('p', {}, h('a', { href: s.maps_url, target: '_blank', rel: 'noopener noreferrer' }, 'Ver no mapa')) : null) : null,
        h('div', {}, h('h3', {}, 'Horário de funcionamento'),
          catalog.hours.length
            ? h('table', { class: 'hours-table' }, h('tbody', {}, hoursByDay(catalog.hours).map((d) =>
              h('tr', { class: d.weekday === today ? 'today' : '' }, h('td', {}, d.name), h('td', {}, d.slots.join(', ') || 'Fechado')))))
            : h('p', {}, 'Horários ainda não informados.')),
        h('div', {}, h('h3', {}, 'Entrega e retirada'),
          h('p', {}, [
            s.delivery_enabled ? `Entrega${s.delivery_time_min != null ? ` em ${range(s.delivery_time_min, s.delivery_time_max)}` : ''}` : 'Sem entrega no momento',
            s.pickup_enabled ? `Retirada${s.pickup_time_min != null ? ` em ${range(s.pickup_time_min, s.pickup_time_max)}` : ''}` : null,
          ].filter(Boolean).join(' · ')),
          Number(s.min_order_value) > 0 ? h('p', {}, `Pedido mínimo: ${formatPrice(s.min_order_value)}`) : null),
        s.delivery_enabled && catalog.zones.length ? h('div', {}, h('h3', {}, 'Taxas de entrega'),
          h('table', { class: 'hours-table' }, h('tbody', {}, catalog.zones.map((z) =>
            h('tr', {}, h('td', {}, z.name), h('td', {}, zoneFeeLabel(z.fee))))))) : null,
        catalog.payments.length ? h('div', {}, h('h3', {}, 'Formas de pagamento'),
          h('div', { class: 'chips' }, catalog.payments.map((p) => h('span', { class: 'chip' }, p.name)))) : null)));
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.showModal();
}

// ---------------------------------------------------------------- dados estruturados
// Restaurant (schema.org) em JSON-LD: endereço, telefone e horários direto do
// cadastro da loja, para o Google mostrar no resultado da busca e no Maps.
const SCHEMA_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function renderStructuredData() {
  const s = catalog.settings;
  document.getElementById('ld-restaurant')?.remove();
  if (s.is_demo) return; // dados fictícios não vão para os buscadores
  const url = new URL('./', location.href).href;
  const tel = s.phone_display ? telHref(s.phone_display) : null;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: s.name,
    url,
    image: new URL('og-image.png', url).href,
    description: s.tagline || undefined,
    servesCuisine: 'Pizza',
    hasMenu: url,
    acceptsReservations: false,
    telephone: tel ? tel.slice(4) : undefined,
    address: s.address_line ? { '@type': 'PostalAddress', streetAddress: s.address_line, addressCountry: 'BR' } : undefined,
    hasMap: s.maps_url || undefined,
    sameAs: s.instagram_url ? [s.instagram_url] : undefined,
    openingHoursSpecification: catalog.hours.map((hr) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${SCHEMA_DAYS[hr.weekday]}`,
      opens: String(hr.opens_at).slice(0, 5),
      closes: String(hr.closes_at).slice(0, 5),
    })),
  };
  document.head.append(h('script', { type: 'application/ld+json', id: 'ld-restaurant' }, JSON.stringify(data)));
}

// ---------------------------------------------------------------- rodapé
// Telefone brasileiro com DDD (10 ou 11 dígitos) vira link de ligação
const telHref = (display) => {
  const d = String(display).replace(/\D/g, '');
  return /^\d{10,11}$/.test(d) ? `tel:+55${d}` : null;
};

function renderFooter() {
  const s = catalog.settings;
  const year = new Date().getFullYear();
  return h('footer', { class: 'footer' }, h('div', { class: 'wrap' },
    h('div', {}, h('h2', {}, s.name), s.tagline ? h('p', {}, s.tagline) : null,
      s.about ? h('p', {}, s.about) : null,
      s.address_line ? h('p', {}, s.address_line) : null,
      s.maps_url ? h('p', {}, h('a', { href: s.maps_url, target: '_blank', rel: 'noopener noreferrer' }, 'Como chegar')) : null),
    h('div', {}, h('h3', {}, 'Contato'),
      s.phone_display ? h('p', {}, telHref(s.phone_display) ? h('a', { href: telHref(s.phone_display) }, s.phone_display) : s.phone_display) : null,
      s.whatsapp_number ? h('p', {}, h('a', { href: `https://wa.me/${s.whatsapp_number}`, target: '_blank', rel: 'noopener noreferrer' }, 'WhatsApp')) : null,
      s.instagram_url ? h('p', {}, h('a', { href: s.instagram_url, target: '_blank', rel: 'noopener noreferrer' }, 'Instagram')) : null,
      !s.phone_display && !s.whatsapp_number && !s.instagram_url ? h('p', {}, 'Contatos ainda não informados.') : null),
    h('div', {}, h('h3', {}, 'Horários'),
      hoursByDay(catalog.hours).filter((d) => d.slots.length).map((d) => h('p', {}, `${d.name}: ${d.slots.join(', ')}`)),
      !catalog.hours.length ? h('p', {}, 'Ainda não informados.') : null),
    catalog.categories.length ? h('nav', { class: 'footer-nav', 'aria-labelledby': 'footer-menu-title' },
      h('h3', { id: 'footer-menu-title' }, 'Cardápio'),
      h('ul', {}, catalog.categories.map((c) => h('li', {}, categoryLink(c))))) : null,
    h('p', { class: 'fine' }, `© ${year} ${s.name}. Os pedidos são enviados pelo WhatsApp e só são confirmados após a resposta da pizzaria. Seu nome, telefone e endereço ficam salvos só neste aparelho, para agilizar o próximo pedido, e vão para a pizzaria apenas na mensagem que você envia.`)));
}

// Botão fixo para falar com a pizzaria pelo WhatsApp, sem montar pedido
function renderContactButton() {
  const s = catalog.settings;
  if (!s.whatsapp_number) return null;
  const text = encodeURIComponent(`Olá, ${s.name}! Vim pelo cardápio do site e gostaria de falar com vocês.`);
  return h('a', { class: 'wa-float', id: 'contact-whatsapp', href: `https://wa.me/${s.whatsapp_number}?text=${text}`, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Enviar mensagem para ${s.name} pelo WhatsApp` },
    icon('chat'), h('span', {}, 'Fale conosco'));
}

// ---------------------------------------------------------------- carrinho (barra)
function renderCartBar() {
  const bar = document.getElementById('cart-bar');
  if (!bar) return;
  clear(bar);
  if (!cart.count) return;
  const estimate = cart.items.reduce((sum, it) => {
    const r = priceItem(catalog, it);
    return sum + (r.ok ? r.lineCents : 0);
  }, 0);
  bar.append(h('button', { class: 'btn', type: 'button', id: 'open-cart', onclick: () => openCartDrawer({ catalog, cart }) },
    h('span', {}, h('span', { class: 'cart-count' }, String(cart.count)), 'Ver carrinho'),
    h('span', {}, formatCents(estimate))));
}

let toastTimer;
export function toast(message) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), 2600);
}
