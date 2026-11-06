// Microinterações do cardápio: só CSS (transform/opacity) disparado por classes.
// Nada aqui muda preço, item ou pedido; é apenas retorno visual.
// Quem pede menos movimento no aparelho (prefers-reduced-motion) recebe o mesmo
// retorno sem animação: o CSS zera as durações e as partículas nem são criadas.

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Reinicia uma animação de "toque" (ex.: o número da sacola pulando)
export function bump(el, cls = 'is-bump') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // força o navegador a recomeçar a animação
  el.classList.add(cls);
  // animações dos filhos também chegam aqui (o evento sobe): só a do próprio elemento conta
  const done = (e) => {
    if (e.target !== el) return;
    el.classList.remove(cls);
    el.removeEventListener('animationend', done);
  };
  el.addEventListener('animationend', done);
}

// Espera a animação de saída terminar (com limite, caso o navegador não avise)
export function animateOut(el, cls, maxMs = 320) {
  return new Promise((resolve) => {
    if (!el || reducedMotion()) { resolve(); return; }
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    el.addEventListener('animationend', (e) => { if (e.target === el) finish(); });
    setTimeout(finish, maxMs);
    el.classList.add(cls);
  });
}

// Janela (dialog) que some suavemente: todo dialog.close() passa a animar a saída.
// A janela fecha de verdade na hora (a página volta a responder ao toque e o foco
// volta para onde estava); só a imagem dela continua visível por ~0,2 s, sem
// bloquear nada, e então o evento "close" segue para quem estiver ouvindo.
// Chame antes de registrar os outros "close" do dialog.
export function softClose(dialog) {
  const nativeClose = dialog.close.bind(dialog);
  let phase = 'idle'; // idle -> leaving (imagem saindo) -> idle
  dialog.addEventListener('close', (e) => {
    if (phase === 'leaving') e.stopImmediatePropagation();
  });
  dialog.close = (value) => {
    if (!dialog.open || phase === 'leaving') return;
    if (reducedMotion()) { nativeClose(value); return; }
    phase = 'leaving';
    nativeClose(value);
    const opener = document.activeElement; // o navegador já devolveu o foco para cá
    // reabre sem ser modal, só para a animação de saída: não captura cliques nem teclado
    dialog.inert = true;
    dialog.classList.add('is-closing');
    dialog.show();
    if (opener && document.activeElement !== opener) opener.focus({ preventScroll: true });
    animateOut(dialog, 'is-closing', 260).then(() => {
      phase = 'idle';
      // se o cliente já foi para outro lugar (ex.: busca), o foco fica onde ele está
      const current = document.activeElement;
      nativeClose(value); // agora sim: dispara o "close" de quem usa a janela
      if (current && current !== document.body && document.activeElement !== current) current.focus({ preventScroll: true });
      dialog.classList.remove('is-closing');
      dialog.inert = false;
    });
  };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); dialog.close(); });
  return dialog;
}

// Pequena comemoração: partículas discretas saindo do centro do elemento.
// Decorativo (aria-hidden) e removido sozinho depois de ~1 s.
const BURST_COLORS = ['#c8102e', '#1f8f4e', '#f6c453', '#1e3a8a'];
export function burst(container, count = 14) {
  if (!container || reducedMotion()) return;
  const layer = document.createElement('span');
  layer.className = 'burst';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const angle = (360 / count) * i + (Math.random() * 16 - 8);
    const dist = 12 + Math.random() * 22;
    p.style.setProperty('--a', `${angle}deg`);
    p.style.setProperty('--d', `${dist}px`);
    p.style.setProperty('--c', BURST_COLORS[i % BURST_COLORS.length]);
    p.style.setProperty('--delay', `${Math.round(Math.random() * 90)}ms`);
    if (i % 3 === 0) p.className = 'dot';
    layer.append(p);
  }
  container.append(layer);
  setTimeout(() => layer.remove(), 1200);
}
