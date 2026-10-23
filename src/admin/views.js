import { h, clear, add } from '../lib/dom.js';
import { supabase } from '../lib/supabase.js';
import { formatPrice, toCents } from '../lib/money.js';
import { WEEKDAYS, hhmm } from '../lib/hours.js';
import { crudView } from './crud.js';
import { parseField, displayValue, renderField, friendlyDbError } from './fields.js';
import { notify } from './ui.js';

const options = async (table, filter) => {
  const { data, error } = await supabase.from(table).select('id, name').order('sort_order').order('name');
  if (error) throw error;
  return (filter ? data.filter(filter) : data).map((r) => ({ value: r.id, label: r.name }));
};
const yes = (v) => (v ? 'Sim' : 'Não');
const sortField = { key: 'sort_order', label: 'Ordem de exibição', type: 'int', min: 0, max: 100000, help: 'Menor aparece primeiro. Também dá para usar as setas da lista.' };

// ---------------------------------------------------------------- Produtos
export async function productsView() {
  const cats = await options('categories');
  const catName = new Map(cats.map((c) => [c.value, c.label]));
  const isSimple = (v) => v.kind === 'simple';
  const isPizza = (v) => v.kind === 'pizza';
  return crudView({
    table: 'products', title: 'Produtos', singular: 'produto',
    intro: 'Produtos "simples" têm preço próprio. Produtos "pizza" usam os preços dos sabores em cada tamanho (aba Pizzas).',
    orderKey: 'sort_order', activeKey: 'available',
    defaults: () => ({ kind: 'simple', available: true, sort_order: 0, category_id: cats[0]?.value }),
    links: [
      { key: 'extra_ids', table: 'product_extras', fk: 'product_id', other: 'extra_id' },
      { key: 'size_ids', table: 'product_sizes', fk: 'product_id', other: 'size_id' },
      { key: 'flavor_ids', table: 'product_flavors', fk: 'product_id', other: 'flavor_id' },
    ],
    columns: [
      { label: 'Nome', render: (r) => h('strong', {}, r.name) },
      { label: 'Categoria', render: (r) => catName.get(r.category_id) ?? '—' },
      { label: 'Preço', render: (r) => (r.kind === 'pizza' ? 'pelos sabores' : r.promo_price ? h('span', {}, h('s', {}, formatPrice(r.price)), ' ', formatPrice(r.promo_price)) : formatPrice(r.price)) },
    ],
    fields: async () => [
      { key: 'name', label: 'Nome', required: true, maxlength: 120 },
      { key: 'category_id', label: 'Categoria', type: 'select', required: true, options: cats },
      { key: 'kind', label: 'Tipo', type: 'select', required: true, options: [{ value: 'simple', label: 'Simples (preço fixo)' }, { value: 'pizza', label: 'Pizza (tamanho + sabores)' }] },
      { key: 'description', label: 'Descrição', type: 'textarea', maxlength: 1000 },
      { key: 'image_url', label: 'Imagem (URL https)', type: 'image', help: 'Envie uma foto própria ou cole o endereço https de uma imagem que você tem direito de usar.' },
      { key: 'price', label: 'Preço (R$)', type: 'money', show: isSimple, placeholder: '0,00' },
      { key: 'promo_price', label: 'Preço promocional (R$)', type: 'money', show: isSimple, help: 'Deixe vazio se não houver promoção. Precisa ser menor que o preço.' },
      { key: 'qty_promo_min', label: 'Promoção por quantidade: a partir de quantas unidades', type: 'int', min: 2, max: 99, show: isSimple },
      { key: 'qty_promo_price', label: 'Promoção por quantidade: preço de cada unidade (R$)', type: 'money', show: isSimple },
      { key: 'size_ids', label: 'Tamanhos oferecidos', type: 'multi', options: await options('pizza_sizes'), show: isPizza },
      { key: 'flavor_ids', label: 'Sabores permitidos', type: 'multi', options: await options('pizza_flavors'), show: isPizza },
      { key: 'extra_ids', label: 'Adicionais permitidos', type: 'multi', options: await options('extras') },
      { key: 'badge', label: 'Selo (opcional)', maxlength: 30, placeholder: 'Promoção, Novo, Mais pedido…' },
      { key: 'available', label: 'Disponível no cardápio', type: 'bool' },
      sortField,
    ],
    validate: (v) => {
      if (v.kind === 'simple' && v.price === null) return 'Informe o preço do produto.';
      if (v.kind === 'simple' && v.promo_price !== null && toCents(v.promo_price) >= toCents(v.price)) return 'O preço promocional precisa ser menor que o preço normal.';
      if ((v.qty_promo_min === null) !== (v.qty_promo_price === null)) return 'Preencha juntos a quantidade mínima e o preço da promoção por quantidade.';
      if (v.kind === 'pizza' && (!v.size_ids.length || !v.flavor_ids.length)) return 'Escolha ao menos um tamanho e um sabor para a pizza.';
      return null;
    },
  });
}

