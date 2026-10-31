import { h, clear, add } from '../lib/dom.js';
import { supabase } from '../lib/supabase.js';
import { matchesSearch, matchFilesToItems } from '../lib/text.js';
import { icon } from '../lib/icons.js';
import { IMAGE_TYPES, uploadImage, imageErrorMessage, removeUnusedImages } from './images.js';
import { friendlyDbError } from './fields.js';
import { notify } from './ui.js';

// Aba "Fotos": todas as pizzas e produtos em grade, cada um com a foto que
// aparece no cardápio. Um toque em "Enviar foto" escolhe a imagem no celular
// ou no computador, reduz o tamanho, envia ao Storage e já grava no produto.

export async function photosView() {
  const [prods, cats] = await Promise.all([
    supabase.from('products').select('id, name, image_url, available, category_id, sort_order').order('sort_order').order('name'),
    supabase.from('categories').select('id, name, sort_order').order('sort_order').order('name'),
  ]);
  if (prods.error) throw prods.error;
  if (cats.error) throw cats.error;
  const products = prods.data;
  const categories = cats.data;

  const search = h('input', { class: 'input', type: 'search', id: 'photo-search', placeholder: 'Buscar pelo nome', 'aria-label': 'Buscar produto pelo nome' });
  const onlyMissing = h('input', { type: 'checkbox', id: 'photo-missing' });
  const summary = h('p', { class: 'adm-help', id: 'photo-summary', role: 'status' });
  const list = h('div', { class: 'adm-photo-groups' });
  const bulkInput = h('input', { type: 'file', accept: IMAGE_TYPES.join(','), multiple: true, class: 'sr-only', id: 'photo-bulk' });
  bulkInput.addEventListener('change', () => {
    const files = [...bulkInput.files];
    bulkInput.value = '';
    if (files.length) bulkDialog(files, products, render);
  });

  function render() {
    const withPhoto = products.filter((p) => p.image_url).length;
    summary.textContent = `${withPhoto} de ${products.length} produtos com foto.`;
    clear(list);
    let shown = 0;
    for (const cat of categories) {
      const items = products.filter((p) => p.category_id === cat.id
        && matchesSearch(search.value, p.name)
        && (!onlyMissing.checked || !p.image_url));
      if (!items.length) continue;
      shown += items.length;
      list.append(h('section', { class: 'adm-photo-group' },
        h('h3', {}, cat.name),
        h('ul', { class: 'adm-photo-grid' }, items.map((p) => tile(p, render)))));
    }
    if (!shown) list.append(h('p', { class: 'adm-empty' }, onlyMissing.checked && !search.value ? 'Todos os produtos já têm foto.' : 'Nenhum produto encontrado.'));
  }
  search.addEventListener('input', render);
  onlyMissing.addEventListener('change', render);
  render();

  const el = h('section', { class: 'adm-card adm-photos' },
    h('div', { class: 'adm-card-head' },
      h('div', {},
        h('h2', {}, 'Fotos'),
        h('p', { class: 'adm-help' }, 'Toque em “Enviar foto” para escolher uma imagem do celular ou do computador. Ela aparece no cardápio na hora. Fotos grandes são reduzidas automaticamente.')),
      h('label', { class: 'btn', for: bulkInput.id }, 'Enviar várias fotos')),
    bulkInput,
    h('p', { class: 'adm-help' }, 'Para enviar várias de uma vez, dê a cada arquivo o nome do produto (por exemplo “Frango com Catupiry.jpg” ou “frango-com-catupiry.webp”). Antes de gravar, você confere qual foto vai para qual produto.'),
    h('div', { class: 'adm-photo-tools' },
      search,
      h('label', { class: 'adm-check inline', for: onlyMissing.id }, onlyMissing, 'Só os que estão sem foto')),
    summary,
    list);
  return { el };
}

// Grava a URL no produto e apaga do Storage a foto antiga, se ninguém mais usa.
async function savePhoto(product, url) {
  const old = product.image_url;
  const { error } = await supabase.from('products').update({ image_url: url }).eq('id', product.id).select('id').single();
  if (error) throw error;
  product.image_url = url;
  if (old && old !== url) removeUnusedImages([old]);
}

function tile(p, rerender) {
  const input = h('input', { type: 'file', accept: IMAGE_TYPES.join(','), class: 'sr-only', id: `photo-${p.id}` });
  const status = h('small', { class: 'adm-help', role: 'status' });
  const busy = (on) => li.classList.toggle('busy', on);

  input.addEventListener('change', async () => {
    const f = input.files[0];
    input.value = '';
    if (!f) return;
    busy(true);
    status.textContent = 'Enviando…';
    let url;
    try {
      url = await uploadImage(f);
      await savePhoto(p, url);
    } catch (e) {
      busy(false);
      status.textContent = imageErrorMessage(e);
      if (url) removeUnusedImages([url]); // enviada, mas não gravada no produto
      return;
    }
    notify(`Foto de “${p.name}” salva.`);
    rerender();
  });

  async function remove() {
    if (!(await confirmRemove(p.name))) return;
    busy(true);
    try { await savePhoto(p, null); } catch (e) { busy(false); status.textContent = friendlyDbError(e); return; }
    notify(`Foto de “${p.name}” removida.`);
    rerender();
  }

  const li = h('li', { class: `adm-photo${p.available ? '' : ' off'}`, dataset: { name: p.name } },
    p.image_url
      ? h('img', { class: 'adm-photo-img', src: p.image_url, alt: `Foto de ${p.name}`, loading: 'lazy', decoding: 'async' })
      : h('div', { class: 'adm-photo-img empty' }, 'Sem foto'),
    h('strong', { class: 'adm-photo-name' }, p.name),
    p.available ? null : h('small', { class: 'adm-help' }, 'Indisponível no cardápio'),
    h('div', { class: 'adm-photo-actions' },
      h('label', { class: 'btn btn-ghost', for: input.id }, p.image_url ? 'Trocar foto' : 'Enviar foto'),
      p.image_url ? h('button', { class: 'link-btn danger', type: 'button', 'aria-label': `Remover foto de ${p.name}`, onclick: remove }, 'Remover') : null),
    input, status);
  return li;
}

