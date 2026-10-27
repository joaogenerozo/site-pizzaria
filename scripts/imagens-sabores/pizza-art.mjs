// Ilustrações dos sabores: SVG desenhado a partir dos ingredientes de cada pizza.
// Vista de cima, fundo azul-marinho da marca, prato branco com aro vermelho.

export const W = 1200, H = 900, CX = 600, CY = 450;
const R_CRUST = 362, R_TOP = 318, R_PLACE = 285;

// ------------------------------------------------------------ aleatório com semente
function hash(str) {
  let h = 2166136261;
  for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngFrom(seed) {
  let a = hash(seed);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => Math.round(n * 10) / 10;

// Espalha n pontos no disco (ou meia-pizza) mantendo distância mínima
function scatter(rng, n, { rMax = R_PLACE, minDist = 40, taken = [], half = null } = {}) {
  const pts = [];
  let tries = 0;
  while (pts.length < n && tries < n * 400) {
    tries++;
    const r = rMax * Math.sqrt(rng());
    const a = rng() * Math.PI * 2;
    const x = CX + r * Math.cos(a), y = CY + r * Math.sin(a);
    if (half === 'L' && x > CX - 14) continue;
    if (half === 'R' && x < CX + 14) continue;
    const md = tries > n * 250 ? minDist * 0.6 : minDist;
    if ([...pts, ...taken].some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < (md * (p.k ?? 1)) ** 2)) continue;
    pts.push({ x, y, a: rng() * 360, s: 0.85 + rng() * 0.3 });
  }
  taken.push(...pts);
  return pts;
}
const at = (p, inner, extraScale = 1) => `<g transform="translate(${f(p.x)} ${f(p.y)}) rotate(${f(p.a)}) scale(${f(p.s * extraScale * 100) / 100})">${inner}</g>`;

// Forma irregular (queijo derretido, manchas)
function blob(rng, cx, cy, r, wobble = 0.12, points = 18) {
  const pts = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (1 - wobble + rng() * wobble * 2);
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  let d = '';
  for (let i = 0; i < points; i++) {
    const p0 = pts[(i - 1 + points) % points], p1 = pts[i], p2 = pts[(i + 1) % points], p3 = pts[(i + 2) % points];
    if (i === 0) d += `M${f(p1[0])} ${f(p1[1])}`;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

// ------------------------------------------------------------ peças de cobertura
// Cada peça é desenhada na origem; at() posiciona, gira e escala.
const PIECES = {
  calabresa: (rng) => `<circle r="27" fill="#a3242a"/><circle r="22.5" fill="#c6393a"/>`
    + Array.from({ length: 7 }, () => `<circle cx="${f((rng() - 0.5) * 30)}" cy="${f((rng() - 0.5) * 30)}" r="${f(1.6 + rng() * 2)}" fill="#f2b8a8" opacity=".85"/>`).join('')
    + `<path d="M-14 -12a20 20 0 0 1 16 -7" stroke="#fff" stroke-opacity=".35" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  bacon: (rng) => {
    const w = 30 + rng() * 8;
    const wave = (y) => `M${-w} ${y}q${f(w / 2)} -7 ${f(w)} 0t${f(w)} 0`;
    return `<path d="${wave(-9)}v20${'q' + f(-w / 2) + ' 7 ' + f(-w) + ' 0t' + f(-w) + ' 0'}Z" fill="#a52a2a"/>`
      + `<path d="${wave(-3)}" stroke="#f3cdb5" stroke-width="5" fill="none"/>`
      + `<path d="${wave(5)}" stroke="#d0574d" stroke-width="3" fill="none"/>`
      + `<path d="${wave(-9)}" stroke="#7e1d1d" stroke-width="2" fill="none" opacity=".6"/>`;
  },
  frango: (rng) => `<path d="${blob(rng, 0, 0, 20, 0.3, 9)}" fill="#d6a565"/>`
    + Array.from({ length: 7 }, () => {
      const x = (rng() - 0.5) * 26, y = (rng() - 0.5) * 22, l = 7 + rng() * 8, a = rng() * 180;
      return `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})" d="M${f(-l)} 0q${f(l / 2)} -3 ${f(l)} 0t${f(l)} 0" stroke="${rng() < 0.5 ? '#f0d4a2' : '#e4bb7c'}" stroke-width="${f(4.5 + rng() * 2.5)}" fill="none" stroke-linecap="round"/>`;
    }).join(''),
  milho: () => `<rect x="-6" y="-7" width="12" height="14" rx="5" fill="#f2b705"/><rect x="-4" y="-5" width="5" height="6" rx="2.5" fill="#ffe27a"/>`,
  brocolis: (rng) => `<path d="M-3 4l-3 18h12l-3 -18Z" fill="#7fae4c"/>`
    + Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2, rr = 9 + rng() * 4;
      return `<circle cx="${f(Math.cos(a) * rr)}" cy="${f(Math.sin(a) * rr - 4)}" r="${f(9 + rng() * 3)}" fill="${i % 2 ? '#2f6b2a' : '#3d7f34'}"/>`;
    }).join('') + `<circle cx="0" cy="-4" r="10" fill="#4b8f3c"/><circle cx="-4" cy="-8" r="3" fill="#7cbf5a" opacity=".7"/>`,
  alho: () => `<ellipse rx="5" ry="3.4" fill="#d9a441"/><ellipse rx="2.6" ry="1.6" cx="-1" cy="-.5" fill="#f3d27e"/>`,
  cebola: (rng) => {
    const r = 18 + rng() * 10, sweep = 2.2 + rng() * 2;
    const x1 = r * Math.cos(-sweep / 2), y1 = r * Math.sin(-sweep / 2), x2 = r * Math.cos(sweep / 2), y2 = r * Math.sin(sweep / 2);
    const d = `M${f(x1)} ${f(y1)}A${f(r)} ${f(r)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${f(x2)} ${f(y2)}`;
    return `<path d="${d}" stroke="#efe1ec" stroke-width="7" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#a8679a" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7" transform="scale(1.1)"/>`;
  },
  azeitona: () => `<ellipse rx="11" ry="9.5" fill="#1d1a1f"/><ellipse rx="4" ry="3.4" fill="#5b4a3e"/><path d="M-6 -5a8 7 0 0 1 6 -2.5" stroke="#fff" stroke-opacity=".35" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  presunto: (rng) => `<path d="${blob(rng, 0, 0, 24, 0.18, 10)}" fill="#e98f93"/><path d="${blob(rng, 0, 0, 17, 0.2, 9)}" fill="#f4a9ab"/><path d="M-12 -6q8 -6 16 0" stroke="#fff" stroke-opacity=".4" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  tomate: (rng) => `<circle r="26" fill="#c9272f"/><circle r="22" fill="#e2453f"/>`
    + [0, 1, 2, 3].map((i) => {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      return `<ellipse cx="${f(Math.cos(a) * 11)}" cy="${f(Math.sin(a) * 11)}" rx="6" ry="4" transform="rotate(${f(a * 57.3)} ${f(Math.cos(a) * 11)} ${f(Math.sin(a) * 11)})" fill="#f6a35f" opacity=".9"/>`;
    }).join('') + `<circle r="4" fill="#f7c6a0"/>` + (rng() < 2 ? '' : ''),
  ovo: (rng) => `<path d="${blob(rng, 0, 0, 17, 0.25, 8)}" fill="#fbfaf3"/><path d="${blob(rng, 2, 1, 8, 0.2, 7)}" fill="#f6b51e"/>`,
  palmito: () => `<circle r="17" fill="#efe6c6"/><circle r="12" fill="none" stroke="#d9cd9f" stroke-width="2.5"/><circle r="6" fill="none" stroke="#d9cd9f" stroke-width="2"/>`,
  champignon: () => `<path d="M-20 2a20 18 0 0 1 40 0q0 4 -6 4h-7v14q0 4 -4 4h-6q-4 0 -4 -4v-14h-7q-6 0 -6 -4Z" fill="#c9a77d"/><path d="M-15 1a15 12 0 0 1 30 0" stroke="#9c7a52" stroke-width="2" fill="none"/><path d="M-4 7v13M4 7v13" stroke="#e3cfae" stroke-width="2"/>`,
  requeijao: (rng) => `<path d="${blob(rng, 0, 0, 24, 0.16, 12)}" fill="#f4ecda"/><path d="${blob(rng, -2, -2, 20, 0.16, 11)}" fill="#fffdf7"/><ellipse cx="-8" cy="-9" rx="7" ry="4" fill="#fff"/>`,
  cheddar: (rng) => `<path d="${blob(rng, 0, 0, 21, 0.25, 11)}" fill="#f08a12"/><path d="${blob(rng, -3, -3, 11, 0.25, 8)}" fill="#f9a93a"/>`,
  parmesao: (rng) => `<path d="M${-12 - rng() * 4} -4l${20 + rng() * 6} -5l${-4} 10l${-18} 3Z" fill="#ecd28c" stroke="#c9a457" stroke-width="1.5" stroke-linejoin="round"/>`,
  provolone: (rng) => `<path d="${blob(rng, 0, 0, 20, 0.22, 10)}" fill="#e6b04f"/><path d="${blob(rng, -3, -3, 9, 0.25, 7)}" fill="#f3cd7d"/>`,
  gorgonzola: (rng) => `<path d="${blob(rng, 0, 0, 17, 0.28, 9)}" fill="#f5f2e6"/>`
    + Array.from({ length: 5 }, () => `<circle cx="${f((rng() - 0.5) * 20)}" cy="${f((rng() - 0.5) * 20)}" r="${f(1.5 + rng() * 2)}" fill="#5f8a7c"/>`).join(''),
  lombo: () => `<ellipse rx="30" ry="21" fill="#8f4b3a"/><ellipse rx="26" ry="17" fill="#d98c7e"/><ellipse rx="15" ry="9" cx="-3" cy="-1" fill="#e9a596" opacity=".9"/>`,
  atum: (rng) => Array.from({ length: 4 }, () => `<path d="${blob(rng, (rng() - 0.5) * 20, (rng() - 0.5) * 16, 8 + rng() * 4, 0.35, 7)}" fill="${rng() < 0.5 ? '#c9b09b' : '#b8977e'}"/>`).join(''),
  fraldinha: () => `<path d="M-30 -9q30 -8 60 0l-3 16q-27 7 -54 0Z" fill="#6b3426"/><path d="M-26 -3q26 -6 52 0" stroke="#9a5a43" stroke-width="3" fill="none"/><path d="M-24 4q24 -4 48 0" stroke="#4a2219" stroke-width="2" fill="none" opacity=".7"/>`,
  peru: () => `<circle r="27" fill="#f1b8b2"/><circle r="23" fill="#f7cdc6"/><path d="M-12 -10q10 -6 22 0" stroke="#fff" stroke-opacity=".5" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  abacaxi: () => `<path d="M-13 9l13 -22l13 22Z" fill="#f7cf3c" stroke="#e0a51c" stroke-width="2.5" stroke-linejoin="round"/><path d="M0 -6v12" stroke="#fbe58a" stroke-width="2"/>`,
  geleia: (rng) => `<path d="${blob(rng, 0, 0, 10, 0.3, 8)}" fill="#c3102a"/><ellipse cx="-3" cy="-3" rx="3.4" ry="2.2" fill="#ff8a8a" opacity=".8"/>`,
  pimenta: () => `<rect x="-3" y="-1.4" width="6" height="2.8" rx="1.2" fill="#d1261f"/>`,
  oregano: (rng) => `<rect x="-2" y="-1" width="${f(3 + rng() * 2)}" height="2.2" rx="1" fill="${rng() < 0.5 ? '#4e6b2c' : '#3b5323'}"/>`,
  strogonoff: (rng) => `<path d="${blob(rng, 0, 0, 22, 0.25, 10)}" fill="#c7864e"/><path d="${blob(rng, -4, -3, 10, 0.3, 7)}" fill="#e3a86c"/>`,
  batataPalha: (rng) => Array.from({ length: 7 }, () => {
    const x = (rng() - 0.5) * 34, y = (rng() - 0.5) * 30, a = rng() * 180, l = 10 + rng() * 9;
    return `<rect transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})" x="${f(-l / 2)}" y="-1.6" width="${f(l)}" height="3.2" rx="1.4" fill="${rng() < 0.5 ? '#f4c44c' : '#e9ad2f'}"/>`;
  }).join(''),
  uva: () => `<ellipse rx="15" ry="12" fill="#9cc24b"/><ellipse rx="10" ry="7.5" fill="#c3dc76"/><path d="M-6 -4q4 -3 9 -1" stroke="#fff" stroke-opacity=".6" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  brownie: (rng) => `<rect x="-14" y="-12" width="28" height="24" rx="4" fill="#4a2a1a" transform="rotate(${f(rng() * 20 - 10)})"/><rect x="-10" y="-9" width="9" height="6" rx="2" fill="#6b3f27"/>`,
  amendoim: () => `<ellipse rx="6" ry="4.2" fill="#c98a4b"/><ellipse rx="3" ry="1.8" cx="-1" cy="-1" fill="#e2ad73"/>`,
  morango: (rng) => `<path d="M0 22c-14 -6 -22 -16 -20 -26c2 -8 10 -10 20 -6c10 -4 18 -2 20 6c2 10 -6 20 -20 26Z" fill="#d61f3b"/><path d="M0 18c-9 -5 -14 -12 -13 -19" stroke="#f26b80" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`
    + Array.from({ length: 7 }, () => `<ellipse cx="${f((rng() - 0.5) * 22)}" cy="${f((rng() - 0.3) * 20)}" rx="1.2" ry="1.8" fill="#fbe08a"/>`).join('')
    + `<path d="M-8 -9q8 -8 16 0q-8 3 -16 0Z" fill="#3e8d3a"/>`,
  bombom: () => `<circle r="16" fill="#fbf6ec"/><circle r="16" fill="none" stroke="#c9b48c" stroke-width="2.5"/><circle r="8" fill="#c79a5a"/><circle r="4" cx="-2" cy="-2" fill="#e2c08a"/>`,
  banana: (rng) => `<circle r="19" fill="#d9b44a"/><circle r="17" fill="#f6e08e"/><circle r="13" fill="#fbefc0"/>`
    + Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * Math.PI * 2;
      return `<circle cx="${f(Math.cos(a) * 5)}" cy="${f(Math.sin(a) * 5)}" r="1.4" fill="#8a6a3a"/>`;
    }).join('') + (rng() < 0 ? '' : ''),
  goiaba: (rng) => `<rect x="-15" y="-13" width="30" height="26" rx="6" fill="#a8172e" transform="rotate(${f(rng() * 30 - 15)})"/><rect x="-10" y="-9" width="11" height="6" rx="3" fill="#d84a5c" opacity=".8"/>`,
  lima: (rng) => `<path d="M-6 0q3 -${f(3 + rng() * 3)} 6 0t6 0" stroke="#7dc242" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
};

