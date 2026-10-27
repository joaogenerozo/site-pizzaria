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

// Link do e-mail "esqueci minha senha": o Supabase volta para /admin/ com
// #access_token=…&type=recovery (ou #error=… se o link expirou). Lido antes de
// o supabase-js limpar o endereço.
const urlHash = new URLSearchParams(location.hash.slice(1));
const recoveryLink = urlHash.get('type') === 'recovery';
const linkError = urlHash.get('error_code') === 'otp_expired' || urlHash.has('error')
  ? 'Este link de redefinição expirou ou já foi usado. Peça um novo em “Esqueci minha senha”.'
  : '';
if (linkError) history.replaceState(null, '', location.pathname);

if (configError) {
  root.append(h('div', { class: 'adm-center' }, h('p', { class: 'errors' }, configError)));
} else {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') renderLogin();
    if (event === 'PASSWORD_RECOVERY') renderNewPassword();
  });
  start();
}

async function start() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return renderLogin(linkError);
  if (recoveryLink) return renderNewPassword();
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
    h('button', { class: 'link-btn', type: 'button', id: 'forgot', onclick: () => renderForgot(email.value.trim()) }, 'Esqueci minha senha'),
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

// Pede ao Supabase o e-mail com o link para criar uma senha nova
function renderForgot(prefill = '') {
  const email = h('input', { class: 'input', id: 'forgot-email', type: 'email', autocomplete: 'username', required: true, value: prefill || null });
  const msg = h('p', { role: 'status', hidden: true });
  const btn = h('button', { class: 'btn', type: 'submit', id: 'forgot-submit' }, 'Enviar link');
  const form = h('form', { class: 'adm-login', novalidate: true },
    h('h1', {}, 'Redefinir senha'),
    h('p', { class: 'adm-help' }, 'Informe o e-mail de administrador. Enviaremos um link para você criar uma senha nova.'),
    h('label', { class: 'field-label', for: 'forgot-email' }, 'E-mail'), email,
    msg, btn,
    h('button', { class: 'link-btn', type: 'button', onclick: () => renderLogin() }, 'Voltar para o login'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { msg.hidden = false; msg.className = 'errors'; msg.textContent = 'Informe um e-mail válido.'; return; }
    btn.disabled = true; btn.textContent = 'Enviando…';
    const { error } = await supabase.auth.resetPasswordForEmail(value, { redirectTo: location.origin + location.pathname });
    btn.disabled = false; btn.textContent = 'Enviar link';
    msg.hidden = false;
    if (error && !/not found|user/i.test(error.message)) {
      msg.className = 'errors';
      msg.textContent = /rate|seconds/i.test(error.message)
        ? 'Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.'
        : `Não foi possível enviar: ${error.message}`;
      return;
    }
    // Mesma resposta para e-mail cadastrado ou não (não revela quem é administrador)
    msg.className = 'notice';
    msg.textContent = 'Se este e-mail tiver acesso ao painel, o link chega em alguns minutos. Confira também o spam.';
  });
  clear(root).append(h('div', { class: 'adm-center' }, form));
  email.focus();
}

// Aberto pelo link do e-mail: a pessoa já está autenticada só para trocar a senha
function renderNewPassword() {
  if (document.getElementById('new-password')) return;
  const password = h('input', { class: 'input', id: 'new-password', type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const confirmPw = h('input', { class: 'input', id: 'new-password-2', type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const error = h('p', { class: 'errors', role: 'alert', hidden: true });
  const btn = h('button', { class: 'btn', type: 'submit', id: 'new-password-submit' }, 'Salvar nova senha');
  const form = h('form', { class: 'adm-login', novalidate: true },
    h('h1', {}, 'Criar senha nova'),
    h('label', { class: 'field-label', for: 'new-password' }, 'Nova senha (mínimo 8 caracteres)'), password,
    h('label', { class: 'field-label', for: 'new-password-2' }, 'Repita a nova senha'), confirmPw,
    error, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = false;
    if (password.value.length < 8) { error.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
    if (password.value !== confirmPw.value) { error.textContent = 'As duas senhas não são iguais.'; return; }
    error.hidden = true;
    btn.disabled = true; btn.textContent = 'Salvando…';
    const { error: err } = await supabase.auth.updateUser({ password: password.value });
    if (err) {
      btn.disabled = false; btn.textContent = 'Salvar nova senha';
      error.hidden = false;
      error.textContent = /different|same/i.test(err.message) ? 'A senha nova precisa ser diferente da anterior.'
        : /weak|least|characters/i.test(err.message) ? 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.'
          : `Não foi possível salvar: ${err.message}`;
      return;
    }
    history.replaceState(null, '', location.pathname);
    notify('Senha alterada.');
    await enter();
  });
  clear(root).append(h('div', { class: 'adm-center' }, form));
  password.focus();
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
      h('h1', { class: 'adm-title' }, 'Painel'),
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
