import { h } from '../lib/dom.js';
import { toCents } from '../lib/money.js';
import { WEEKDAYS } from '../lib/hours.js';

// Converte e valida o valor digitado num campo do formulário.
// Retorna { value } ou { error }.
export function parseField(field, raw) {
  const empty = raw === '' || raw === null || raw === undefined;
  if (field.type === 'bool') return { value: !!raw };
  if (field.type === 'multi') return { value: raw || [] };
  if (empty) return field.required ? { error: 'Obrigatório.' } : { value: null };

  const s = typeof raw === 'string' ? raw.trim() : raw;
  switch (field.type) {
    case 'money': {
      const c = toCents(s);
      if (c === null || c < 0) return { error: 'Valor inválido (use, por exemplo, 49,90).' };
      if (c > 100000000) return { error: 'Valor alto demais.' };
      return { value: (c / 100).toFixed(2) };
    }
    case 'int': {
      if (!/^-?\d+$/.test(String(s))) return { error: 'Use um número inteiro.' };
      const n = Number(s);
      if (field.min !== undefined && n < field.min) return { error: `Mínimo ${field.min}.` };
      if (field.max !== undefined && n > field.max) return { error: `Máximo ${field.max}.` };
      return { value: n };
    }
    case 'url':
    case 'image':
      if (!/^https:\/\/[^\s"'<>]+$/i.test(s)) return { error: 'Use um endereço que comece com https://' };
      return { value: s };
    case 'whatsapp': {
      const d = String(s).replace(/\D/g, '');
      if (!/^[1-9]\d{9,14}$/.test(d)) return { error: 'Use o formato internacional só com números: 55 + DDD + número. Ex.: 5535999999999' };
      if (d.startsWith('55') && !/^55[1-9]{2}9?\d{8}$/.test(d)) return { error: 'Número brasileiro inválido: confira o DDD e a quantidade de dígitos.' };
      return { value: d };
    }
    case 'time':
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return { error: 'Use o formato HH:MM.' };
      return { value: s };
    case 'select':
    case 'weekday':
      return { value: field.type === 'weekday' ? Number(s) : s };
    default: {
      const max = field.maxlength ?? 200;
      const v = String(s).replace(/\u0000/g, '');
      if (v.length > max) return { error: `Máximo de ${max} caracteres.` };
      return { value: v };
    }
  }
}

// Valor do banco -> texto exibido no campo
export function displayValue(field, v) {
  if (v === null || v === undefined) return field.type === 'bool' ? false : '';
  if (field.type === 'money') return Number(v).toFixed(2).replace('.', ',');
  if (field.type === 'time') return String(v).slice(0, 5);
  return v;
}

// Cria o controle de um campo. getValue() devolve o valor bruto.
export function renderField(field, initial) {
  const id = `fld-${field.key}`;
  let control;
  let getValue;

  if (field.type === 'bool') {
    control = h('input', { type: 'checkbox', id, checked: !!initial });
    getValue = () => control.checked;
    return { el: h('label', { class: 'adm-check' }, control, h('span', {}, field.label), field.help ? h('small', {}, field.help) : null), getValue, control };
  }
  if (field.type === 'textarea') {
    control = h('textarea', { id, rows: 3, maxlength: field.maxlength ?? 1000 });
    control.value = initial ?? '';
  } else if (field.type === 'select' || field.type === 'weekday') {
    const options = field.type === 'weekday'
      ? WEEKDAYS.map((label, value) => ({ value, label }))
      : field.options;
    control = h('select', { id, class: 'input' },
      field.required ? null : h('option', { value: '' }, field.emptyLabel ?? '—'),
      options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(initial) }, o.label)));
  } else if (field.type === 'multi') {
    const set = new Set(initial || []);
    const boxes = field.options.map((o) => {
      const cb = h('input', { type: 'checkbox', value: o.value, checked: set.has(o.value) });
      return { cb, el: h('label', { class: 'adm-check inline' }, cb, h('span', {}, o.label)) };
    });
    control = h('div', { class: 'adm-multi', id, role: 'group' }, boxes.length ? boxes.map((b) => b.el) : h('small', {}, 'Nenhuma opção cadastrada ainda.'));
    getValue = () => boxes.filter((b) => b.cb.checked).map((b) => b.cb.value);
  } else {
    const typeAttr = { money: 'text', int: 'number', url: 'url', image: 'url', time: 'time', whatsapp: 'tel' }[field.type] || 'text';
    control = h('input', {
      id, class: 'input', type: typeAttr,
      inputmode: field.type === 'money' ? 'decimal' : field.type === 'whatsapp' ? 'numeric' : null,
      maxlength: field.maxlength ?? null, placeholder: field.placeholder ?? null,
      min: field.min ?? null, max: field.max ?? null,
    });
    control.value = initial ?? '';
  }
  if (control.classList && !control.classList.contains('input') && control.tagName !== 'DIV') control.classList.add('input');
  getValue ??= () => control.value;

  const error = h('p', { class: 'field-error', hidden: true });
  const el = h('div', { class: 'adm-field' },
    h('label', { for: id, class: 'field-label' }, field.label, field.required ? h('span', { class: 'adm-req', 'aria-hidden': 'true' }, ' *') : null),
    control,
    field.help ? h('small', { class: 'adm-help' }, field.help) : null,
    error);
  return {
    el, control, getValue,
    setError(msg) { error.hidden = !msg; error.textContent = msg || ''; control.setAttribute?.('aria-invalid', msg ? 'true' : 'false'); },
  };
}

// Mensagens amigáveis para erros do banco
export function friendlyDbError(err) {
  const code = err?.code;
  const msg = err?.message || String(err);
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Sem permissão para esta ação. Entre com uma conta de administrador.';
  if (code === 'PGRST116') return 'Nada foi alterado: o registro não existe mais ou sua conta não tem permissão.';
  if (code === '23503') return 'Não é possível excluir: existem itens ligados a este registro (por exemplo, produtos nesta categoria). Desative-o ou mova os itens antes.';
  if (code === '23505') return 'Já existe um registro igual.';
  if (code === '23514') {
    if (/promo/.test(msg)) return 'O preço promocional precisa ser menor que o preço normal.';
    if (/whatsapp/.test(msg)) return 'Número de WhatsApp em formato inválido.';
    if (/_url/.test(msg)) return 'Os endereços de imagem/links precisam começar com https://';
    if (/pizza_no_price/.test(msg)) return 'Produtos do tipo pizza não têm preço próprio: o preço vem dos sabores.';
    if (/simple_has_price/.test(msg)) return 'Informe o preço do produto.';
    if (/qty_promo/.test(msg)) return 'Preencha juntos a quantidade mínima e o preço da promoção por quantidade.';
    return 'Algum valor está fora do permitido. Confira os campos.';
  }
  if (/JWT|session/i.test(msg)) return 'Sua sessão expirou. Entre novamente.';
  return `Erro: ${msg}`;
}
