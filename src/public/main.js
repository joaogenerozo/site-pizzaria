import '../styles/main.css';
import { h, clear, add } from '../lib/dom.js';
import { icon, illustration, pizzaArt } from '../lib/icons.js';
import { formatCents, formatPrice } from '../lib/money.js';
import { matchesSearch } from '../lib/text.js';
import { openStatus, describeStatus, hoursByDay, nowInZone } from '../lib/hours.js';
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

boot();

async function boot() {
  renderLoading();
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
  clear(app).append(
    h('div', { class: 'hero' }, h('div', { class: 'wrap hero-inner' },
      h('div', { class: 'brand-row' }, h('div', { class: 'logo skeleton' }),
        h('div', { style: 'flex:1' }, h('div', { class: 'skeleton', style: 'height:30px;width:60%' }))))),
    h('main', { class: 'wrap', 'aria-busy': 'true' },
      h('p', { class: 'sr-only' }, 'Carregando cardápio…'),
      h('div', { class: 'section' }, h('div', { class: 'skeleton', style: 'height:26px;width:160px;margin-bottom:12px' }),
        h('div', { class: 'grid' }, Array.from({ length: 6 }, () => h('div', { class: 'skeleton skeleton-card' }))))),
  );
}

function renderError(err) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  clear(app).append(h('main', { class: 'wrap' }, h('div', { class: 'state', role: 'alert' },
    icon('alert'),
    h('h2', {}, 'Não foi possível carregar o cardápio'),
    h('p', {}, offline ? 'Você parece estar sem internet. Verifique a conexão.' : 'Tente novamente em instantes.'),
    import.meta.env.DEV ? h('p', { style: 'font-size:13px' }, String(err.message)) : null,
    h('button', { class: 'btn', type: 'button', onclick: boot }, 'Tentar novamente'))));
}

// ---------------------------------------------------------------- página
function render() {
  const s = catalog.settings;
  document.title = `${s.name} · Cardápio`;
  add(clear(app),
    s.is_demo ? h('div', { class: 'demo-banner', role: 'note' },
      h('strong', {}, 'Modo demonstração: '), 'nome, produtos, preços e taxas são fictícios.') : null,
    renderHero(),
    renderToolbar(),
    h('main', { id: 'menu', class: 'wrap' }),
    renderFooter(),
    h('div', { class: 'cart-bar', id: 'cart-bar' }),
  );
  renderMenu();
  renderCartBar();
  cart.subscribe(renderCartBar);
  setupScrollSpy();
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

  const hero = h('header', { class: `hero${s.cover_url ? ' has-cover' : ''}` },
    h('div', { class: 'wrap hero-inner' },
      h('div', { class: 'brand-row' },
        s.logo_url ? h('img', { class: 'logo', src: s.logo_url, alt: `Logo ${s.name}` }) : h('div', { class: 'logo', 'aria-hidden': 'true' }, pizzaArt()),
        h('div', {}, h('h1', { class: 'brand-name' }, s.name), s.tagline ? h('p', { class: 'brand-tagline' }, s.tagline) : null)),
      h('div', { class: 'meta' }, meta),
      h('button', { class: 'info-btn', type: 'button', onclick: openInfo }, icon('info'), 'Informações, horários e endereço')));
  if (s.cover_url) hero.style.backgroundImage = `url("${encodeURI(s.cover_url)}")`;
  return hero;
}

const range = (a, b) => (b != null && b !== a ? `${a}–${b} min` : `${a} min`);

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

  return h('div', { class: 'toolbar' }, h('div', { class: 'wrap' },
    h('div', { class: 'search', role: 'search' }, icon('search'), input, clearBtn),
    h('nav', { class: 'cat-nav', id: 'cat-nav', 'aria-label': 'Categorias' },
      catalog.categories.map((c) => h('a', {
        class: 'cat-link', href: `#cat-${c.id}`, dataset: { cat: c.id },
        onclick: (e) => { e.preventDefault(); scrollToCategory(c.id); },
      }, c.name)))));
}

function scrollToCategory(id) {
  const target = document.getElementById(`cat-${id}`);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  let shown = 0;
  for (const c of catalog.categories) {
    const items = c.products.filter((p) => matchesSearch(query, p.name, p.description, c.name,
      ...p.flavors.map((f) => f.name)));
    document.querySelector(`.cat-link[data-cat="${c.id}"]`)?.toggleAttribute('hidden', items.length === 0);
    if (!items.length) continue;
    shown += items.length;
    main.append(h('section', { class: 'section', id: `cat-${c.id}`, dataset: { cat: c.id }, 'aria-labelledby': `t-${c.id}` },
      h('h2', { class: 'section-title', id: `t-${c.id}` }, c.name),
      c.description ? h('p', { class: 'card-desc', style: 'margin:-6px 0 12px' }, c.description) : null,
      h('div', { class: 'grid' }, items.map((p) => productCard(p, c)))));
  }
  if (!shown) {
    main.append(h('div', { class: 'state' }, icon('search'), h('h2', {}, 'Nada encontrado'),
      h('p', {}, `Nenhum produto corresponde a “${query.trim()}”.`)));
  }
}

