import { h, clear, add } from '../lib/dom.js';
import { icon, illustration } from '../lib/icons.js';
import { formatCents, toCents } from '../lib/money.js';
import { describeSelection, toOrderItems } from '../lib/catalog.js';
import { priceItem } from '../lib/pricing.js';
import { calculateOrder } from '../lib/api.js';
import { openStatus } from '../lib/hours.js';
import { MAX_QTY } from '../lib/cart.js';
import {
  buildOrderMessage, whatsappLink, normalizeBrPhone, formatBrPhone, cleanText, isValidWhatsappNumber,
} from '../lib/whatsapp.js';
import { openProductModal } from './productModal.js';
import { track, gaItem, centsToReais } from '../lib/analytics.js';
import { animateOut, bump, burst, softClose } from '../lib/motion.js';

const CUSTOMER_KEY = 'cardapio-cliente-v1';
const PAUSED_TEXT = 'A pizzaria não está recebendo pedidos agora. Sua sacola fica guardada: volte mais tarde para enviar.';

// Erros técnicos (rede, formato) não devem aparecer crus para o cliente.
// As mensagens do cálculo do pedido no banco já são em português e seguem como estão.
function friendlyOrderError(err) {
  const msg = String(err?.message || '');
  if (!msg || /fetch|network|invalid input|syntax|uuid|json|schema|function/i.test(msg)) {
    return 'Não foi possível calcular o pedido. Verifique a internet, atualize a página e tente novamente.';
  }
  return msg;
}

// Dados do cliente ficam só neste aparelho, para não precisar digitar de novo.
function loadCustomer() {
  try { return JSON.parse(localStorage.getItem(CUSTOMER_KEY) || '{}') || {}; } catch { return {}; }
}
function saveCustomer(c) {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify({
      name: c.name, phone: c.phone, mode: c.mode, zoneId: c.zoneId,
      street: c.street, number: c.number, complement: c.complement, reference: c.reference, district: c.district,
    }));
  } catch { /* sem armazenamento: segue normalmente */ }
}