// ---------------------------------------------------------------- Categorias
export function categoriesView() {
  return crudView({
    table: 'categories', title: 'Categorias', singular: 'categoria',
    intro: 'Categorias desativadas (ou sem produtos disponíveis) somem do cardápio.',
    orderKey: 'sort_order', activeKey: 'active',
    deleteWarning: 'Só é possível excluir categorias sem produtos. Prefira desativar.',
    defaults: () => ({ active: true, sort_order: 0 }),
    columns: [{ label: 'Nome', render: (r) => h('strong', {}, r.name) }],
    fields: [
      { key: 'name', label: 'Nome', required: true, maxlength: 80 },
      { key: 'description', label: 'Descrição (opcional)', type: 'textarea', maxlength: 500 },
      { key: 'active', label: 'Ativa', type: 'bool' },
      sortField,
    ],
  });
}

// ---------------------------------------------------------------- Pizzas
export async function pizzaView() {
  const wrap = h('div', { class: 'adm-stack' });
  const matrices = h('div', { class: 'adm-stack' });
  const refresh = () => renderMatrices(matrices);
  const sizes = crudView({
    table: 'pizza_sizes', title: 'Tamanhos', singular: 'tamanho', orderKey: 'sort_order', activeKey: 'active',
    intro: 'O limite de sabores vale para cada tamanho.',
    defaults: () => ({ active: true, max_flavors: 1, sort_order: 0 }),
    columns: [{ label: 'Nome', render: (r) => h('strong', {}, r.name) }, { label: 'Fatias', key: 'slices' }, { label: 'Máx. sabores', key: 'max_flavors' }],
    fields: [
      { key: 'name', label: 'Nome', required: true, maxlength: 40, placeholder: 'Broto, Média, Grande…' },
      { key: 'slices', label: 'Fatias', type: 'int', min: 1, max: 64 },
      { key: 'max_flavors', label: 'Máximo de sabores', type: 'int', required: true, min: 1, max: 4 },
      { key: 'active', label: 'Ativo', type: 'bool' },
      sortField,
    ],
    onChange: refresh,
  });
  const flavors = crudView({
    table: 'pizza_flavors', title: 'Sabores', singular: 'sabor', orderKey: 'sort_order', activeKey: 'active',
    intro: 'Depois de criar o sabor, preencha o preço dele em cada tamanho na tabela abaixo.',
    defaults: () => ({ active: true, sort_order: 0 }),
    columns: [{ label: 'Nome', render: (r) => h('strong', {}, r.name) }],
    fields: [
      { key: 'name', label: 'Nome', required: true, maxlength: 80 },
      { key: 'description', label: 'Ingredientes / descrição', type: 'textarea', maxlength: 500 },
      { key: 'image_url', label: 'Imagem (URL https)', type: 'image' },
      { key: 'active', label: 'Ativo', type: 'bool' },
      sortField,
    ],
    onChange: refresh,
  });
  const crusts = crudView({
    table: 'crusts', title: 'Bordas', singular: 'borda', orderKey: 'sort_order', activeKey: 'active',
    intro: 'O preço de cada borda por tamanho fica na tabela abaixo. Sem preço no tamanho = borda indisponível nele.',
    defaults: () => ({ active: true, sort_order: 0 }),
    columns: [{ label: 'Nome', render: (r) => h('strong', {}, r.name) }],
    fields: [{ key: 'name', label: 'Nome', required: true, maxlength: 60 }, { key: 'active', label: 'Ativa', type: 'bool' }, sortField],
    onChange: refresh,
  });
  wrap.append(sizes.el, flavors.el, crusts.el, matrices);
  refresh();
  return { el: wrap };
}