// ------------------------------------------------------------ camadas de base
function crustAndBase(rng, base) {
  const crust = blob(rng, CX, CY, R_CRUST, 0.012, 40);
  const inner = blob(rng, CX, CY, R_CRUST - 34, 0.015, 36);
  let out = `<path d="${crust}" fill="url(#crust)"/>`;
  // manchinhas tostadas na borda
  for (let i = 0; i < 46; i++) {
    const a = rng() * Math.PI * 2, r = R_CRUST - 10 - rng() * 22;
    out += `<ellipse cx="${f(CX + r * Math.cos(a))}" cy="${f(CY + r * Math.sin(a))}" rx="${f(4 + rng() * 9)}" ry="${f(2 + rng() * 4)}" transform="rotate(${f(a * 57.3 + 90)} ${f(CX + r * Math.cos(a))} ${f(CY + r * Math.sin(a))})" fill="#a45f23" opacity="${f(0.25 + rng() * 0.3)}"/>`;
  }
  const sauceColor = base.sweet ? base.sauce : '#b8261c';
  out += `<path d="${inner}" fill="${sauceColor}"/>`;
  if (!base.sweet) {
    for (let i = 0; i < 22; i++) {
      const a = rng() * Math.PI * 2, r = rng() * (R_CRUST - 50);
      out += `<circle cx="${f(CX + r * Math.cos(a))}" cy="${f(CY + r * Math.sin(a))}" r="${f(6 + rng() * 16)}" fill="#d23a2a" opacity=".35"/>`;
    }
  }
  return out;
}