export function openCartDrawer({ catalog, cart }) {
  const s = catalog.settings;
  const form = {
    mode: s.delivery_enabled ? 'delivery' : 'pickup',
    paymentId: null, needsChange: false, changeFor: '', notes: '',
    name: '', phone: '', zoneId: '', street: '', number: '', complement: '', reference: '', district: '',
    ...loadCustomer(),
  };
  if (catalog.zones.length === 1) form.zoneId = catalog.zones[0].id;
  // Região com "taxa a combinar": o cliente digita o próprio bairro
  const feePending = (zoneId) => {
    const z = catalog.zones.find((x) => x.id === zoneId);
    return !!z && (z.fee === null || z.fee === undefined);
  };
  if (form.mode === 'delivery' && !s.delivery_enabled) form.mode = 'pickup';
  if (form.mode === 'pickup' && !s.pickup_enabled) form.mode = 'delivery';

  // Pedidos pausados no painel: o banco recusaria o cálculo, então avisamos antes do formulário
  const paused = !s.accepting_orders;
  let step = 'cart'; // cart -> details -> review -> sent
  let quote = null;  // resposta de calculate_order
  let busy = false;
  let formErrors = {};
  let serverError = '';
  let shakeSubmit = false;  // erro ao revisar: o botão balança uma vez
  let celebrate = false;    // acabou de calcular o pedido: check e partículas na revisão
  let locked = false;       // animação de remoção em andamento (evita remover o item errado)
  let sending = false;      // evita abrir o WhatsApp duas vezes com toques repetidos
  let lastStep = null;
  // valores mostrados na última vez, para animar só o que mudou
  let prevQty = new Map();
  let prevEstimate = null;

  const title = h('h2', { class: 'sheet-title', id: 'cart-title' });
  const body = h('div', { class: 'sheet-body' });
  const foot = h('div', { class: 'sheet-foot' });
  const dialog = h('dialog', { class: 'sheet cart-sheet', 'aria-labelledby': 'cart-title' },
    h('div', { class: 'cart-head' },
      h('button', { type: 'button', class: 'icon-btn back-btn', 'aria-label': 'Voltar', onclick: back }, '‹'),
      title,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fechar', onclick: () => dialog.close() }, icon('close'))),
    body, foot);

  const unsubscribe = cart.subscribe(() => { if (step === 'cart') render(); });
  softClose(dialog);
  dialog.addEventListener('close', () => { unsubscribe(); dialog.remove(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
  render();
  dialog.showModal();

  function back() {
    if (step === 'details') step = 'cart';
    else if (step === 'review') step = 'details';
    else if (step === 'sent') step = 'review';
    else return dialog.close();
    render();
  }

  function render() {
    clear(body); clear(foot);
    dialog.querySelector('.back-btn').hidden = step === 'cart';
    if (step === 'cart') renderCart();
    else if (step === 'details') renderDetails();
    else if (step === 'review') renderReview();
    else renderSent();
    // troca de etapa com transição suave; atualizar a mesma etapa não move nada
    if (step !== lastStep) {
      body.scrollTop = 0;
      if (lastStep !== null) bump(body, 'step-in');
      lastStep = step;
    }
  }

  // ------------------------------------------------------------ 1. carrinho
  function renderCart() {
    title.textContent = 'Sua sacola';
    if (!cart.items.length) {
      prevQty = new Map(); prevEstimate = null;
      body.append(h('div', { class: 'state' }, icon('bag'), h('h2', {}, 'Sua sacola está vazia'), h('p', {}, 'Adicione itens do cardápio para continuar.')));
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Ver cardápio'));
      return;
    }
    let estimate = 0;
    const seenQty = new Map();
    const list = h('ul', { class: 'cart-list' });
    cart.items.forEach((item, index) => {
      const d = describeSelection(catalog, item);
      const price = priceItem(catalog, item);
      if (price.ok) estimate += price.lineCents;
      const changed = prevQty.has(item.key) && prevQty.get(item.key) !== item.quantity;
      seenQty.set(item.key, item.quantity);
      const li = h('li', { class: `cart-item${prevQty.size && !prevQty.has(item.key) ? ' is-new' : ''}` },
        itemThumb(item),
        h('div', { class: 'cart-item-main' },
          h('p', { class: 'cart-item-name' }, d.name),
          itemDetails(d),
          !price.ok ? h('p', { class: 'errors' }, price.errors.join(' ')) : null,
          h('div', { class: 'cart-item-actions' },
            h('button', { type: 'button', class: 'link-btn', onclick: () => editItem(index) }, 'Editar'),
            h('button', { type: 'button', class: 'link-btn danger', onclick: () => removeItem(li, index), 'aria-label': `Remover ${d.name}` }, 'Remover'))),
        h('div', { class: 'cart-item-side' },
          h('span', { class: `price${changed ? ' is-bump' : ''}` }, price.ok ? formatCents(price.lineCents) : '—'),
          qtyControl(item.quantity, (q) => (q < 1 ? removeItem(li, index) : cart.setQuantity(index, q)), d.name, changed)));
      list.append(li);
    });
    const count = cart.count;
    const estimateChanged = prevEstimate !== null && prevEstimate !== estimate;
    prevQty = seenQty; prevEstimate = estimate;
    // add() em vez de append(): o append nativo escrevia "null" na tela quando não há aviso de pausa
    add(body, list,
      h('div', { class: 'totals' },
        row(`Subtotal estimado (${count} ${count === 1 ? 'item' : 'itens'})`, formatCents(estimate), estimateChanged ? 'is-updated' : '')),
      h('p', { class: 'hint' }, 'Descontos, taxa de entrega e total são confirmados na revisão do pedido.'),
      paused ? h('p', { class: 'notice warn', role: 'alert' }, PAUSED_TEXT) : null);
    foot.append(
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => dialog.close() }, 'Continuar comprando'),
      h('button', { class: 'btn btn-checkout', type: 'button', id: 'go-details', disabled: paused, onclick: () => {
        track('begin_checkout', { value: centsToReais(estimate), items: cart.items.map((it) => gaItem(catalog, it, priceItem(catalog, it).lineCents)).filter(Boolean) });
        step = 'details'; render();
      } }, 'Finalizar pedido', icon('arrow')));
  }

  // Item sai deslizando antes de ser removido; trava novos toques até terminar
  async function removeItem(li, index) {
    if (locked) return;
    locked = true;
    await animateOut(li, 'is-removing', 300);
    locked = false;
    cart.remove(index);
  }

  function itemThumb(item) {
    const product = catalog.products.get(item.productId);
    const category = catalog.categories.find((c) => c.id === product?.category_id);
    const src = product?.image_thumb_url || product?.image_url;
    return src
      ? h('img', { class: 'cart-thumb', src, alt: '', loading: 'lazy', decoding: 'async', width: 56, height: 56 })
      : h('span', { class: 'cart-thumb placeholder', 'aria-hidden': 'true' }, illustration(product, category?.name ?? ''));
  }

  function editItem(index) {
    const item = cart.items[index];
    openProductModal({
      catalog, productId: item.productId, initial: item, confirmLabel: 'Salvar',
      onConfirm: (sel) => cart.replace(index, sel),
    });
  }

  // ------------------------------------------------------------ 2. dados
  function renderDetails() {
    title.textContent = 'Dados do pedido';
    const f = h('form', { class: 'checkout', novalidate: true, onsubmit: (e) => { e.preventDefault(); goReview(); } });

    f.append(field('Nome', input('name', { autocomplete: 'name', maxlength: 80 })),
      field('Telefone (WhatsApp)', input('phone', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: 20, placeholder: '(00) 00000-0000' })));

    const modes = [];
    if (s.delivery_enabled) modes.push(['delivery', 'Entrega']);
    if (s.pickup_enabled) modes.push(['pickup', 'Retirada no local']);
    f.append(h('fieldset', { class: 'opt-group' }, h('legend', {}, h('span', {}, 'Como você quer receber?')),
      h('div', { class: 'segmented' }, modes.map(([value, label]) => {
        const r = h('input', { type: 'radio', name: 'mode', value, checked: form.mode === value });
        r.addEventListener('change', () => { form.mode = value; render(); });
        return h('label', {}, r, h('span', {}, label));
      }))));

    if (form.mode === 'delivery') {
      if (!catalog.zones.length) {
        f.append(h('p', { class: 'errors' }, 'Nenhum bairro de entrega cadastrado. Escolha retirada ou fale com a pizzaria.'));
      } else {
        const sel = h('select', { class: 'input', id: 'f-zoneId', name: 'zoneId', 'aria-invalid': formErrors.zoneId ? 'true' : null },
          h('option', { value: '' }, 'Selecione o bairro'),
          catalog.zones.map((z) => h('option', { value: z.id, selected: form.zoneId === z.id },
            `${z.name} — ${z.fee === null || z.fee === undefined ? 'taxa a combinar' : Number(z.fee) > 0 ? formatCents(toCents(z.fee)) : 'grátis'}`)));
        sel.addEventListener('change', () => { form.zoneId = sel.value; render(); });
        add(f, field('Bairro / região', sel, 'zoneId'),
          feePending(form.zoneId) ? field('Seu bairro', input('district', { autocomplete: 'address-level3', maxlength: 100 })) : null,
          h('div', { class: 'row-2' },
            field('Rua / avenida', input('street', { autocomplete: 'address-line1', maxlength: 120 })),
            field('Número', input('number', { inputmode: 'numeric', maxlength: 20 }))),
          field('Complemento (opcional)', input('complement', { maxlength: 80, placeholder: 'Apto, bloco, casa…' })),
          field('Ponto de referência (opcional)', input('reference', { maxlength: 120 })));
      }
    }

    f.append(h('fieldset', { class: 'opt-group' }, h('legend', {}, h('span', {}, 'Forma de pagamento')),
      catalog.payments.length ? catalog.payments.map((p) => {
        const r = h('input', { type: 'radio', name: 'payment', value: p.id, checked: form.paymentId === p.id });
        r.addEventListener('change', () => { form.paymentId = p.id; if (!p.asks_change) form.needsChange = false; render(); });
        return h('label', { class: 'opt' }, r, h('span', { class: 'opt-text' }, h('span', { class: 'opt-name' }, p.name)));
      }) : h('p', { class: 'errors' }, 'Formas de pagamento ainda não cadastradas.'),
      formErrors.paymentId ? h('p', { class: 'field-error' }, formErrors.paymentId) : null));

    const payment = catalog.payments.find((p) => p.id === form.paymentId);
    if (payment?.asks_change) {
      const chk = h('input', { type: 'checkbox', checked: form.needsChange });
      chk.addEventListener('change', () => { form.needsChange = chk.checked; render(); });
      f.append(h('label', { class: 'opt' }, chk, h('span', { class: 'opt-text' }, h('span', { class: 'opt-name' }, 'Preciso de troco'))));
      if (form.needsChange) f.append(field('Troco para quanto? (R$)', input('changeFor', { inputmode: 'decimal', placeholder: 'Ex.: 100' })));
    }

    const notes = h('textarea', { id: 'f-notes', rows: 2, maxlength: 300, placeholder: 'Algo mais que a pizzaria precisa saber?' });
    notes.value = form.notes;
    notes.addEventListener('input', () => { form.notes = notes.value; });
    f.append(field('Observações do pedido (opcional)', notes));

    if (serverError) f.append(h('p', { class: 'errors', role: 'alert' }, serverError));
    body.append(f);
    foot.append(h('button', {
      class: `btn btn-checkout${busy ? ' is-loading' : ''}${shakeSubmit ? ' is-shake' : ''}`, type: 'button', id: 'go-review',
      disabled: busy, 'aria-busy': busy ? 'true' : null, onclick: goReview,
    }, busy ? [h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Calculando…'] : ['Revisar pedido', icon('arrow')]));
    shakeSubmit = false;
  }

  function input(name, attrs = {}) {
    const el = h('input', { class: 'input', id: `f-${name}`, name, type: 'text', ...attrs, 'aria-invalid': formErrors[name] ? 'true' : null });
    el.value = form[name] ?? '';
    el.addEventListener('input', () => { form[name] = el.value; });
    return el;
  }

  function field(label, control, name = control.name) {
    return h('div', { class: 'field' },
      h('label', { class: 'field-label', for: control.id }, label),
      control,
      formErrors[name] ? h('p', { class: 'field-error', id: `${control.id}-err` }, formErrors[name]) : null);
  }

  function validate() {
    const e = {};
    if (cleanText(form.name, 80).length < 2) e.name = 'Informe seu nome.';
    if (!normalizeBrPhone(form.phone)) e.phone = 'Informe um telefone válido com DDD.';
    if (form.mode === 'delivery') {
      if (!s.delivery_enabled) e.mode = 'Entrega indisponível.';
      if (!catalog.zones.some((z) => z.id === form.zoneId)) e.zoneId = 'Selecione o bairro.';
      else if (feePending(form.zoneId) && cleanText(form.district, 100).length < 2) e.district = 'Informe o bairro.';
      if (cleanText(form.street).length < 3) e.street = 'Informe a rua.';
      if (!cleanText(form.number, 20)) e.number = 'Informe o número (ou "s/n").';
    } else if (!s.pickup_enabled) e.mode = 'Retirada indisponível.';
    const payment = catalog.payments.find((p) => p.id === form.paymentId);
    if (!payment) e.paymentId = 'Escolha a forma de pagamento.';
    if (payment?.asks_change && form.needsChange) {
      const c = toCents(form.changeFor);
      if (c === null || c <= 0) e.changeFor = 'Informe um valor válido para o troco.';
    }
    return e;
  }

  async function goReview() {
    if (busy) return; // Enter repetido no formulário não calcula duas vezes
    formErrors = validate();
    serverError = '';
    if (Object.keys(formErrors).length) {
      shakeSubmit = true;
      render();
      dialog.querySelector('[aria-invalid="true"], .field-error')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      dialog.querySelector('[aria-invalid="true"]')?.focus({ preventScroll: true });
      return;
    }
    saveCustomer(form);
    busy = true; render();
    try {
      // Preço oficial: recalculado no banco a partir dos IDs
      quote = await calculateOrder(toOrderItems(cart.items), form.mode, form.mode === 'delivery' ? form.zoneId : null);
      const totalCents = toCents(quote.total);
      const changeCents = form.needsChange ? toCents(form.changeFor) : null;
      if (changeCents !== null && changeCents < totalCents) {
        formErrors.changeFor = `O troco precisa ser para um valor maior ou igual ao total (${formatCents(totalCents)}).`;
        shakeSubmit = true;
        step = 'details';
      } else { step = 'review'; celebrate = true; }
    } catch (err) {
      serverError = friendlyOrderError(err);
      shakeSubmit = true;
      step = 'details';
    } finally {
      busy = false;
      render();
    }
  }

  // ------------------------------------------------------------ 3. revisão
  function buildOrder() {
    const payment = catalog.payments.find((p) => p.id === form.paymentId);
    const zone = catalog.zones.find((z) => z.id === form.zoneId);
    return {
      customer: { name: form.name, phone: normalizeBrPhone(form.phone) },
      mode: form.mode,
      address: form.mode === 'delivery' ? {
        street: form.street, number: form.number, complement: form.complement, district: feePending(form.zoneId) ? form.district : zone?.name ?? '', reference: form.reference,
      } : null,
      payment: { name: payment.name, changeFor: payment.asks_change && form.needsChange ? toCents(form.changeFor) : null },
      notes: form.notes,
      items: cart.items.map((it, i) => {
        const line = quote.items[i];
        return {
          ...describeSelection(catalog, it), quantity: it.quantity, unitCents: toCents(line.unit_price), lineCents: toCents(line.line_total),
          weeklyPromo: line.weekly_promo === true,
        };
      }),
      subtotalCents: toCents(quote.subtotal),
      discountCents: toCents(quote.discount),
      deliveryFeeCents: toCents(quote.delivery_fee),
      deliveryFeePending: quote.delivery_fee_pending === true,
      totalCents: toCents(quote.total),
      storeName: s.name,
    };
  }

  function renderReview() {
    title.textContent = 'Revise seu pedido';
    const order = buildOrder();
    const status = openStatus(catalog.hours, s.timezone);
    const canSend = isValidWhatsappNumber(s.whatsapp_number);
    // O pedido foi só PREPARADO (calculado): quem confirma é a pizzaria, pelo WhatsApp
    const mark = h('div', { class: 'prepared-mark', 'aria-hidden': 'true' }, icon('check'));
    const prepared = h('div', { class: `prepared${celebrate ? ' is-celebrating' : ''}`, role: 'status' },
      mark,
      h('p', { class: 'prepared-kicker' }, 'Pedido preparado com sucesso!'),
      h('h3', { class: 'prepared-title' }, 'Seu pedido está quase pronto!'),
      h('p', { class: 'prepared-sub' }, 'Confira os detalhes e continue pelo WhatsApp para concluir seu pedido.'));
    if (celebrate) requestAnimationFrame(() => burst(mark));
    celebrate = false;

    add(body,
      prepared,
      !status.open && status.known ? h('p', { class: 'notice warn' }, 'A pizzaria está fechada agora. Você pode enviar a mensagem, mas ela só será vista quando abrirmos.') : null,
      h('ul', { class: 'cart-list' }, order.items.map((it, i) => h('li', { class: 'cart-item' },
        itemThumb(cart.items[i]),
        h('div', { class: 'cart-item-main' }, h('p', { class: 'cart-item-name' }, `${it.quantity} × ${it.name}`), itemDetails(it),
          it.quantity > 1 ? h('p', { class: 'cart-item-unit' }, `${formatCents(it.unitCents)} cada`) : null),
        h('div', { class: 'cart-item-side' }, h('span', { class: 'price' }, formatCents(it.lineCents)),
          it.weeklyPromo ? h('span', { class: 'badge promo' }, 'Promoção do dia') : null)))),
      h('div', { class: 'totals' },
        row('Subtotal', formatCents(order.subtotalCents)),
        order.discountCents > 0 ? row('Desconto', `- ${formatCents(order.discountCents)}`, 'discount') : null,
        row('Taxa de entrega', order.mode !== 'delivery' ? 'Retirada' : order.deliveryFeePending ? 'a combinar' : formatCents(order.deliveryFeeCents)),
        row(order.deliveryFeePending ? 'Total sem a taxa de entrega' : 'Total', formatCents(order.totalCents), 'grand')),
      order.deliveryFeePending ? h('p', { class: 'hint' }, 'A pizzaria informa a taxa de entrega pelo WhatsApp.') : null,
      h('div', { class: 'review-block' },
        h('p', {}, h('strong', {}, order.customer.name), ` · ${formatBrPhone(order.customer.phone)}`),
        h('p', {}, order.mode === 'delivery'
          ? `Entrega: ${[`${order.address.street}, ${order.address.number}`, order.address.complement, order.address.district].filter(Boolean).join(' - ')}`
          : 'Retirada no local'),
        h('p', {}, `Pagamento: ${order.payment.name}${order.payment.changeFor ? ` · troco para ${formatCents(order.payment.changeFor)}` : ''}`),
        order.notes ? h('p', {}, `Obs.: ${cleanText(order.notes, 300)}`) : null),
      h('p', { class: 'notice' }, 'Ao continuar, o WhatsApp abre com a mensagem pronta. Você precisa tocar em enviar por lá. O pedido só está confirmado quando a pizzaria responder.'),
      !canSend ? h('p', { class: 'errors', role: 'alert' }, s.is_demo
        ? 'Modo demonstração: o WhatsApp da pizzaria ainda não foi cadastrado, então o envio está desativado.'
        : 'O WhatsApp da pizzaria ainda não foi configurado. Tente mais tarde.') : null);

    // Link <a> de verdade em vez de window.open: bloqueadores de pop-up e os navegadores
    // internos do Instagram/Facebook costumam aceitar melhor um toque num link.
    foot.append(canSend
      ? whatsappAnchor(whatsappLink(s.whatsapp_number, buildOrderMessage(order)), 'send-whatsapp', 'Enviar pedido pelo WhatsApp',
        (e) => {
          if (sending) { e.preventDefault(); return; }
          sending = true;
          setTimeout(() => { sending = false; }, 1500);
          // Abriu o WhatsApp com o pedido: é um contato (lead), não uma venda. A venda só
          // existe quando a pizzaria confirma por lá, e isso o site não fica sabendo.
          track('generate_lead', { lead_source: 'pedido', value: centsToReais(order.totalCents) });
          setTimeout(() => { step = 'sent'; render(); }, 0);
        })
      : h('button', { class: 'btn btn-whatsapp', type: 'button', id: 'send-whatsapp', disabled: true }, icon('chat'), 'Enviar pedido pelo WhatsApp'));
  }

  function whatsappAnchor(url, id, label, onclick) {
    return h('a', { class: 'btn btn-whatsapp is-highlight', id, href: url, target: '_blank', rel: 'noopener noreferrer', onclick }, icon('chat'), label);
  }

  // ------------------------------------------------------------ 4. depois de abrir o WhatsApp
  function renderSent() {
    title.textContent = 'Quase lá';
    body.append(h('div', { class: 'state state-sent' }, icon('phone'),
      h('h2', {}, 'Confira o WhatsApp'),
      h('p', {}, 'Abrimos o WhatsApp com a mensagem do seu pedido. Toque em enviar por lá e aguarde a confirmação da pizzaria.'),
      h('p', { class: 'hint' }, 'Se o WhatsApp não abriu, toque no link abaixo.'),
      whatsappAnchor(whatsappLink(s.whatsapp_number, buildOrderMessage(buildOrder())), 'resend-whatsapp', 'Abrir o WhatsApp de novo')));
    foot.append(
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: back }, 'Voltar'),
      h('button', { class: 'btn', type: 'button', onclick: () => { cart.clear(); dialog.close(); } }, 'Já enviei, limpar sacola'));
  }
}

// ------------------------------------------------------------ auxiliares
function itemDetails(d) {
  const lines = [];
  if (d.size) lines.push(`Tamanho: ${d.size}`);
  if (d.flavors?.length) lines.push(`Sabores: ${d.flavors.join(' / ')}`);
  if (d.size) lines.push(`Borda: ${d.crust || 'sem borda'}`);
  if (d.extras?.length) lines.push(`Adicionais: ${d.extras.join(', ')}`);
  if (d.notes) lines.push(`Obs.: ${d.notes}`);
  return lines.length ? h('p', { class: 'cart-item-desc' }, lines.map((l, i) => [i ? h('br') : null, l])) : null;
}

function row(label, value, cls = '') {
  return h('div', { class: `total-row ${cls}` }, h('span', {}, label), h('span', {}, value));
}

function qtyControl(qty, onChange, name, changed = false) {
  return h('div', { class: 'qty qty-sm' },
    h('button', { type: 'button', 'aria-label': qty === 1 ? `Remover ${name}` : `Diminuir ${name}`, onclick: () => onChange(qty - 1) }, icon('minus')),
    h('output', { class: changed ? 'is-bump' : null }, String(qty)),
    h('button', { type: 'button', 'aria-label': `Aumentar ${name}`, disabled: qty >= MAX_QTY, onclick: () => onChange(qty + 1) }, icon('plus')));
}