async function renderMatrices(container) {
  const [sz, fl, cr, fp, cp] = await Promise.all([
    supabase.from('pizza_sizes').select('*').order('sort_order'),
    supabase.from('pizza_flavors').select('*').order('sort_order'),
    supabase.from('crusts').select('*').order('sort_order'),
    supabase.from('flavor_prices').select('*'),
    supabase.from('crust_prices').select('*'),
  ]);
  const err = [sz, fl, cr, fp, cp].find((r) => r.error);
  if (err) return notify(friendlyDbError(err.error), 'error');
  clear(container).append(
    priceMatrix({
      title: 'Preço dos sabores por tamanho',
      intro: 'Deixe vazio quando o sabor não existir naquele tamanho. A promoção é opcional e precisa ser menor que o preço.',
      rows: fl.data, sizes: sz.data, existing: fp.data, table: 'flavor_prices', rowKey: 'flavor_id', withPromo: true,
    }),
    priceMatrix({
      title: 'Preço das bordas por tamanho', intro: 'Use 0,00 para borda grátis. Vazio = indisponível no tamanho.',
      rows: cr.data, sizes: sz.data, existing: cp.data, table: 'crust_prices', rowKey: 'crust_id', withPromo: false,
    }));
}

function priceMatrix({ title, intro, rows, sizes, existing, table, rowKey, withPromo }) {
  const card = h('section', { class: 'adm-card' }, h('div', { class: 'adm-card-head' }, h('div', {}, h('h2', {}, title), h('p', { class: 'adm-help' }, intro))));
  if (!rows.length || !sizes.length) { card.append(h('p', { class: 'adm-empty' }, 'Cadastre tamanhos e itens primeiro.')); return card; }
  const map = new Map(existing.map((e) => [`${e[rowKey]}|${e.size_id}`, e]));
  const inputs = [];
  const money = { type: 'money' };
  const cell = (r, s) => {
    const cur = map.get(`${r.id}|${s.id}`);
    const price = h('input', { class: 'input sm', inputmode: 'decimal', placeholder: '—', 'aria-label': `${r.name} ${s.name} preço` });
    price.value = cur ? displayValue(money, cur.price) : '';
    const promo = withPromo ? h('input', { class: 'input sm promo', inputmode: 'decimal', placeholder: 'promo', 'aria-label': `${r.name} ${s.name} promoção` }) : null;
    if (promo) promo.value = cur?.promo_price != null ? displayValue(money, cur.promo_price) : '';
    inputs.push({ r, s, cur, price, promo });
    return h('td', {}, price, promo);
  };
  const status = h('p', { class: 'errors', hidden: true });
  card.append(
    h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-table matrix' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), sizes.map((s) => h('th', {}, s.name)))),
      h('tbody', {}, rows.map((r) => h('tr', { class: r.active ? '' : 'off' }, h('th', { scope: 'row' }, r.name), sizes.map((s) => cell(r, s))))))),
    status,
    h('button', { class: 'btn', type: 'button', onclick: save }, 'Salvar preços'));

  async function save() {
    const upserts = []; const deletes = []; const problems = [];
    for (const { r, s, cur, price, promo } of inputs) {
      const p = parseField({ type: 'money' }, price.value);
      const pr = promo ? parseField({ type: 'money' }, promo.value) : { value: null };
      price.removeAttribute('aria-invalid'); promo?.removeAttribute('aria-invalid');
      if (p.error) { problems.push(`${r.name} / ${s.name}: preço inválido`); price.setAttribute('aria-invalid', 'true'); continue; }
      if (pr.error) { problems.push(`${r.name} / ${s.name}: promoção inválida`); promo.setAttribute('aria-invalid', 'true'); continue; }
      if (p.value === null) {
        if (pr.value !== null) { problems.push(`${r.name} / ${s.name}: promoção sem preço`); continue; }
        if (cur) deletes.push(cur);
        continue;
      }
      if (pr.value !== null && toCents(pr.value) >= toCents(p.value)) { problems.push(`${r.name} / ${s.name}: promoção precisa ser menor que o preço`); promo.setAttribute('aria-invalid', 'true'); continue; }
      const changed = !cur || toCents(cur.price) !== toCents(p.value) || (withPromo && toCents(cur.promo_price) !== toCents(pr.value));
      if (changed) upserts.push({ [rowKey]: r.id, size_id: s.id, price: p.value, ...(withPromo ? { promo_price: pr.value } : {}) });
    }
    status.hidden = !problems.length;
    status.textContent = problems.join(' · ');
    if (problems.length) return;
    if (upserts.length) {
      const { error } = await supabase.from(table).upsert(upserts, { onConflict: `${rowKey},size_id` });
      if (error) return notify(friendlyDbError(error), 'error');
    }
    for (const d of deletes) {
      const { error } = await supabase.from(table).delete().eq(rowKey, d[rowKey]).eq('size_id', d.size_id);
      if (error) return notify(friendlyDbError(error), 'error');
    }
    notify(upserts.length || deletes.length ? 'Preços salvos.' : 'Nada mudou.');
    renderMatrices(card.parentElement);
  }
  return card;
}

