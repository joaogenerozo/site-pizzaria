import { h, clear, add } from '../lib/dom.js';
import { icon, illustration } from '../lib/icons.js';
import { formatCents } from '../lib/money.js';
import { crustsForSize } from '../lib/catalog.js';
import { priceItem, MULTI_FLAVOR_RULES } from '../lib/pricing.js';
import { MAX_NOTES, MAX_QTY } from '../lib/cart.js';

// Abre a janela de personalização de um produto.
// initial: seleção existente (edição de item do carrinho). onConfirm(selection).
export function openProductModal({ catalog, productId, categoryName, initial, confirmLabel = 'Adicionar', onConfirm }) {
  const product = catalog.products.get(productId);
  if (!product) return;

  const sel = {
    productId,
    quantity: initial?.quantity ?? 1,
    sizeId: initial?.sizeId ?? (product.sizes.length === 1 ? product.sizes[0].id : null),
    // Produto de um sabor só (cada sabor do cardápio é um card): já vem escolhido
    flavorIds: [...(initial?.flavorIds ?? (product.flavors.length === 1 ? [product.flavors[0].id] : []))],
    crustId: initial?.crustId ?? null,
    extraIds: [...(initial?.extraIds ?? [])],
    notes: initial?.notes ?? '',
  };
  let showErrors = false;

  const dialog = h('dialog', { class: 'sheet', 'aria-labelledby': 'pm-title' });
  const body = h('div', { class: 'sheet-body' });
  const errorsBox = h('ul', { class: 'errors', role: 'alert' });
  const qtyOut = h('output', { 'aria-live': 'polite' });
  const minus = h('button', { type: 'button', 'aria-label': 'Diminuir quantidade', onclick: () => setQty(sel.quantity - 1) }, icon('minus'));
  const plus = h('button', { type: 'button', 'aria-label': 'Aumentar quantidade', onclick: () => setQty(sel.quantity + 1) }, icon('plus'));
  const totalOut = h('span');
  const confirmBtn = h('button', { type: 'button', class: 'btn', onclick: confirm }, h('span', {}, confirmLabel), totalOut);

  const image = product.image_url
    ? h('img', { class: 'sheet-hero', src: product.image_url, alt: '', loading: 'lazy' })
    : h('div', { class: 'sheet-hero placeholder' }, illustration(product, categoryName));

  dialog.append(
    // a imagem rola junto com as opções; só o botão de fechar fica fixo
    h('div', { class: 'sheet-head' },
      h('button', { type: 'button', class: 'sheet-close', 'aria-label': 'Fechar', onclick: () => dialog.close() }, icon('close'))),
    body,
    h('div', { class: 'sheet-foot' }, h('div', { class: 'qty' }, minus, qtyOut, plus), confirmBtn),
  );

  const groups = h('div');
  const notes = h('textarea', {
    id: 'pm-notes', rows: 2, maxlength: MAX_NOTES,
    placeholder: product.kind === 'pizza' ? 'Ex.: sem cebola, bem assada…' : 'Ex.: sem gelo…',
  });
  notes.value = sel.notes;
  const counter = h('div', { class: 'counter' });
  notes.addEventListener('input', () => { sel.notes = notes.value; counter.textContent = `${notes.value.length}/${MAX_NOTES}`; });
  counter.textContent = `${notes.value.length}/${MAX_NOTES}`;

  add(body,
    image,
    h('h2', { class: 'sheet-title', id: 'pm-title' }, product.name),
    product.description ? h('p', { class: 'sheet-desc' }, product.description) : null,
    (product.kind === 'simple' && product.price_review) || (product.kind === 'pizza' && product.flavors.length === 1 && product.flavors[0].price_review)
      ? h('p', { class: 'notice warn' }, 'O preço deste item ainda está em confirmação pela pizzaria. Ele poderá ser pedido assim que o valor for confirmado.')
      : null,
    groups,
    h('label', { class: 'field-label', for: 'pm-notes' }, 'Observações'),
    notes, counter,
    errorsBox,
  );

  function setQty(q) {
    sel.quantity = Math.max(1, Math.min(MAX_QTY, q));
    update();
  }

  function renderGroups() {
    clear(groups);
    if (product.kind === 'pizza') {
      groups.append(sizeGroup());
      if (!singleFlavor) groups.append(flavorGroup());
      const size = currentSize();
      if (size) {
        const crusts = crustsForSize(catalog, size.id);
        if (crusts.length) groups.append(crustGroup(crusts));
      }
    }
    if (product.extras.length) groups.append(extrasGroup());
  }

  const singleFlavor = product.kind === 'pizza' && product.flavors.length === 1;
  const singleReview = singleFlavor && product.flavors[0].price_review;
  // Preço em confirmação: não dá para pedir, e o botão já diz o motivo (em vez de "Escolha o tamanho")
  const blocked = (product.kind === 'simple' && product.price_review) || singleReview;

  const currentSize = () => product.sizes.find((s) => s.id === sel.sizeId) || null;

  function legend(title, sub, required, done) {
    return h('legend', {},
      h('span', {}, title, sub ? h('small', {}, ` · ${sub}`) : null),
      required ? h('span', { class: `req${done ? ' done' : ''}` }, done ? 'OK' : 'Obrigatório') : null);
  }

  function sizeGroup() {
    return h('fieldset', { class: 'opt-group' },
      legend('Tamanho', 'escolha 1', true, !!sel.sizeId),
      product.sizes.map((s) => {
        const from = minFlavorPrice(s.id);
        const input = h('input', { type: 'radio', name: 'pm-size', value: s.id, checked: sel.sizeId === s.id });
        input.addEventListener('change', () => {
          sel.sizeId = s.id;
          // ao trocar de tamanho, respeita o novo limite e remove borda sem preço no tamanho
          sel.flavorIds = sel.flavorIds.slice(0, s.max_flavors).filter((fid) => catalog.flavorPrice(fid, s.id));
          if (sel.crustId && catalog.crustPrice(sel.crustId, s.id) === null) sel.crustId = null;
          renderGroups(); update();
        });
        const sub = [s.slices ? `${s.slices} pedaços` : null, singleFlavor ? null : `até ${s.max_flavors} sabor${s.max_flavors > 1 ? 'es' : ''}`].filter(Boolean).join(' · ');
        let price = null;
        if (singleReview) price = reviewTag();
        else if (singleFlavor) {
          const fp = catalog.flavorPrice(product.flavors[0].id, s.id);
          if (fp) price = priceTag(fp.effectiveCents, fp.promoCents !== null ? fp.priceCents : null);
        } else if (from !== null) price = h('span', { class: 'opt-price' }, `a partir de ${formatCents(from)}`);
        return h('label', { class: 'opt' }, input,
          h('span', { class: 'opt-text' }, h('span', { class: 'opt-name' }, s.name), h('span', { class: 'opt-sub' }, sub)),
          price);
      }));
  }

  function minFlavorPrice(sizeId) {
    let min = null;
    for (const f of product.flavors) {
      const fp = catalog.flavorPrice(f.id, sizeId);
      if (fp && !f.price_review && (min === null || fp.effectiveCents < min)) min = fp.effectiveCents;
    }
    return min;
  }

  const reviewTag = () => h('span', { class: 'opt-price review' }, 'preço em confirmação');

  function flavorGroup() {
    const size = currentSize();
    const max = size?.max_flavors ?? 1;
    const rule = catalog.settings.multi_flavor_rule;
    const group = h('fieldset', { class: 'opt-group' },
      legend('Sabores', size ? `escolha até ${max}` : 'escolha o tamanho primeiro', true, sel.flavorIds.length > 0));
    if (size && max > 1) {
      group.append(h('p', { class: 'rule-note' }, rule ? MULTI_FLAVOR_RULES[rule]
        : 'Esta pizzaria ainda não definiu a regra de preço para mais de um sabor; por enquanto escolha só 1 sabor.'));
    }
    for (const f of product.flavors) {
      const fp = size ? catalog.flavorPrice(f.id, size.id) : null;
      if (size && !fp) continue;
      const checked = sel.flavorIds.includes(f.id);
      const full = sel.flavorIds.length >= max;
      const disabled = !size || f.price_review || (!checked && full);
      const input = h('input', { type: 'checkbox', value: f.id, checked, disabled });
      input.addEventListener('change', () => {
        if (input.checked) {
          if (sel.flavorIds.length >= max) {
            if (max === 1) sel.flavorIds = [f.id]; // troca direta quando só cabe 1
            else { input.checked = false; return; }
          } else sel.flavorIds.push(f.id);
        } else sel.flavorIds = sel.flavorIds.filter((id) => id !== f.id);
        renderGroups(); update();
      });
      if (max === 1 && size && !f.price_review) input.disabled = false;
      const order = sel.flavorIds.indexOf(f.id);
      group.append(h('label', { class: `opt${input.disabled ? ' disabled' : ''}` }, input,
        h('span', { class: 'opt-text' },
          h('span', { class: 'opt-name' }, f.name, order >= 0 && max > 1 ? ' ' : null, order >= 0 && max > 1 ? h('span', { class: 'opt-order', 'aria-label': `sabor ${order + 1}` }, `${order + 1}`) : null),
          f.description ? h('span', { class: 'opt-sub' }, f.description) : null),
        f.price_review ? reviewTag() : fp ? priceTag(fp.effectiveCents, fp.promoCents !== null ? fp.priceCents : null) : null));
    }
    return group;
  }

  function priceTag(cents, oldCents) {
    return h('span', { class: 'opt-price' },
      oldCents !== null ? h('span', { class: 'price-old' }, formatCents(oldCents)) : null,
      oldCents !== null ? ' ' : null,
      h('span', { class: oldCents !== null ? 'price-promo' : '' }, formatCents(cents)));
  }

  function crustGroup(crusts) {
    const none = h('input', { type: 'radio', name: 'pm-crust', value: '', checked: !sel.crustId });
    none.addEventListener('change', () => { sel.crustId = null; update(); });
    return h('fieldset', { class: 'opt-group' },
      legend('Borda', 'opcional', false),
      h('label', { class: 'opt' }, none, h('span', { class: 'opt-text' }, h('span', { class: 'opt-name' }, 'Sem borda'))),
      crusts.map((c) => {
        const input = h('input', { type: 'radio', name: 'pm-crust', value: c.id, checked: sel.crustId === c.id, disabled: !!c.price_review });
        input.addEventListener('change', () => { sel.crustId = c.id; update(); });
        return h('label', { class: `opt${c.price_review ? ' disabled' : ''}` }, input,
          h('span', { class: 'opt-text' }, h('span', { class: 'opt-name' }, c.name)),
          c.price_review ? reviewTag() : h('span', { class: 'opt-price' }, `+ ${formatCents(c.priceCents)}`));
      }));
  }

  function extrasGroup() {
    return h('fieldset', { class: 'opt-group' },
      legend('Adicionais', 'opcional', false),
      product.extras.map((e) => {
        const input = h('input', { type: 'checkbox', value: e.id, checked: sel.extraIds.includes(e.id), disabled: !!e.price_review });
        input.addEventListener('change', () => {
          sel.extraIds = input.checked ? [...sel.extraIds, e.id] : sel.extraIds.filter((id) => id !== e.id);
          update();
        });
        return h('label', { class: `opt${e.price_review ? ' disabled' : ''}` }, input,
          h('span', { class: 'opt-text' }, h('span', { class: 'opt-name' }, e.name)),
          e.price_review ? reviewTag() : h('span', { class: 'opt-price' }, `+ ${formatCents(e.priceCents)}`));
      }));
  }

  function update() {
    const result = priceItem(catalog, sel);
    qtyOut.textContent = String(sel.quantity);
    minus.disabled = sel.quantity <= 1;
    plus.disabled = sel.quantity >= MAX_QTY;
    totalOut.textContent = formatCents(Number.isFinite(result.lineCents) ? result.lineCents : 0);
    confirmBtn.setAttribute('aria-disabled', String(!result.ok));
    confirmBtn.classList.toggle('is-invalid', !result.ok);
    clear(errorsBox);
    if (showErrors) result.errors.forEach((e) => errorsBox.append(h('li', {}, e)));
    // atualiza os selos "Obrigatório/OK"
    dialog.querySelectorAll('.opt-group legend .req').forEach((el, i) => {
      const done = i === 0 ? !!sel.sizeId : sel.flavorIds.length > 0;
      el.classList.toggle('done', done);
      el.textContent = done ? 'OK' : 'Obrigatório';
    });
    if (blocked) {
      confirmBtn.firstChild.textContent = 'Preço em confirmação';
      totalOut.textContent = '';
      confirmBtn.setAttribute('aria-disabled', 'true');
      confirmBtn.classList.add('is-invalid');
    }
    return result;
  }

  function confirm() {
    if (blocked) return;
    const result = update();
    if (!result.ok) {
      showErrors = true;
      update();
      errorsBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    onConfirm?.({ ...sel, notes: notes.value });
    dialog.close();
  }

  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // clique fora
  document.body.append(dialog);
  renderGroups();
  update();
  dialog.showModal();
  body.scrollTop = 0;
  return dialog;
}
