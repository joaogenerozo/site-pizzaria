import { formatCents } from './money.js';

// Limpa texto livre do cliente: sem caracteres de controle, espaços simples, tamanho limitado.
export function cleanText(s, max = 200) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export const onlyDigits = (s) => String(s ?? '').replace(/\D/g, '');

// Telefone brasileiro: DDD + 8 ou 9 dígitos (aceita digitar com 55 na frente)
export function normalizeBrPhone(s) {
  let d = onlyDigits(s);
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return /^[1-9]{2}9?\d{8}$/.test(d) ? d : null;
}

export function formatBrPhone(d) {
  if (!d) return '';
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

// Número comercial no formato internacional, só dígitos (ex.: 5535999999999)
export function isValidWhatsappNumber(n) {
  return typeof n === 'string' && /^[1-9]\d{9,14}$/.test(n);
}

/**
 * Monta o texto do pedido.
 * order = {
 *   customer: { name, phone }, mode: 'delivery'|'pickup',
 *   address: { street, number, complement, district, reference } | null,
 *   payment: { name, changeFor: cents|null }, notes,
 *   items: [{ quantity, name, size, flavors[], crust, extras[], notes, unitCents, lineCents }],
 *   subtotalCents, discountCents, deliveryFeeCents, totalCents,
 * }
 */
export function buildOrderMessage(order) {
  const L = [];
  L.push('NOVO PEDIDO — CARDÁPIO DIGITAL');
  L.push('');
  L.push(`Cliente: ${cleanText(order.customer.name, 80)}`);
  L.push(`Telefone: ${formatBrPhone(order.customer.phone)}`);
  L.push(`Tipo: ${order.mode === 'delivery' ? 'Entrega' : 'Retirada'}`);
  L.push('');
  L.push('ITENS:');
  for (const it of order.items) {
    L.push(`${it.quantity} × ${cleanText(it.name, 120)}`);
    if (it.size) L.push(`Tamanho: ${cleanText(it.size, 60)}`);
    if (it.flavors?.length) L.push(`Sabores: ${it.flavors.map((f) => cleanText(f, 80)).join(' / ')}`);
    if (it.size) L.push(`Borda: ${it.crust ? cleanText(it.crust, 60) : 'Sem borda'}`);
    if (it.extras?.length) L.push(`Adicionais: ${it.extras.map((e) => cleanText(e, 60)).join(', ')}`);
    if (it.notes) L.push(`Observações: ${cleanText(it.notes, 140)}`);
    L.push(`Valor do item: ${formatCents(it.lineCents)}${it.quantity > 1 ? ` (${formatCents(it.unitCents)} cada)` : ''}`);
    L.push('');
  }
  L.push(`Subtotal: ${formatCents(order.subtotalCents)}`);
  if (order.discountCents > 0) L.push(`Desconto: - ${formatCents(order.discountCents)}`);
  L.push(`Taxa de entrega: ${formatCents(order.deliveryFeeCents)}`);
  L.push(`TOTAL: ${formatCents(order.totalCents)}`);
  L.push('');
  if (order.mode === 'delivery' && order.address) {
    const a = order.address;
    const line = [
      `${cleanText(a.street, 120)}, ${cleanText(a.number, 20)}`,
      a.complement ? cleanText(a.complement, 80) : null,
      cleanText(a.district, 100),
    ].filter(Boolean).join(' - ');
    L.push(`Endereço: ${line}`);
    if (a.reference) L.push(`Referência: ${cleanText(a.reference, 120)}`);
  } else {
    L.push('Endereço: retirada no local');
  }
  L.push(`Pagamento: ${cleanText(order.payment.name, 60)}`);
  if (order.payment.changeFor) L.push(`Troco para: ${formatCents(order.payment.changeFor)}`);
  if (order.notes) L.push(`Observações do pedido: ${cleanText(order.notes, 300)}`);
  return L.join('\n');
}

// wa.me abre o app no celular e o WhatsApp Web no computador.
export function whatsappLink(number, message) {
  if (!isValidWhatsappNumber(number)) throw new Error('Número de WhatsApp da loja não configurado.');
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