function cheeseLayer(rng, color, light, spots, half = null) {
  const d = blob(rng, CX, CY, R_TOP, 0.07, 30);
  let out = '';
  const clip = half ? ` clip-path="url(#half${half})"` : '';
  out += `<g${clip}><path d="${d}" fill="${color}"/>`;
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2, r = rng() * (R_TOP - 40);
    out += `<path d="${blob(rng, CX + r * Math.cos(a), CY + r * Math.sin(a), 8 + rng() * 16, 0.3, 9)}" fill="${light}" opacity=".75"/>`;
  }
  if (spots) {
    for (let i = 0; i < 34; i++) {
      const a = rng() * Math.PI * 2, r = rng() * (R_TOP - 30);
      out += `<path d="${blob(rng, CX + r * Math.cos(a), CY + r * Math.sin(a), 5 + rng() * 10, 0.35, 7)}" fill="${spots}" opacity=".45"/>`;
    }
  }
  return out + '</g>';
}

function drizzle(rng, color, width, lines = 7, half = null) {
  let out = '';
  for (let i = 0; i < lines; i++) {
    const y0 = CY - R_TOP + 50 + (i + 0.5) * ((2 * R_TOP - 100) / lines);
    const span = Math.sqrt(Math.max(0, R_TOP ** 2 - (y0 - CY) ** 2)) - 30;
    let x = half === 'R' ? CX + 20 : CX - span;
    const xEnd = half === 'L' ? CX - 20 : CX + span;
    let d = `M${f(x)} ${f(y0)}`;
    while (x < xEnd) {
      const step = 60 + rng() * 30;
      d += `q${f(step / 2)} ${f((rng() - 0.5) * 50)} ${f(step)} ${f((rng() - 0.5) * 10)}`;
      x += step;
    }
    out += `<path d="${d}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return `<g transform="rotate(${f(rng() * 40 - 20)} ${CX} ${CY})">${out}</g>`;
}

function dust(rng, color, n, size, half = null) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const r = R_TOP * Math.sqrt(rng()), a = rng() * Math.PI * 2;
    const x = CX + r * Math.cos(a);
    if (half === 'L' && x > CX - 6) continue;
    if (half === 'R' && x < CX + 6) continue;
    out += `<circle cx="${f(x)}" cy="${f(CY + r * Math.sin(a))}" r="${f(size * (0.5 + rng()))}" fill="${color}" opacity="${f(0.5 + rng() * 0.4)}"/>`;
  }
  return out;
}

// ------------------------------------------------------------ receita de cada sabor
// Cada item: [peça, quantidade, distância mínima, escala]
const has = (t, ...words) => words.some((w) => t.includes(w));

export function recipeFor(flavor) {
  const t = `${flavor.name} ${flavor.description}`.toLowerCase();
  const sweet = has(t, 'chocolate', 'banana', 'goiaba', 'moça', 'uva');
  const r = { sweet, base: null, items: [], drizzles: [], dust: [] };
  if (sweet) {
    if (has(t, 'chocolate branco')) r.base = { color: '#f6ecd8', light: '#fffaf0', sauce: '#e7d6b4' };
    else if (has(t, 'creme de leite')) r.base = { color: '#f8edcf', light: '#fffbea', sauce: '#efdcae' };
    else r.base = { color: '#f7dc8a', light: '#fdeeb8', spots: '#e2a64e', sauce: '#e9c77a' }; // mussarela
    if (has(t, 'chocolate preto')) r.drizzles.push(['#3a1f14', 8, 5]);
    if (has(t, 'uva')) r.items.push(['uva', has(t, 'morango') ? 10 : 14, 70, 1.7]);
    if (has(t, 'morango')) r.items.push(['morango', has(t, 'uva') ? 9 : 12, 84, 1.8]);
    if (has(t, 'brownie')) r.items.push(['brownie', 9, 76, 1.45]);
    if (has(t, 'sonho de valsa')) r.items.push(['bombom', 6, 80, 1.65]);
    if (has(t, 'amendoim')) r.items.push(['amendoim', 40, 22, 1.3]);
    if (has(t, 'banana')) r.items.push(['banana', 20, 68, 1.6]);
    if (has(t, 'goiaba')) r.items.push(['goiaba', 18, 70, 1.75]);
    if (has(t, 'lima')) r.items.push(['lima', 40, 24, 1.4]);
    if (has(t, 'cacau')) r.dust.push(['#5a3420', 500, 2.2]);
    if (has(t, 'leite em pó')) r.dust.push(['#ffffff', 420, 2.4]);
    if (has(t, 'canela')) r.dust.push(['#7a4a22', 900, 2.4], ['#fff8e6', 200, 1.6]);
    if (has(t, 'chocolate branco') && !has(t, 'chocolate preto')) r.drizzles.push(['#fffdf7', 7, 6]);
    return r;
  }
  const cheeses = has(t, 'mussarela', 'queijo') || flavor.name === 'Mussarela';
  if (cheeses) r.base = { color: '#f7d985', light: '#fdecb5', spots: '#d99b46' };
  else if (has(t, 'catupiry', 'requeijão')) r.base = { color: '#f8eedb', light: '#fffdf6', spots: '#e2c088', cream: true };
  else r.base = null; // só molho
  const many = (n) => Math.max(4, Math.round(n));
  const meats = [];
  if (t.replace('pimenta calabresa', '').includes('calabresa')) meats.push('calabresa');
  if (has(t, 'frango') && !has(t, 'strogonoff de frango')) meats.push('frango');
  if (has(t, 'presunto')) meats.push('presunto');
  if (has(t, 'lombo')) meats.push('lombo');
  if (has(t, 'peito de peru')) meats.push('peru');
  if (has(t, 'atum')) meats.push('atum');
  if (has(t, 'fraldinha')) meats.push('fraldinha');
  if (has(t, 'strogonoff')) meats.push('strogonoff');
  const sizeMeat = { calabresa: [14, 78, 1.35], frango: [16, 70, 1.45], presunto: [11, 80, 1.45], lombo: [10, 86, 1.4], peru: [10, 84, 1.4], atum: [16, 68, 1.45], fraldinha: [11, 82, 1.35], strogonoff: [15, 72, 1.4] };
  const meatShare = meats.length > 1 ? 0.65 : 1;
  for (const m of meats) {
    const [n, d, s] = sizeMeat[m];
    r.items.push([m, many(n * meatShare), d, s]);
  }
  if (has(t, 'brócolis')) r.items.push(['brocolis', 14, 78, 1.6]);
  if (has(t, 'alho')) r.items.push(['alho', 30, 24, 1.4]);
  if (has(t, 'milho')) r.items.push(['milho', has(t, 'frango') ? 45 : 75, 24, 1.45]);
  if (has(t, 'palmito')) r.items.push(['palmito', 12, 62, 1.45]);
  if (has(t, 'champignon')) r.items.push(['champignon', 11, 66, 1.4]);
  if (has(t, 'abacaxi')) r.items.push(['abacaxi', 12, 58, 1.5]);
  if (has(t, 'tomate')) r.items.push(['tomate', 8, 84, 1.4]);
  if (/\bovos?\b/.test(t)) r.items.push(['ovo', 13, 60, 1.45]);
  if (has(t, 'bacon')) r.items.push(['bacon', meats.length ? 8 : 12, 80, 1.3]);
  if (has(t, 'cheddar')) r.items.push(['cheddar', 11, 70, 1.5]);
  if (has(t, 'catupiry', 'requeijão') && !r.base?.cream) r.items.push(['requeijao', 9, 76, 1.55]);
  if (has(t, 'provolone')) r.items.push(['provolone', 8, 72, 1.5]);
  if (has(t, 'gorgonzola')) r.items.push(['gorgonzola', 9, 70, 1.5]);
  if (has(t, 'parmesão')) r.items.push(['parmesao', 24, 36, 1.5]);
  if (has(t, 'batata palha')) r.items.push(['batataPalha', 12, 66, 1.55]);
  if (has(t, 'cebola')) r.items.push(['cebola', has(t, 'acebolada', 'cebolas') ? 22 : 13, 44, 1.2]);
  if (has(t, 'geleia', 'geléia')) r.items.push(['geleia', 14, 50, 1.5]);
  if (has(t, 'barbecue')) r.drizzles.push(['#5a2414', 10, 6]);
  if (has(t, 'pimenta calabresa')) r.items.push(['pimenta', 70, 14, 1.4]);
  r.items.push(['azeitona', 8, 70, 1.35]);
  r.items.push(['oregano', 170, 9, 1.3]);
  return r;
}

function drawRecipe(rng, recipe, half = null) {
  let out = '';
  const clip = half ? ` clip-path="url(#half${half})"` : '';
  if (recipe.base) {
    if (recipe.base.partial) {
      // creme espalhado em manchas grandes, deixando o molho aparecer
      out += `<g${clip}>`;
      for (const p of scatter(rng, 12, { rMax: R_TOP - 40, minDist: 70, half })) {
        out += `<path d="${blob(rng, p.x, p.y, 46 + rng() * 18, 0.22, 12)}" fill="${recipe.base.color}"/>`;
      }
      out += '</g>';
    } else {
      out += cheeseLayer(rng, recipe.base.color, recipe.base.light, recipe.base.spots, half);
    }
  }
  const taken = [];
  for (const [kind, n, d, s] of recipe.items) {
    const small = ['oregano', 'pimenta', 'alho', 'milho', 'amendoim', 'lima', 'parmesao'].includes(kind);
    const shadow = small ? '' : ' filter="url(#shadow)"';
    const count = half ? Math.ceil(n / 2) : n;
    const pts = scatter(rng, count, { minDist: d, taken: small ? [] : taken, half, rMax: kind === 'oregano' ? R_TOP - 8 : R_PLACE });
    out += `<g${shadow}>${pts.map((p) => at(p, PIECES[kind](rng), s)).join('')}</g>`;
  }
  for (const [c, w, n] of recipe.drizzles) out += `<g${clip}>${drizzle(rng, c, w, n, half)}</g>`;
  for (const [c, n, s] of recipe.dust) out += dust(rng, c, half ? n / 2 : n, s, half);
  return out;
}

// ------------------------------------------------------------ cena completa
function background(rng) {
  let out = `<rect width="${W}" height="${H}" fill="url(#bg)"/>`;
  // folhas de manjericão e tomatinhos espalhados fora do prato
  const spots = [[110, 140, -30], [1080, 760, 140], [1095, 170, 40], [120, 770, 200], [230, 70, 80], [980, 860, 10]];
  spots.forEach(([x, y, a], i) => {
    if (i % 3 === 2) {
      out += `<g transform="translate(${x} ${y})" opacity=".9"><circle r="22" fill="#c8102e"/><circle r="22" fill="url(#gloss)"/><path d="M-6 -20l6 6l6 -6" stroke="#2f7d4f" stroke-width="4" fill="none" stroke-linecap="round"/></g>`;
    } else {
      out += `<g transform="translate(${x} ${y}) rotate(${a})" opacity=".85"><path d="M0 -34c22 10 22 50 0 68c-22 -18 -22 -58 0 -68Z" fill="#2f7d4f"/><path d="M0 -30v60" stroke="#58a874" stroke-width="2.5"/></g>`;
    }
  });
  for (let i = 0; i < 70; i++) {
    const x = rng() * W, y = rng() * H;
    if ((x - CX) ** 2 + (y - CY) ** 2 < 430 ** 2) continue;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + rng() * 2.2)}" fill="#fff" opacity="${f(0.08 + rng() * 0.12)}"/>`;
  }
  return out;
}

