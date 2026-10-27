// Normaliza para busca: sem acentos, minúsculas, espaços simples.
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesSearch(query, ...fields) {
  const q = normalize(query);
  if (!q) return true;
  const hay = normalize(fields.filter(Boolean).join(' '));
  return q.split(' ').every((term) => hay.includes(term));
}

// Texto alternativo da foto de um produto: o nome e, quando acrescenta algo, a
// categoria (ex.: "Calabresa - Pizzas de calabresa"; "Pizza doce" fica só o nome).
export function productImageAlt(name, categoryName) {
  const n = normalize(name);
  const c = normalize(categoryName);
  return c && !n.includes(c) ? `${name} - ${categoryName}` : String(name ?? '');
}