// ---------------------------------------------------------------- Adicionais
export function extrasView() {
  return crudView({
    table: 'extras', title: 'Adicionais', singular: 'adicional', orderKey: 'sort_order', activeKey: 'active',
    intro: 'Depois de criar, marque em quais produtos o adicional pode ser escolhido (na edição do produto).',
    defaults: () => ({ active: true, sort_order: 0 }),
    columns: [{ label: 'Nome', render: (r) => h('strong', {}, r.name) }, { label: 'Preço', render: (r) => formatPrice(r.price) }],
    fields: [
      { key: 'name', label: 'Nome', required: true, maxlength: 60 },
      { key: 'price', label: 'Preço (R$)', type: 'money', required: true },
      { key: 'active', label: 'Ativo', type: 'bool' },
      sortField,
    ],
  });
}

// ---------------------------------------------------------------- Entrega, pagamento e horários
export function deliveryView() {
  const wrap = h('div', { class: 'adm-stack' });
  wrap.append(
    crudView({
      table: 'delivery_zones', title: 'Bairros e taxas de entrega', singular: 'bairro', orderKey: 'sort_order', activeKey: 'active',
      defaults: () => ({ active: true, sort_order: 0 }),
      columns: [{ label: 'Bairro / região', render: (r) => h('strong', {}, r.name) }, { label: 'Taxa', render: (r) => formatPrice(r.fee) }, { label: 'Pedido mínimo', render: (r) => (r.min_order_value != null ? formatPrice(r.min_order_value) : 'padrão da loja') }],
      fields: [
        { key: 'name', label: 'Bairro / região', required: true, maxlength: 100 },
        { key: 'fee', label: 'Taxa de entrega (R$)', type: 'money', required: true, help: 'Use 0,00 para entrega grátis.' },
        { key: 'min_order_value', label: 'Pedido mínimo deste bairro (R$, opcional)', type: 'money', help: 'Vazio = usa o pedido mínimo geral da loja.' },
        { key: 'active', label: 'Ativo', type: 'bool' },
        sortField,
      ],
    }).el,
    crudView({
      table: 'payment_methods', title: 'Formas de pagamento', singular: 'forma de pagamento', orderKey: 'sort_order', activeKey: 'active',
      defaults: () => ({ active: true, asks_change: false, sort_order: 0 }),
      columns: [{ label: 'Nome', render: (r) => h('strong', {}, r.name) }, { label: 'Pergunta troco', render: (r) => yes(r.asks_change) }],
      fields: [
        { key: 'name', label: 'Nome', required: true, maxlength: 60 },
        { key: 'asks_change', label: 'Perguntar se precisa de troco (dinheiro)', type: 'bool' },
        { key: 'active', label: 'Ativa', type: 'bool' },
        sortField,
      ],
    }).el,
    crudView({
      table: 'opening_hours', title: 'Horários de funcionamento', singular: 'horário',
      intro: 'Pode haver mais de um turno no mesmo dia. Se o fechamento for menor que a abertura (ex.: 18:00 às 01:00), o turno termina no dia seguinte.',
      order: [['weekday'], ['opens_at']],
      describe: (r) => `${WEEKDAYS[r.weekday]} ${hhmm(r.opens_at)}–${hhmm(r.closes_at)}`,
      defaults: () => ({ weekday: 0, opens_at: '18:00', closes_at: '23:00' }),
      columns: [{ label: 'Dia', render: (r) => WEEKDAYS[r.weekday] }, { label: 'Abre', render: (r) => hhmm(r.opens_at) }, { label: 'Fecha', render: (r) => hhmm(r.closes_at) }],
      fields: [
        { key: 'weekday', label: 'Dia da semana', type: 'weekday', required: true },
        { key: 'opens_at', label: 'Abre às', type: 'time', required: true },
        { key: 'closes_at', label: 'Fecha às', type: 'time', required: true },
      ],
      validate: (v) => (v.opens_at === v.closes_at ? 'Abertura e fechamento não podem ser iguais.' : null),
    }).el);
  return { el: wrap };
}

