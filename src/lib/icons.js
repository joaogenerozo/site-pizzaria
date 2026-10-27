import { svg } from './dom.js';

// Ícones próprios em SVG (traço simples, 24x24). Conteúdo estático do código.
const stroke = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const ICONS = {
  search: stroke('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  close: stroke('<path d="M18 6 6 18M6 6l12 12"/>'),
  clock: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  bike: stroke('<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h2l3 7.5M5.5 17.5 9 10h6l3.5 7.5M9 10 7.5 6H5"/>'),
  bag: stroke('<path d="M6 7h12l1 13H5Z"/><path d="M9 7a3 3 0 0 1 6 0"/>'),
  pin: stroke('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  info: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  cart: stroke('<path d="M3 4h2l2.4 11h10.2L20 8H6.2"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>'),
  alert: stroke('<path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17h.01"/>'),
  phone: stroke('<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/>'),
  minus: stroke('<path d="M5 12h14"/>'),
  plus: stroke('<path d="M12 5v14M5 12h14"/>'),
  left: stroke('<path d="m15 18-6-6 6-6"/>'),
  right: stroke('<path d="m9 18 6-6-6-6"/>'),
  chat: stroke('<path d="M20 11.5a8.5 8.5 0 0 1-12.4 7.6L3 20.5l1.4-4.4A8.5 8.5 0 1 1 20 11.5Z"/><path d="M8.5 10h7M8.5 13.5h4.5"/>'),
};

export function icon(name) {
  return svg(ICONS[name]);
}

// Ilustrações de reserva quando o produto não tem foto
const PIZZA = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="#e9a23b"/><circle cx="32" cy="32" r="22" fill="#f6c453"/><circle cx="24" cy="25" r="4.5" fill="#b8321b"/><circle cx="40" cy="23" r="4" fill="#b8321b"/><circle cx="37" cy="39" r="4.5" fill="#b8321b"/><circle cx="23" cy="40" r="3.5" fill="#b8321b"/><path d="M30 31c2-2 5-1 5 1M44 31c-1 2 0 3 2 3M28 46c1-2 3-2 4 0" stroke="#2f7d4f" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`;
const DRINK = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 14h24l-3 40a4 4 0 0 1-4 4H27a4 4 0 0 1-4-4Z" fill="#fff" stroke="#b8321b" stroke-width="3"/><path d="M22.5 26h19l-2 26a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3Z" fill="#b8321b" opacity=".85"/><path d="M36 14 40 4" stroke="#2f7d4f" stroke-width="3" stroke-linecap="round"/><circle cx="29" cy="36" r="1.6" fill="#fff"/><circle cx="34" cy="44" r="1.3" fill="#fff"/></svg>`;
const DISH = `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="42" rx="26" ry="9" fill="#fff" stroke="#e9a23b" stroke-width="3"/><path d="M14 40c2-12 10-18 18-18s16 6 18 18" fill="#f6c453"/><path d="M22 30l3-8M30 28l1-9M38 29l2-8M44 33l4-6" stroke="#e9a23b" stroke-width="3" stroke-linecap="round"/></svg>`;
const SWEET = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 34h40l-4 18a4 4 0 0 1-4 3H20a4 4 0 0 1-4-3Z" fill="#b8321b"/><path d="M14 34c0-10 8-18 18-18s18 8 18 18Z" fill="#f6c453"/><circle cx="32" cy="12" r="5" fill="#b8321b"/><path d="M22 28h.01M30 24h.01M40 28h.01" stroke="#7a3b16" stroke-width="4" stroke-linecap="round"/></svg>`;

export function illustration(product, categoryName = '') {
  const n = `${categoryName} ${product?.name || ''}`.toLowerCase();
  if (product?.kind === 'pizza' || n.includes('pizza')) return svg(PIZZA);
  if (/bebida|refri|suco|água|agua|cerveja/.test(n)) return svg(DRINK);
  if (/doce|sobremesa|chocolate/.test(n)) return svg(SWEET);
  return svg(DISH);
}

export function pizzaArt() {
  return svg(PIZZA);
}