function productCard(p, category) {
  const hasPromo = p.kind === 'simple' && !p.price_review && p.promoCents !== null;
  let pizzaHint = null;
  let sizePrices = null;
  if (p.kind === 'pizza' && p.sizes.length) {
    const only = p.flavors.length === 1 ? p.flavors[0] : null;
    if (only && !only.price_review) {
      // Card de um sabor: mostra o preço de cada tamanho (ex.: P R$ 40,00 · M R$ 45,00 · G R$ 55,90)
      sizePrices = p.sizes.map((s) => {
        const fp = catalog.flavorPrice(only.id, s.id);
        return fp ? h('span', { class: 'size-price' }, h('b', {}, s.name), ` ${formatCents(fp.effectiveCents)}`) : null;
      }).filter(Boolean);
    } else if (!only) {
      const maxF = Math.max(...p.sizes.map((s) => s.max_flavors));
      pizzaHint = `${p.sizes.map((s) => s.name).join(', ')} · até ${maxF} sabor${maxF > 1 ? 'es' : ''}`;
    }
  }
  const qtyHint = p.qtyPromoMin ? `A partir de ${p.qtyPromoMin} un.: ${formatCents(p.qtyPromoCents)} cada` : null;

  return h('button', {
    type: 'button', class: 'card', dataset: { product: p.id },
    'aria-label': p.fromCents === null ? `${p.name}, preço em confirmação`
      : sizePrices?.length ? `${p.name}, ${sizePrices.map((el) => el.textContent).join(', ')}`
        : `${p.name}, ${p.kind === 'pizza' ? 'a partir de ' : ''}${formatCents(p.fromCents)}`,
    onclick: () => openProductModal({
      catalog, productId: p.id, categoryName: category.name,
      onConfirm: (sel) => { cart.add(sel); toast(`${p.name} adicionado ao carrinho`); },
    }),
  },
  h('div', { class: 'card-body' },
    p.badge ? h('span', { class: `badge${hasPromo || /promo/i.test(p.badge) ? ' promo' : ''}` }, p.badge) : null,
    h('h3', { class: 'card-name' }, p.name),
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
    ? h('img', { class: 'thumb', src: p.image_url, alt: '', loading: 'lazy', width: 96, height: 96 })
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
            h('tr', {}, h('td', {}, z.name), h('td', {}, Number(z.fee) > 0 ? formatPrice(z.fee) : 'Grátis')))))) : null,
        catalog.payments.length ? h('div', {}, h('h3', {}, 'Formas de pagamento'),
          h('div', { class: 'chips' }, catalog.payments.map((p) => h('span', { class: 'chip' }, p.name)))) : null)));
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.showModal();
}

// ---------------------------------------------------------------- rodapé
function renderFooter() {
  const s = catalog.settings;
  const year = new Date().getFullYear();
  return h('footer', { class: 'footer' }, h('div', { class: 'wrap' },
    h('div', {}, h('h2', {}, s.name), s.tagline ? h('p', {}, s.tagline) : null,
      s.address_line ? h('p', {}, s.address_line) : null,
      s.maps_url ? h('p', {}, h('a', { href: s.maps_url, target: '_blank', rel: 'noopener noreferrer' }, 'Como chegar')) : null),
    h('div', {}, h('h3', {}, 'Contato'),
      s.phone_display ? h('p', {}, s.phone_display) : null,
      s.whatsapp_number ? h('p', {}, h('a', { href: `https://wa.me/${s.whatsapp_number}`, target: '_blank', rel: 'noopener noreferrer' }, 'WhatsApp')) : null,
      s.instagram_url ? h('p', {}, h('a', { href: s.instagram_url, target: '_blank', rel: 'noopener noreferrer' }, 'Instagram')) : null,
      !s.phone_display && !s.whatsapp_number && !s.instagram_url ? h('p', {}, 'Contatos ainda não informados.') : null),
    h('div', {}, h('h3', {}, 'Horários'),
      hoursByDay(catalog.hours).filter((d) => d.slots.length).map((d) => h('p', {}, `${d.name}: ${d.slots.join(', ')}`)),
      !catalog.hours.length ? h('p', {}, 'Ainda não informados.') : null),
    h('p', { class: 'fine' }, `© ${year} ${s.name}. Os pedidos são enviados pelo WhatsApp e só são confirmados após a resposta da pizzaria.`)));
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
