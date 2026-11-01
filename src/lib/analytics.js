// Google Analytics 4: fica DESLIGADO até existir VITE_GA4_ID no build e o visitante
// tocar em "Aceitar" no aviso de cookies (LGPD). Sem isso, nenhum script do Google é
// baixado e track() não faz nada.
//
// Eventos (nomes recomendados pelo GA4):
//   view_item       abriu o detalhe de um produto
//   add_to_cart     adicionou um item ao carrinho
//   begin_checkout  tocou em "Continuar" no carrinho
//   generate_lead   tocou num link do WhatsApp (lead_source: "pedido" ou "contato")
// O pedido é concluído fora do site (no WhatsApp), então NÃO existe evento "purchase":
// tocar no WhatsApp é um contato/lead, não uma venda confirmada.

const GA_ID = String(import.meta.env.VITE_GA4_ID || '').trim();
export const analyticsEnabled = /^G-[A-Z0-9]{4,15}$/.test(GA_ID);

const CONSENT_KEY = 'domingos-cookies-analytics';
let loaded = false;

export function consentChoice() {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
}

export function setConsent(granted) {
  try { localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied'); } catch { /* modo anônimo */ }
  if (!analyticsEnabled) return;
  if (granted) {
    window[`ga-disable-${GA_ID}`] = false;
    load();
  } else {
    // Para de medir já nesta visita; os cookies _ga deixam de ser renovados
    window[`ga-disable-${GA_ID}`] = true;
    for (const name of document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => n === '_ga' || n.startsWith('_ga_'))) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${location.hostname.replace(/^www\./, '.')}`;
      document.cookie = `${name}=; Max-Age=0; path=/`;
    }
  }
}

function load() {
  if (loaded) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  // gtag precisa receber o objeto "arguments" (é assim que o script do Google lê a fila)
  window.gtag = function gtag() { window.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.append(s);
}

// Chamado uma vez ao abrir o site: só carrega se o visitante já aceitou antes
export function initAnalytics() {
  if (analyticsEnabled && consentChoice() === 'granted') load();
}

export function track(name, params = {}) {
  if (!loaded || window[`ga-disable-${GA_ID}`]) return;
  window.gtag('event', name, { currency: 'BRL', ...params });
}

const reais = (cents) => (Number.isFinite(cents) ? Math.round(cents) / 100 : undefined);

// Item no formato do GA4 a partir de uma seleção do cardápio (sel do productModal / item do carrinho)
export function gaItem(catalog, sel, lineCents) {
  const product = catalog.products.get(sel.productId);
  if (!product) return null;
  const category = catalog.categories.find((c) => c.id === product.category_id);
  const size = product.sizes?.find((s) => s.id === sel.sizeId);
  const quantity = sel.quantity || 1;
  return {
    item_id: product.slug || product.id,
    item_name: product.name,
    item_category: category?.name,
    item_variant: size?.name,
    price: reais(Number.isFinite(lineCents) ? lineCents / quantity : product.fromCents),
    quantity,
  };
}

export { reais as centsToReais };
