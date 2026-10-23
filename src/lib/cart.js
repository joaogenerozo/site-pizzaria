// Carrinho persistido no localStorage. Guarda apenas IDs, quantidades,
// escolhas e observações — NUNCA preços. Os valores são sempre recalculados
// a partir do catálogo e, no fechamento, pelo banco (calculate_order).

const STORAGE_KEY = 'cardapio-cart-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_QTY = 99;
export const MAX_NOTES = 140;

const isId = (v) => typeof v === 'string' && UUID.test(v);
const idList = (v) => (Array.isArray(v) ? v.filter(isId) : []);

// Normaliza e valida um item vindo do localStorage ou da interface.
export function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object' || !isId(raw.productId)) return null;
  const quantity = raw.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) return null;
  const item = {
    productId: raw.productId,
    quantity,
    sizeId: isId(raw.sizeId) ? raw.sizeId : null,
    // a ordem dos sabores é preservada (é a ordem escolhida), mas a chave usa a ordenada
    flavorIds: [...new Set(idList(raw.flavorIds))],
    crustId: isId(raw.crustId) ? raw.crustId : null,
    extraIds: [...new Set(idList(raw.extraIds))].sort(),
    notes: typeof raw.notes === 'string' ? raw.notes.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_NOTES) : '',
  };
  item.key = itemKey(item);
  return item;
}

// Itens só se juntam quando TODAS as escolhas são iguais.
export function itemKey(i) {
  return JSON.stringify([i.productId, i.sizeId, [...i.flavorIds].sort(), i.crustId, [...i.extraIds].sort(), i.notes]);
}

// Em alguns navegadores (aba anônima, cookies bloqueados) só acessar o
// localStorage já lança erro; nesse caso o carrinho fica só em memória.
function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createCart(storage = defaultStorage()) {
  let items = load();
  const listeners = new Set();

  function load() {
    try {
      const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.map(sanitizeItem).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function save() {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(items.map(({ key, ...rest }) => rest)));
    } catch { /* modo privado ou armazenamento cheio: o carrinho segue só em memória */ }
    listeners.forEach((fn) => fn(items));
  }

  return {
    get items() { return items; },
    get count() { return items.reduce((n, i) => n + i.quantity, 0); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    add(raw) {
      const item = sanitizeItem(raw);
      if (!item) throw new Error('Item inválido.');
      const existing = items.find((i) => i.key === item.key);
      if (existing) {
        existing.quantity = Math.min(MAX_QTY, existing.quantity + item.quantity);
      } else {
        items = [...items, item];
      }
      save();
    },

    // Substitui o item na posição index (edição das personalizações)
    replace(index, raw) {
      const item = sanitizeItem(raw);
      if (!item || !items[index]) throw new Error('Item inválido.');
      const others = items.filter((_, i) => i !== index);
      const twin = others.find((i) => i.key === item.key);
      if (twin) {
        twin.quantity = Math.min(MAX_QTY, twin.quantity + item.quantity);
        items = others;
      } else {
        items = items.map((it, i) => (i === index ? item : it));
      }
      save();
    },

    setQuantity(index, quantity) {
      const q = Number(quantity);
      if (!items[index] || !Number.isInteger(q)) return;
      if (q < 1) return this.remove(index);
      items[index].quantity = Math.min(MAX_QTY, q);
      save();
    },

    remove(index) {
      items = items.filter((_, i) => i !== index);
      save();
    },

    clear() {
      items = [];
      save();
    },

    // Remove itens que deixaram de existir/ficaram inválidos no cardápio atual
    reconcile(isValid) {
      const before = items.length;
      items = items.filter(isValid);
      if (items.length !== before) save();
      return before - items.length;
    },

    reload() {
      items = load();
      listeners.forEach((fn) => fn(items));
    },
  };
}