const DEFS = `<defs>
  <radialGradient id="bg" cx="50%" cy="48%" r="70%"><stop offset="0" stop-color="#1e3a8a"/><stop offset=".55" stop-color="#132a63"/><stop offset="1" stop-color="#0b1d44"/></radialGradient>
  <radialGradient id="crust" cx="50%" cy="45%" r="50%"><stop offset=".8" stop-color="#e2a457"/><stop offset=".93" stop-color="#d48d3e"/><stop offset="1" stop-color="#b8722c"/></radialGradient>
  <radialGradient id="plate" cx="50%" cy="42%" r="55%"><stop offset=".8" stop-color="#ffffff"/><stop offset="1" stop-color="#e3e8f2"/></radialGradient>
  <radialGradient id="gloss" cx="35%" cy="30%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <radialGradient id="sheen" cx="40%" cy="35%" r="65%"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="#5a2a0a" flood-opacity=".35"/></filter>
  <filter id="plateShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000" flood-opacity=".45"/></filter>
  <clipPath id="halfL"><rect x="0" y="0" width="${CX - 3}" height="${H}"/></clipPath>
  <clipPath id="halfR"><rect x="${CX + 3}" y="0" width="${W - CX}" height="${H}"/></clipPath>
</defs>`;

function slices(n = 8) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2;
    out += `<path d="M${CX} ${CY}L${f(CX + (R_CRUST - 6) * Math.cos(a))} ${f(CY + (R_CRUST - 6) * Math.sin(a))}" stroke="#7a3a12" stroke-opacity=".28" stroke-width="3"/>`;
  }
  return out;
}

