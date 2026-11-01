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

// Sugestão de texto alternativo para a foto que o admin envia: descreve o que
// aparece ("Pizza de Frango com Catupiry", "Pizza doce de Banana Nevada").
export function suggestImageAlt(name, { kind, groupType } = {}) {
  const n = String(name ?? '').trim();
  if (!n) return '';
  if (kind !== 'pizza' || /^pizza\b/i.test(n)) return n;
  return groupType === 'pizzas_doces' ? `Pizza doce de ${n}` : `Pizza de ${n}`;
}

// "Frango com Catupiry" -> "frango-com-catupiry" (sem acentos, só letras e números)
export function slugify(s) {
  return normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Sugere o produto de cada arquivo pelo nome: "Frango com Catupiry.jpg",
// "frango-com-catupiry.webp" ou "pizza-frango-com-catupiry.webp" -> Frango com
// Catupiry. Nunca escolhe sozinho quando há dúvida:
//   exact     um único produto com o mesmo nome (ou o mesmo endereço amigável)
//   partial   nenhum igual, mas um único produto contém o nome do arquivo -> confira
//   ambiguous mais de um produto possível, ou outro arquivo já pegou o mesmo -> escolha
//   none      nada parecido
// Devolve [{ file, status, item, candidates }] na mesma ordem dos arquivos.
export function matchImageFiles(files, items, nameOf = (f) => f.name) {
  const keyed = items.map((it) => {
    const names = new Set([slugify(it.name)]);
    if (it.slug) names.add(it.slug);
    for (const n of [...names]) if (n.startsWith('pizza-')) names.add(n.slice(6));
    return { it, names, s: slugify(it.name) };
  });
  const rows = files.map((file) => {
    const raw = slugify(String(nameOf(file)).replace(/\.[a-z0-9]+$/i, ''));
    const base = raw.replace(/-(\d{2,4}x\d{2,4}|final|foto|img|copia|copy)$/g, '');
    if (!base) return { file, status: 'none', item: null, candidates: [] };
    const bare = base.startsWith('pizza-') ? base.slice(6) : base;
    let found = keyed.filter(({ names }) => names.has(base) || names.has(bare));
    if (found.length === 1) return { file, status: 'exact', item: found[0].it, candidates: [found[0].it] };
    if (found.length > 1) return { file, status: 'ambiguous', item: null, candidates: found.map((k) => k.it) };
    found = keyed.filter(({ s }) => `-${s}-`.includes(`-${bare}-`));
    if (found.length === 1) return { file, status: 'partial', item: found[0].it, candidates: [found[0].it] };
    return { file, status: found.length ? 'ambiguous' : 'none', item: null, candidates: found.map((k) => k.it) };
  });
  // Dois arquivos para o mesmo produto: nenhum dos dois é escolhido sozinho
  const count = new Map();
  for (const r of rows) if (r.item) count.set(r.item, (count.get(r.item) || 0) + 1);
  for (const r of rows) {
    if (r.item && count.get(r.item) > 1) { r.status = 'ambiguous'; r.candidates = [r.item]; r.item = null; r.duplicate = true; }
  }
  return rows;
}
