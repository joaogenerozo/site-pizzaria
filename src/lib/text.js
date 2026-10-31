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

// "Frango com Catupiry" -> "frango-com-catupiry" (sem acentos, só letras e números)
export function slugify(s) {
  return normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Liga cada arquivo ao item de mesmo nome: "Frango com Catupiry.jpg" ou
// "frango-com-catupiry.webp" -> Frango com Catupiry. Nome exato primeiro; se não
// houver, aceita um único item cujo nome contenha o do arquivo (ex.:
// "meio-a-meio.webp" -> "Pizza 2 sabores (meio a meio)"). Cada item recebe no
// máximo um arquivo. Devolve { matches: [{ file, item }], unmatched: [file] }.
export function matchFilesToItems(files, items, nameOf = (f) => f.name) {
  const slugs = items.map((it) => ({ it, s: slugify(it.name) }));
  const taken = new Set();
  const matches = [];
  const unmatched = [];
  for (const file of files) {
    const base = slugify(String(nameOf(file)).replace(/\.[a-z0-9]+$/i, ''));
    let found = base ? slugs.filter(({ s }) => s === base) : [];
    if (!found.length && base) found = slugs.filter(({ s }) => `-${s}-`.includes(`-${base}-`));
    const one = found.length === 1 ? found[0].it : null;
    if (!one || taken.has(one)) { unmatched.push(file); continue; }
    taken.add(one);
    matches.push({ file, item: one });
  }
  return { matches, unmatched };
}
