// Criação de elementos sem innerHTML: todo texto vindo do banco entra como
// textContent, o que impede XSS mesmo que um nome de produto contenha HTML.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'href' || key === 'src') el.setAttribute(key, safeUrl(value));
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

// Como Element.append, mas ignora null/false (o append nativo escreveria "null")
export function add(el, ...children) {
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

// Só permite http(s), mailto, tel, âncoras, caminhos relativos e imagens embutidas.
export function safeUrl(url) {
  const s = String(url).trim();
  if (/^(https?:|mailto:|tel:|#|\.{0,2}\/)/i.test(s)) return s;
  if (/^data:image\/(png|jpeg|webp|svg\+xml);/i.test(s)) return s;
  return '#';
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// SVG estático e confiável (escrito no código, nunca vindo do banco)
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}