// ---------------------------------------------------------------- Loja
const SETTINGS_FIELDS = [
  { key: 'name', label: 'Nome da pizzaria', required: true, maxlength: 120 },
  { key: 'tagline', label: 'Frase de apresentação', maxlength: 200 },
  { key: 'about', label: 'Sobre a pizzaria', type: 'textarea', maxlength: 2000 },
  { key: 'logo_url', label: 'Logotipo (URL https)', type: 'image' },
  { key: 'cover_url', label: 'Imagem de capa (URL https)', type: 'image' },
  { key: 'whatsapp_number', label: 'WhatsApp que recebe os pedidos', type: 'whatsapp', help: 'Formato internacional, só números: 55 + DDD + número. Ex.: 5535999999999' },
  { key: 'phone_display', label: 'Telefone para exibir no site', maxlength: 40, placeholder: '(35) 3333-4444' },
  { key: 'instagram_url', label: 'Instagram (URL https)', type: 'url' },
  { key: 'address_line', label: 'Endereço', maxlength: 300 },
  { key: 'maps_url', label: 'Link do Google Maps (https)', type: 'url' },
  { key: 'accepting_orders', label: 'Aceitando pedidos agora', type: 'bool', help: 'Desmarque para pausar os pedidos (o banco recusa o cálculo do pedido).' },
  { key: 'delivery_enabled', label: 'Faz entrega', type: 'bool' },
  { key: 'pickup_enabled', label: 'Permite retirada no local', type: 'bool' },
  { key: 'delivery_time_min', label: 'Entrega: tempo mínimo (min)', type: 'int', min: 0, max: 600 },
  { key: 'delivery_time_max', label: 'Entrega: tempo máximo (min)', type: 'int', min: 0, max: 600 },
  { key: 'pickup_time_min', label: 'Retirada: tempo mínimo (min)', type: 'int', min: 0, max: 600 },
  { key: 'pickup_time_max', label: 'Retirada: tempo máximo (min)', type: 'int', min: 0, max: 600 },
  { key: 'min_order_value', label: 'Pedido mínimo (R$)', type: 'money', required: true, help: 'Use 0,00 para não ter mínimo.' },
  {
    key: 'multi_flavor_rule', label: 'Preço da pizza com mais de um sabor', type: 'select', emptyLabel: 'Não definida (só aceita 1 sabor)',
    options: [{ value: 'maior', label: 'Cobra o sabor mais caro' }, { value: 'media', label: 'Cobra a média dos sabores' }],
    help: 'Vale para todas as pizzas. Preço final = sabores (pela regra) + borda + adicionais.',
  },
  { key: 'is_demo', label: 'Modo demonstração (mostra aviso de dados fictícios)', type: 'bool' },
];

