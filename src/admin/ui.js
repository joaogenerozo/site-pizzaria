import { h } from '../lib/dom.js';

let timer;
export function notify(message, kind = 'ok') {
  document.querySelector('.toast')?.remove();
  clearTimeout(timer);
  const el = h('div', { class: `toast${kind === 'error' ? ' toast-error' : ''}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  document.body.append(el);
  timer = setTimeout(() => el.remove(), kind === 'error' ? 6000 : 2500);
}