function confirmRemove(name) {
  return new Promise((resolve) => {
    let answer = false;
    const d = h('dialog', { class: 'sheet adm-confirm', role: 'alertdialog', 'aria-labelledby': 'rm-t' },
      h('div', { class: 'sheet-body' }, h('h2', { class: 'sheet-title', id: 'rm-t' }, 'Remover foto?'),
        h('p', {}, `“${name}” vai aparecer no cardápio sem foto. Você pode enviar outra depois.`)),
      h('div', { class: 'sheet-foot' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => d.close() }, 'Cancelar'),
        h('button', { class: 'btn btn-danger', type: 'button', id: 'rm-ok', onclick: () => { answer = true; d.close(); } }, 'Remover')));
    d.addEventListener('close', () => { d.remove(); resolve(answer); });
    document.body.append(d);
    d.showModal();
  });
}

// Várias fotos de uma vez: liga cada arquivo ao produto de mesmo nome, mostra a
// lista para conferir e só então envia, uma por uma.
function bulkDialog(files, products, rerender) {
  const { matches, unmatched } = matchFilesToItems(files, products);
  const replacing = matches.filter((m) => m.item.image_url).length;
  const progress = h('p', { class: 'adm-help', role: 'status', id: 'bulk-progress' });
  const okBtn = h('button', { class: 'btn', type: 'button', id: 'bulk-ok', disabled: !matches.length },
    matches.length === 1 ? 'Enviar 1 foto' : `Enviar ${matches.length} fotos`);
  let running = false;

  const d = h('dialog', { class: 'sheet adm-dialog', 'aria-labelledby': 'bulk-t' },
    h('div', { class: 'cart-head' },
      h('h2', { class: 'sheet-title', id: 'bulk-t' }, 'Conferir fotos'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', onclick: () => { if (!running) d.close(); } }, icon('close'))),
    h('div', { class: 'sheet-body' },
      matches.length
        ? h('p', {}, `${matches.length} ${matches.length === 1 ? 'foto combina' : 'fotos combinam'} com produtos do cardápio.`,
          replacing ? ` ${replacing} ${replacing === 1 ? 'vai substituir a foto atual' : 'vão substituir a foto atual'}.` : '')
        : h('p', { class: 'errors' }, 'Nenhum arquivo tem o nome de um produto. Renomeie as fotos com o nome do produto e tente de novo.'),
      matches.length ? h('ul', { class: 'adm-bulk-list', id: 'bulk-matches' }, matches.map((m) => h('li', { dataset: { name: m.item.name } },
        h('strong', {}, m.item.name), ' ← ', m.file.name, m.item.image_url ? h('small', { class: 'adm-help' }, ' (troca a foto atual)') : null))) : null,
      unmatched.length ? h('div', {},
        h('p', { class: 'adm-help' }, `Sem produto com esse nome (não ${unmatched.length === 1 ? 'será enviada' : 'serão enviadas'}):`),
        h('ul', { class: 'adm-bulk-list off', id: 'bulk-unmatched' }, unmatched.map((f) => h('li', {}, f.name)))) : null,
      progress),
    h('div', { class: 'sheet-foot' },
      h('button', { class: 'btn btn-ghost', type: 'button', id: 'bulk-cancel', onclick: () => { if (!running) d.close(); } }, 'Cancelar'),
      okBtn));

  okBtn.addEventListener('click', async () => {
    running = true;
    okBtn.disabled = true;
    d.querySelector('#bulk-cancel').textContent = 'Fechar';
    const failed = [];
    for (const [i, m] of matches.entries()) {
      progress.textContent = `Enviando ${i + 1} de ${matches.length}: ${m.item.name}…`;
      let url;
      try {
        url = await uploadImage(m.file);
        await savePhoto(m.item, url);
      } catch (e) {
        if (url) removeUnusedImages([url]);
        failed.push(`${m.item.name}: ${imageErrorMessage(e)}`);
      }
    }
    running = false;
    const ok = matches.length - failed.length;
    rerender();
    if (!failed.length) {
      d.close();
      notify(ok === 1 ? '1 foto salva.' : `${ok} fotos salvas.`);
      return;
    }
    clear(progress);
    add(progress, `${ok} ${ok === 1 ? 'foto salva' : 'fotos salvas'}. Não deu certo:`, h('ul', {}, failed.map((t) => h('li', {}, t))));
  });
  // Não deixa fechar no meio do envio (Esc), para não parecer que parou
  d.addEventListener('cancel', (e) => { if (running) e.preventDefault(); });
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}