export async function settingsView() {
  const card = h('section', { class: 'adm-card' });
  const { data, error } = await supabase.from('store_settings').select('*').eq('id', 1).maybeSingle();
  if (error || !data) {
    card.append(h('p', { class: 'errors' }, error ? friendlyDbError(error) : 'Configuração da loja não encontrada. Rode o seed ou insira a linha id=1 pelo SQL Editor.'));
    return { el: card };
  }
  const controls = SETTINGS_FIELDS.map((f) => [f, renderField(f, displayValue(f, data[f.key]))]);
  const status = h('p', { class: 'errors', hidden: true });
  const testLink = h('a', { target: '_blank', rel: 'noopener noreferrer', class: 'link-btn' }, 'Testar este número no WhatsApp');
  const wa = controls.find(([f]) => f.key === 'whatsapp_number')[1];
  const updateLink = () => {
    const r = parseField({ type: 'whatsapp' }, wa.getValue());
    testLink.hidden = !r.value;
    if (r.value) testLink.href = `https://wa.me/${r.value}?text=${encodeURIComponent('Teste do cardápio digital')}`;
  };
  wa.control.addEventListener('input', updateLink);
  updateLink();

  add(card,
    h('div', { class: 'adm-card-head' }, h('div', {}, h('h2', {}, 'Dados da loja'), h('p', { class: 'adm-help' }, 'Estas informações aparecem no cardápio e na mensagem do pedido.'))),
    h('div', { class: 'adm-form grid-2' }, controls.map(([f, c]) => (f.key === 'whatsapp_number' ? h('div', {}, c.el, testLink) : c.el))),
    status,
    h('button', { class: 'btn', type: 'button', id: 'save-settings', onclick: save }, 'Salvar dados da loja'));

  async function save() {
    const payload = {}; let ok = true;
    for (const [f, c] of controls) {
      const r = parseField(f, c.getValue());
      if (r.error) { ok = false; c.setError?.(r.error); } else { c.setError?.(''); payload[f.key] = r.value ?? null; }
    }
    const pairs = [['delivery_time_min', 'delivery_time_max'], ['pickup_time_min', 'pickup_time_max']];
    for (const [a, b] of pairs) if (payload[a] != null && payload[b] != null && payload[b] < payload[a]) { ok = false; status.textContent = 'O tempo máximo precisa ser maior ou igual ao mínimo.'; }
    if (!payload.delivery_enabled && !payload.pickup_enabled && ok) { ok = false; status.textContent = 'Ative pelo menos entrega ou retirada.'; }
    status.hidden = ok;
    if (!ok) { if (!status.textContent) status.textContent = 'Corrija os campos destacados.'; return; }
    const { error: e } = await supabase.from('store_settings').update(payload).eq('id', 1);
    if (e) { status.hidden = false; status.textContent = friendlyDbError(e); return; }
    status.textContent = '';
    notify('Dados da loja salvos.');
  }
  return { el: card };
}