export function pizzaSvg(flavor, second = null) {
  const rng = rngFrom(flavor.name + (second?.name ?? ''));
  const rec = recipeFor(flavor);
  let body = '';
  if (second) {
    const rec2 = recipeFor(second);
    body += crustAndBase(rng, { sweet: false });
    body += `<g clip-path="url(#halfL)">${drawRecipe(rng, rec, 'L')}</g>`;
    body += `<g clip-path="url(#halfR)">${drawRecipe(rng, rec2, 'R')}</g>`;
    body += `<path d="M${CX} ${CY - R_CRUST + 30}V${CY + R_CRUST - 30}" stroke="#7a3a12" stroke-opacity=".35" stroke-width="4"/>`;
  } else {
    body += crustAndBase(rng, rec.base && rec.sweet ? { sweet: true, sauce: rec.base.sauce } : { sweet: false });
    body += drawRecipe(rng, rec);
    body += slices(8);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${DEFS}
${background(rng)}
<g filter="url(#plateShadow)"><circle cx="${CX}" cy="${CY}" r="408" fill="url(#plate)"/></g>
<circle cx="${CX}" cy="${CY}" r="398" fill="none" stroke="#c8102e" stroke-width="7"/>
<circle cx="${CX}" cy="${CY}" r="386" fill="none" stroke="#c8102e" stroke-width="2" stroke-opacity=".5"/>
<g filter="url(#plateShadow)" opacity=".55"><circle cx="${CX}" cy="${CY + 4}" r="${R_CRUST}" fill="#000" fill-opacity=".01"/></g>
${body}
<circle cx="${CX}" cy="${CY}" r="${R_CRUST}" fill="url(#sheen)"/>
</svg>`;
}
