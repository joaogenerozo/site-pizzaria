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
