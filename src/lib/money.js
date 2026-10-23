// Valores monetários são tratados em centavos inteiros para evitar erros
// de ponto flutuante (0,1 + 0,2).

export function toCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatCents(cents) {
  if (!Number.isFinite(cents)) return '—';
  // Intl usa espaço não separável; trocamos por espaço comum (melhor para WhatsApp)
  return brl.format(cents / 100).replace(/ /g, ' ');
}

export function formatPrice(value) {
  return formatCents(toCents(value));
}
