import '../styles/main.css';
import '../styles/admin.css';
import { h, clear, add } from '../lib/dom.js';
import { pizzaArt } from '../lib/icons.js';
import { supabase, configError } from '../lib/supabase.js';
import { notify } from './ui.js';
import { friendlyDbError } from './fields.js';
import { productsView, categoriesView, pizzaView, extrasView, deliveryView, settingsView } from './views.js';

// IMPORTANTE: esconder telas aqui é só conveniência. Quem protege os dados é
// o banco (RLS + tabela admins). Mesmo que alguém altere este código no
// navegador, toda gravação de quem não é admin é recusada pelo Supabase.

const root = document.getElementById('admin');
const TABS = [
  ['produtos', 'Produtos', productsView],
  ['categorias', 'Categorias', categoriesView],
  ['pizzas', 'Pizzas', pizzaView],
  ['adicionais', 'Adicionais', extrasView],
  ['entrega', 'Entrega, pagamento e horários', deliveryView],
  ['loja', 'Dados da loja', settingsView],
];

if (configError) {
  root.append(h('div', { class: 'adm-center' }, h('p', { class: 'errors' }, configError)));
} else {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') renderLogin();
  });
  start();
}

async function start() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return renderLogin();
  await enter();
}

function renderLogin(message = '') {
  const email = h('input', { class: 'input', id: 'login-email', type: 'email', autocomplete: 'username', required: true });
  const password = h('input', { class: 'input', id: 'login-password', type: 'password', autocomplete: 'current-password', required: true });
  const error = h('p', { class: 'errors', role: 'alert', hidden: !message }, message);
  const btn = h('button', { class: 'btn', type: 'submit', id: 'login-submit' }, 'Entrar');
  const form = h('form', { class: 'adm-login', novalidate: true },
    h('div', { class: 'logo' }, pizzaArt()),
    h('h1', {}, 'Painel administrativo'),
    h('label', { class: 'field-label', for: 'login-email' }, 'E-mail'), email,
    h('label', { class: 'field-label', for: 'login-password' }, 'Senha'), password,
    error, btn,
    h('p', { class: 'adm-help' }, 'Acesso restrito aos administradores cadastrados no banco.'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    if (!email.value.trim() || !password.value) { error.hidden = false; error.textContent = 'Informe e-mail e senha.'; return; }
    btn.disabled = true; btn.textContent = 'Entrando…';
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
    password.value = '';
    if (err) {
      btn.disabled = false; btn.textContent = 'Entrar';
      error.hidden = false;
      error.textContent = /invalid/i.test(err.message) ? 'E-mail ou senha incorretos.' : `Não foi possível entrar: ${err.message}`;
      return;
    }
    await enter();
  });
  clear(root).append(h('div', { class: 'adm-center' }, form));
  email.focus();
}

async function enter() {
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error) return renderLogin(friendlyDbError(error));
  if (!isAdmin) {
    const { data } = await supabase.auth.getUser();
    clear(root).append(h('div', { class: 'adm-center' }, h('div', { class: 'adm-login' },
      h('h1', {}, 'Sem permissão'),
      h('p', {}, `A conta ${data?.user?.email ?? ''} não é administradora desta loja.`),
      h('p', { class: 'adm-help' }, 'Peça ao responsável para cadastrá-la como administradora no Supabase.'),
      h('button', { class: 'btn', type: 'button', onclick: logout }, 'Sair'))));
    return;
  }
  renderShell();
}

async function logout() {
  await supabase.auth.signOut();
  renderLogin();
}

function renderShell() {
  const nav = h('nav', { class: 'adm-tabs', 'aria-label': 'Seções do painel' });
  const main = h('main', { class: 'adm-main', id: 'adm-main' });
  add(clear(root),
    h('header', { class: 'adm-top' },
      h('strong', {}, 'Painel'),
      h('div', { class: 'adm-top-actions' },
        h('a', { href: '../', target: '_blank', rel: 'noopener', class: 'link-btn light' }, 'Ver cardápio'),
        h('button', { type: 'button', class: 'link-btn light', id: 'logout', onclick: logout }, 'Sair'))),
    nav, main);

  const show = async () => {
    const key = location.hash.slice(1) || TABS[0][0];
    const tab = TABS.find((t) => t[0] === key) ?? TABS[0];
    clear(nav).append(...TABS.map(([k, label]) => h('a', { href: `#${k}`, class: 'adm-tab', 'aria-current': k === tab[0] ? 'page' : null }, label)));
    clear(main).append(h('p', { class: 'adm-help' }, 'Carregando…'));
    try {
      const view = await tab[2]();
      clear(main).append(view.el);
    } catch (e) {
      clear(main).append(h('p', { class: 'errors' }, friendlyDbError(e)));
    }
  };
  window.onhashchange = show;
  show();
}

window.addEventListener('unhandledrejection', (e) => notify(friendlyDbError(e.reason), 'error'));
