import { h, clear, add } from '../lib/dom.js';
import { supabase } from '../lib/supabase.js';
import { matchesSearch, matchImageFiles, suggestImageAlt } from '../lib/text.js';
import { icon } from '../lib/icons.js';
import {
  IMAGE_ACCEPT, GROUPS, groupLabel, processImage, previewImage, addToLibrary, setProductImage,
  deleteLibraryImage, imageErrorMessage,
} from './images.js';
import { friendlyDbError } from './fields.js';
import { notify } from './ui.js';

// Aba "Imagens": a foto de cada produto (trocar, ver, remover, texto alternativo),
// envio de várias fotos de uma vez com associação pelo nome do arquivo e a
// Biblioteca de Imagens, com tudo o que já foi enviado. Uma foto trocada não é
// apagada: fica na biblioteca como "sem produto" até alguém excluir de propósito.

const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export async function photosView() {
  const [prods, cats, lib] = await Promise.all([
    supabase.from('products').select('id, name, slug, kind, image_url, image_thumb_url, image_alt, available, category_id, sort_order').order('sort_order').order('name'),
    supabase.from('categories').select('id, name, group_type, sort_order').order('sort_order').order('name'),
    supabase.from('media_images').select('*').order('created_at', { ascending: false }),
  ]);
  for (const r of [prods, cats, lib]) if (r.error) throw r.error;
  const products = prods.data;
  const categories = cats.data;
  const media = lib.data;
  const catById = new Map(categories.map((c) => [c.id, c]));
  const groupOf = (p) => catById.get(p.category_id)?.group_type || 'outros';
  const altSuggestion = (p) => suggestImageAlt(p.name, { kind: p.kind, groupType: groupOf(p) });
  const usedBy = (m) => products.filter((p) => p.image_url === m.url);
  const mediaByUrl = () => new Map(media.map((m) => [m.url, m]));
  const ctx = { products, categories, media, catById, groupOf, altSuggestion, usedBy, mediaByUrl, rerender: () => render() };

  let mode = 'produtos';
  let group = '';
  const search = h('input', { class: 'input', type: 'search', id: 'photo-search', placeholder: 'Buscar pelo nome', 'aria-label': 'Buscar pelo nome' });
  const groupSel = h('select', { class: 'input', id: 'photo-group', 'aria-label': 'Filtrar por tipo' },
    h('option', { value: '' }, 'Todos os tipos'), GROUPS.map(([k, label]) => h('option', { value: k }, label)));
  const onlyMissing = h('input', { type: 'checkbox', id: 'photo-missing' });
  const onlyNoAlt = h('input', { type: 'checkbox', id: 'photo-noalt' });
  const onlyOrphans = h('input', { type: 'checkbox', id: 'lib-orphans' });
  const summary = h('p', { class: 'adm-help', id: 'photo-summary', role: 'status' });
  const list = h('div', { class: 'adm-photo-groups' });
  const tabProducts = h('button', { type: 'button', class: 'adm-seg', id: 'seg-produtos', 'aria-pressed': 'true', onclick: () => { mode = 'produtos'; render(); } });
  const tabLibrary = h('button', { type: 'button', class: 'adm-seg', id: 'seg-biblioteca', 'aria-pressed': 'false', onclick: () => { mode = 'biblioteca'; render(); } });
  const productFilters = h('span', { class: 'adm-photo-checks' },
    h('label', { class: 'adm-check inline', for: onlyMissing.id }, onlyMissing, 'Só sem imagem'),
    h('label', { class: 'adm-check inline', for: onlyNoAlt.id }, onlyNoAlt, 'Só sem texto alternativo'));
  const libraryFilters = h('span', { class: 'adm-photo-checks', hidden: true },
    h('label', { class: 'adm-check inline', for: onlyOrphans.id }, onlyOrphans, 'Só imagens sem produto'));

  const bulkInput = h('input', { type: 'file', accept: IMAGE_ACCEPT, multiple: true, class: 'sr-only', id: 'photo-bulk' });
  bulkInput.addEventListener('change', () => {
    const files = [...bulkInput.files];
    bulkInput.value = '';
    if (files.length) bulkDialog(files, ctx);
  });

  function render() {
    tabProducts.setAttribute('aria-pressed', String(mode === 'produtos'));
    tabLibrary.setAttribute('aria-pressed', String(mode === 'biblioteca'));
    const withImage = products.filter((p) => p.image_url).length;
    const noAlt = products.filter((p) => p.image_url && !p.image_alt).length;
    const orphans = media.filter((m) => !usedBy(m).length).length;
    tabProducts.textContent = `Produtos (${products.length})`;
    tabLibrary.textContent = `Biblioteca de Imagens (${media.length})`;
    productFilters.hidden = mode !== 'produtos';
    libraryFilters.hidden = mode !== 'biblioteca';
    group = groupSel.value;
    clear(list);
    if (mode === 'produtos') {
      summary.textContent = `${withImage} de ${products.length} produtos com imagem.${noAlt ? ` ${plural(noAlt, 'imagem está', 'imagens estão')} sem texto alternativo.` : ''}`;
      renderProducts();
    } else {
      summary.textContent = `${plural(media.length, 'imagem', 'imagens')} na biblioteca.${orphans ? ` ${plural(orphans, 'está', 'estão')} sem produto.` : ''}`;
      renderLibrary();
    }
  }

  function renderProducts() {
    let shown = 0;
    for (const cat of categories) {
      if (group && cat.group_type !== group) continue;
      const items = products.filter((p) => p.category_id === cat.id
        && matchesSearch(search.value, p.name)
        && (!onlyMissing.checked || !p.image_url)
        && (!onlyNoAlt.checked || (p.image_url && !p.image_alt)));
      if (!items.length) continue;
      shown += items.length;
      list.append(h('section', { class: 'adm-photo-group' },
        h('h3', {}, cat.name, h('small', { class: 'adm-group-tag' }, groupLabel(cat.group_type))),
        h('ul', { class: 'adm-photo-grid' }, items.map((p) => productTile(p, ctx)))));
    }
    if (!shown) list.append(h('p', { class: 'adm-empty' }, onlyMissing.checked && !search.value ? 'Todos os produtos já têm imagem.' : 'Nenhum produto encontrado.'));
  }

  function renderLibrary() {
    const items = media.filter((m) => {
      const users = usedBy(m);
      const g = users.length ? groupOf(users[0]) : m.group_type;
      return (!group || g === group)
        && (!onlyOrphans.checked || !users.length)
        && matchesSearch(search.value, m.original_name, m.alt, ...users.map((p) => p.name));
    });
    if (!media.length) {
      list.append(h('p', { class: 'adm-empty' }, 'A biblioteca ainda está vazia. As imagens enviadas aqui ou na lista de produtos aparecem nesta seção.'));
      return;
    }
    for (const [key, label] of GROUPS) {
      const inGroup = items.filter((m) => { const u = usedBy(m); return (u.length ? groupOf(u[0]) : m.group_type) === key; });
      if (!inGroup.length) continue;
      list.append(h('section', { class: 'adm-photo-group' },
        h('h3', {}, label, h('small', { class: 'adm-group-tag' }, plural(inGroup.length, 'imagem', 'imagens'))),
        h('ul', { class: 'adm-photo-grid' }, inGroup.map((m) => libraryTile(m, ctx)))));
    }
    if (!items.length) list.append(h('p', { class: 'adm-empty' }, onlyOrphans.checked ? 'Todas as imagens estão em algum produto.' : 'Nenhuma imagem encontrada.'));
  }

  search.addEventListener('input', render);
  groupSel.addEventListener('change', render);
  for (const c of [onlyMissing, onlyNoAlt, onlyOrphans]) c.addEventListener('change', render);
  render();

  const el = h('section', { class: 'adm-card adm-photos' },
    h('div', { class: 'adm-card-head' },
      h('div', {},
        h('h2', {}, 'Imagens'),
        h('p', { class: 'adm-help' }, 'Troque a imagem de cada produto pelo celular ou pelo computador. Antes de salvar você vê como ficou. As fotos são reduzidas e convertidas para WebP sozinhas, com miniatura para o cardápio abrir rápido.')),
      h('label', { class: 'btn', for: bulkInput.id, id: 'bulk-open' }, icon('plus'), ' Adicionar várias imagens')),
    bulkInput,
    h('div', { class: 'adm-segs', role: 'group', 'aria-label': 'Ver' }, tabProducts, tabLibrary),
    h('div', { class: 'adm-photo-tools' }, search, groupSel, productFilters, libraryFilters),
    summary,
    list);
  return { el };
}

// ---------------------------------------------------------------- produto
function productTile(p, ctx) {
  const input = h('input', { type: 'file', accept: IMAGE_ACCEPT, class: 'sr-only', id: `photo-${p.id}` });
  const status = h('small', { class: 'adm-help', role: 'status' });
  input.addEventListener('change', () => {
    const f = input.files[0];
    input.value = '';
    if (f) replaceDialog(p, f, ctx);
  });

  const alt = h('input', { class: 'input sm', id: `alt-${p.id}`, maxlength: 200, value: p.image_alt || '', placeholder: ctx.altSuggestion(p), 'aria-label': `Texto alternativo da imagem de ${p.name}` });
  const altSave = h('button', { class: 'btn btn-ghost sm', type: 'submit', hidden: true }, 'Salvar');
  const altForm = h('form', { class: 'adm-alt', onsubmit: async (e) => {
    e.preventDefault();
    altSave.disabled = true;
    try {
      const v = alt.value.trim() || null;
      const { error } = await supabase.from('products').update({ image_alt: v }).eq('id', p.id).select('id').single();
      if (error) throw error;
      p.image_alt = v;
      altSave.hidden = true;
      status.textContent = 'Texto alternativo salvo.';
      ctx.rerender();
    } catch (err) {
      status.textContent = friendlyDbError(err);
    } finally { altSave.disabled = false; }
  } }, h('label', { class: 'adm-alt-label', for: alt.id }, 'Texto alternativo (SEO)'), h('div', { class: 'adm-alt-row' }, alt, altSave));
  alt.addEventListener('input', () => { altSave.hidden = alt.value.trim() === (p.image_alt || ''); });

  async function remove() {
    if (!(await confirm('Remover imagem?', `“${p.name}” vai aparecer no cardápio sem imagem. A foto continua guardada na Biblioteca de Imagens.`, 'Remover'))) return;
    li.classList.add('busy');
    try { await setProductImage(p, null); } catch (e) { li.classList.remove('busy'); status.textContent = friendlyDbError(e); return; }
    notify(`Imagem de “${p.name}” removida.`);
    ctx.rerender();
  }

  const src = p.image_thumb_url || p.image_url;
  const li = h('li', { class: `adm-photo${p.available ? '' : ' off'}`, dataset: { name: p.name } },
    src
      ? h('button', { type: 'button', class: 'adm-photo-view', 'aria-label': `Visualizar imagem de ${p.name}`, onclick: () => viewDialog({ url: p.image_url, alt: p.image_alt || ctx.altSuggestion(p), title: p.name, media: ctx.mediaByUrl().get(p.image_url) }) },
        h('img', { class: 'adm-photo-img', src, alt: p.image_alt || ctx.altSuggestion(p), loading: 'lazy', decoding: 'async', width: 150, height: 150 }))
      : h('div', { class: 'adm-photo-img empty' }, 'Sem imagem'),
    h('strong', { class: 'adm-photo-name' }, p.name),
    h('div', { class: 'adm-tags' },
      p.available ? null : h('span', { class: 'tag-muted' }, 'Indisponível'),
      !p.image_url ? h('span', { class: 'tag-warn' }, 'Sem imagem') : null,
      p.image_url && !p.image_alt ? h('span', { class: 'tag-warn' }, 'Sem texto alternativo') : null),
    h('div', { class: 'adm-photo-actions' },
      h('label', { class: 'btn btn-ghost', for: input.id }, p.image_url ? 'Trocar imagem' : 'Adicionar imagem'),
      p.image_url ? h('button', { class: 'link-btn', type: 'button', onclick: () => viewDialog({ url: p.image_url, alt: p.image_alt || ctx.altSuggestion(p), title: p.name, media: ctx.mediaByUrl().get(p.image_url) }) }, 'Visualizar') : null,
      ctx.media.length ? h('button', { class: 'link-btn', type: 'button', onclick: () => pickFromLibrary(p, ctx) }, 'Da biblioteca') : null,
      p.image_url ? h('button', { class: 'link-btn danger', type: 'button', 'aria-label': `Remover imagem de ${p.name}`, onclick: remove }, 'Remover') : null),
    p.image_url ? altForm : null,
    input, status);
  return li;
}

// Trocar a imagem de um produto: prévia lado a lado, texto alternativo e só grava ao confirmar.
function replaceDialog(p, file, ctx) {
  const ac = new AbortController();
  let running = false;
  let prepared = null;
  const newBox = h('div', { class: 'adm-compare-img' }, h('div', { class: 'adm-photo-img empty' }, 'Preparando…'));
  const info = h('p', { class: 'adm-help', id: 'rep-info' });
  const errors = h('p', { class: 'errors', role: 'alert', hidden: true });
  const alt = h('input', { class: 'input', id: 'rep-alt', maxlength: 200, value: p.image_alt || ctx.altSuggestion(p) });
  const bar = h('progress', { max: 100, value: 0, hidden: true, id: 'rep-progress' });
  const ok = h('button', { class: 'btn', type: 'button', id: 'rep-ok', disabled: true }, 'Salvar imagem');
  const cancel = h('button', { class: 'btn btn-ghost', type: 'button', id: 'rep-cancel' }, 'Cancelar');

  const d = h('dialog', { class: 'sheet adm-dialog', 'aria-labelledby': 'rep-t' },
    h('div', { class: 'cart-head' },
      h('h2', { class: 'sheet-title', id: 'rep-t' }, `${p.image_url ? 'Trocar' : 'Adicionar'} imagem: ${p.name}`),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', onclick: () => cancel.click() }, icon('close'))),
    h('div', { class: 'sheet-body' },
      h('div', { class: 'adm-compare' },
        p.image_url ? h('figure', {}, h('img', { class: 'adm-photo-img', src: p.image_thumb_url || p.image_url, alt: 'Imagem atual' }), h('figcaption', {}, 'Atual')) : null,
        h('figure', {}, newBox, h('figcaption', {}, 'Nova'))),
      info,
      h('label', { class: 'field-label', for: alt.id }, 'Texto alternativo (descreve a foto para o Google e para leitores de tela)'),
      alt,
      bar, errors),
    h('div', { class: 'sheet-foot' }, cancel, ok));

  cancel.addEventListener('click', () => { if (running) ac.abort(); else d.close(); });
  d.addEventListener('cancel', (e) => { if (running) { e.preventDefault(); ac.abort(); } });
  d.addEventListener('close', () => d.remove());

  processImage(file).then((img) => {
    prepared = img;
    clear(newBox).append(h('img', { class: 'adm-photo-img', src: img.preview, alt: 'Prévia da nova imagem', id: 'rep-preview' }));
    info.textContent = `${file.name}: ${img.original.width}×${img.original.height} px, ${kb(img.original.size)} → ${img.main.width}×${img.main.height} px, ${kb(img.main.blob.size)} (${img.main.blob.type === 'image/webp' ? 'WebP' : 'JPG'}), com miniatura de ${kb(img.thumb.blob.size)}.`;
    ok.disabled = false;
  }).catch((e) => {
    clear(newBox).append(h('div', { class: 'adm-photo-img empty' }, 'Arquivo recusado'));
    errors.hidden = false;
    errors.textContent = imageErrorMessage(e);
  });

  ok.addEventListener('click', async () => {
    running = true;
    ok.disabled = true;
    alt.disabled = true;
    errors.hidden = true;
    bar.hidden = false;
    cancel.textContent = 'Cancelar envio';
    let saved = null;
    try {
      saved = await addToLibrary(file, {
        prepared, baseName: p.slug || p.name, alt: alt.value.trim() || null, group: ctx.groupOf(p), signal: ac.signal,
        onStep: (step, f) => { bar.value = Math.round(f * 100); },
      });
      ctx.media.unshift(saved);
      await setProductImage(p, saved, alt.value.trim() || null);
    } catch (e) {
      running = false;
      ok.disabled = false;
      alt.disabled = false;
      cancel.textContent = 'Cancelar';
      bar.hidden = true;
      errors.hidden = false;
      errors.textContent = saved
        ? `A imagem foi guardada na biblioteca, mas não foi ligada ao produto: ${imageErrorMessage(e)}`
        : imageErrorMessage(e);
      ctx.rerender();
      return;
    }
    running = false;
    d.close();
    notify(`Imagem de “${p.name}” salva.`);
    ctx.rerender();
  });

  document.body.append(d);
  d.showModal();
}

// Escolher uma imagem que já está na biblioteca para o produto
function pickFromLibrary(p, ctx) {
  let chosen = null;
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Buscar na biblioteca', 'aria-label': 'Buscar na biblioteca', id: 'pick-search' });
  const grid = h('ul', { class: 'adm-photo-grid adm-pick' });
  const ok = h('button', { class: 'btn', type: 'button', id: 'pick-ok', disabled: true }, 'Usar esta imagem');
  const draw = () => {
    clear(grid);
    for (const m of ctx.media.filter((x) => matchesSearch(search.value, x.original_name, x.alt, ...ctx.usedBy(x).map((u) => u.name)))) {
      const users = ctx.usedBy(m);
      grid.append(h('li', {},
        h('button', { type: 'button', class: `adm-pick-item${chosen === m ? ' on' : ''}`, 'aria-pressed': String(chosen === m), onclick: () => { chosen = m; ok.disabled = false; draw(); } },
          h('img', { class: 'adm-photo-img', src: m.thumb_url || m.url, alt: m.alt || m.original_name || 'Imagem da biblioteca', loading: 'lazy' }),
          h('small', {}, m.original_name || m.path),
          h('small', { class: 'adm-help' }, users.length ? `Em: ${users.map((u) => u.name).join(', ')}` : 'Sem produto'))));
    }
  };
  search.addEventListener('input', draw);
  draw();
  const d = h('dialog', { class: 'sheet adm-dialog wide', 'aria-labelledby': 'pick-t' },
    h('div', { class: 'cart-head' },
      h('h2', { class: 'sheet-title', id: 'pick-t' }, `Imagem da biblioteca para ${p.name}`),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', onclick: () => d.close() }, icon('close'))),
    h('div', { class: 'sheet-body' }, search, grid),
    h('div', { class: 'sheet-foot' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => d.close() }, 'Cancelar'), ok));
  ok.addEventListener('click', async () => {
    ok.disabled = true;
    try {
      await setProductImage(p, chosen, p.image_alt || chosen.alt || null);
    } catch (e) { ok.disabled = false; notify(friendlyDbError(e), 'error'); return; }
    d.close();
    notify(`Imagem de “${p.name}” salva.`);
    ctx.rerender();
  });
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}

// ---------------------------------------------------------------- biblioteca
function libraryTile(m, ctx) {
  const users = ctx.usedBy(m);
  const status = h('small', { class: 'adm-help', role: 'status' });
  const input = h('input', { type: 'file', accept: IMAGE_ACCEPT, class: 'sr-only', id: `lib-${m.id}` });
  input.addEventListener('change', async () => {
    const f = input.files[0];
    input.value = '';
    if (!f) return;
    // Substituir: a nova vai para os mesmos produtos; a antiga continua na biblioteca
    li.classList.add('busy');
    status.textContent = 'Enviando…';
    try {
      const saved = await addToLibrary(f, { baseName: users[0]?.slug || f.name.replace(/\.[a-z0-9]+$/i, ''), alt: m.alt, group: users.length ? ctx.groupOf(users[0]) : m.group_type });
      ctx.media.unshift(saved);
      for (const p of users) await setProductImage(p, saved);
    } catch (e) {
      li.classList.remove('busy');
      status.textContent = imageErrorMessage(e);
      ctx.rerender();
      return;
    }
    notify(users.length ? `Imagem substituída em ${plural(users.length, 'produto', 'produtos')}.` : 'Nova imagem guardada na biblioteca.');
    ctx.rerender();
  });

  async function remove() {
    if (!(await confirm('Excluir imagem da biblioteca?', `“${m.original_name || m.path}” será apagada de vez. Nenhum produto usa esta imagem.`, 'Excluir'))) return;
    li.classList.add('busy');
    try {
      await deleteLibraryImage(m);
    } catch (e) { li.classList.remove('busy'); status.textContent = imageErrorMessage(e); return; }
    ctx.media.splice(ctx.media.indexOf(m), 1);
    notify('Imagem excluída.');
    ctx.rerender();
  }

  const groupSel = users.length ? null : h('select', { class: 'input sm', 'aria-label': `Tipo da imagem ${m.original_name || ''}`, onchange: async (e) => {
    const { error } = await supabase.from('media_images').update({ group_type: e.target.value }).eq('id', m.id);
    if (error) { status.textContent = friendlyDbError(error); return; }
    m.group_type = e.target.value;
    ctx.rerender();
  } }, GROUPS.map(([k, label]) => h('option', { value: k, selected: m.group_type === k }, label)));

  const li = h('li', { class: 'adm-photo', dataset: { name: m.original_name || m.path } },
    h('button', { type: 'button', class: 'adm-photo-view', 'aria-label': `Visualizar ${m.original_name || 'imagem'}`, onclick: () => viewDialog({ url: m.url, alt: m.alt, title: m.original_name || 'Imagem', media: m }) },
      h('img', { class: 'adm-photo-img', src: m.thumb_url || m.url, alt: m.alt || `Imagem ${m.original_name || ''}`.trim(), loading: 'lazy', decoding: 'async', width: 150, height: 150 })),
    h('strong', { class: 'adm-photo-name' }, m.original_name || m.path),
    h('small', { class: 'adm-help' }, [m.width && m.height ? `${m.width}×${m.height}` : null, m.bytes ? kb(m.bytes) : null].filter(Boolean).join(' · ')),
    users.length
      ? h('small', { class: 'adm-help' }, `Em: ${users.map((u) => u.name).join(', ')}`)
      : h('div', { class: 'adm-tags' }, h('span', { class: 'tag-warn' }, 'Sem produto')),
    groupSel,
    h('div', { class: 'adm-photo-actions' },
      h('button', { class: 'link-btn', type: 'button', onclick: () => assignDialog(m, ctx) }, users.length ? 'Usar em outro' : 'Associar'),
      h('label', { class: 'link-btn', for: input.id }, 'Substituir'),
      users.length ? null : h('button', { class: 'link-btn danger', type: 'button', onclick: remove }, 'Excluir')),
    input, status);
  return li;
}

// Associar uma imagem da biblioteca a um produto (manual; avisa se vai trocar a atual)
function assignDialog(m, ctx) {
  const sel = h('select', { class: 'input', id: 'assign-product' },
    h('option', { value: '' }, '— Escolha o produto —'),
    ctx.categories.map((c) => h('optgroup', { label: c.name },
      ctx.products.filter((p) => p.category_id === c.id).map((p) => h('option', { value: p.id }, p.name)))));
  const warn = h('p', { class: 'adm-help', id: 'assign-warn' });
  const ok = h('button', { class: 'btn', type: 'button', id: 'assign-ok', disabled: true }, 'Associar');
  sel.addEventListener('change', () => {
    const p = ctx.products.find((x) => x.id === sel.value);
    ok.disabled = !p || p.image_url === m.url;
    warn.textContent = !p ? '' : p.image_url === m.url ? 'Este produto já usa esta imagem.' : p.image_url ? `“${p.name}” já tem imagem. Ela será trocada por esta e continuará na biblioteca.` : '';
  });
  const d = h('dialog', { class: 'sheet adm-dialog', 'aria-labelledby': 'assign-t' },
    h('div', { class: 'cart-head' },
      h('h2', { class: 'sheet-title', id: 'assign-t' }, 'Associar imagem a um produto'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', onclick: () => d.close() }, icon('close'))),
    h('div', { class: 'sheet-body' },
      h('img', { class: 'adm-photo-img adm-assign-img', src: m.thumb_url || m.url, alt: m.alt || 'Imagem escolhida' }),
      h('label', { class: 'field-label', for: sel.id }, 'Produto'), sel, warn),
    h('div', { class: 'sheet-foot' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => d.close() }, 'Cancelar'), ok));
  ok.addEventListener('click', async () => {
    const p = ctx.products.find((x) => x.id === sel.value);
    ok.disabled = true;
    try { await setProductImage(p, m, p.image_alt || m.alt || null); } catch (e) { ok.disabled = false; warn.textContent = friendlyDbError(e); return; }
    d.close();
    notify(`Imagem associada a “${p.name}”.`);
    ctx.rerender();
  });
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}

// ---------------------------------------------------------------- comum
function viewDialog({ url, alt, title, media }) {
  const d = h('dialog', { class: 'sheet adm-dialog wide adm-viewer', 'aria-labelledby': 'view-t' },
    h('div', { class: 'cart-head' },
      h('h2', { class: 'sheet-title', id: 'view-t' }, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', onclick: () => d.close() }, icon('close'))),
    h('div', { class: 'sheet-body' },
      h('img', { src: url, alt: alt || title, id: 'view-img' }),
      h('p', { class: 'adm-help' }, alt ? `Texto alternativo: ${alt}` : 'Sem texto alternativo.'),
      media ? h('p', { class: 'adm-help' }, [media.original_name, media.width && `${media.width}×${media.height} px`, media.bytes && kb(media.bytes)].filter(Boolean).join(' · ')) : null,
      h('p', {}, h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir em tamanho real'))),
    h('div', { class: 'sheet-foot' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => d.close() }, 'Fechar')));
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}

function confirm(title, text, action) {
  return new Promise((resolve) => {
    let answer = false;
    const d = h('dialog', { class: 'sheet adm-confirm', role: 'alertdialog', 'aria-labelledby': 'rm-t' },
      h('div', { class: 'sheet-body' }, h('h2', { class: 'sheet-title', id: 'rm-t' }, title), h('p', {}, text)),
      h('div', { class: 'sheet-foot' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => d.close() }, 'Cancelar'),
        h('button', { class: 'btn btn-danger', type: 'button', id: 'rm-ok', onclick: () => { answer = true; d.close(); } }, action)));
    d.addEventListener('close', () => { d.remove(); resolve(answer); });
    document.body.append(d);
    d.showModal();
  });
}

// ---------------------------------------------------------------- várias imagens
const LIBRARY_ONLY = '__biblioteca__';
const STATUS_TEXT = {
  exact: ['ok', 'Nome igual ao do produto'],
  partial: ['warn', 'Nome parecido: confira'],
  ambiguous: ['warn', 'Mais de um produto possível: escolha'],
  none: ['muted', 'Nenhum produto com esse nome'],
};

// Lista para conferir antes de enviar: prévia, nome do arquivo, produto sugerido
// (pode trocar), aviso de troca, progresso e resultado de cada imagem.
function bulkDialog(files, ctx) {
  const rows = matchImageFiles(files, ctx.products).map((r, i) => ({
    ...r, i, state: 'pronta', error: null,
    choice: r.item ? r.item.id : r.status === 'none' ? LIBRARY_ONLY : '',
  }));
  const ac = new AbortController();
  let running = false;
  let finished = false;

  const listEl = h('ul', { class: 'adm-bulk', id: 'bulk-rows' });
  const note = h('p', { class: 'adm-help', id: 'bulk-note', role: 'status' });
  const ok = h('button', { class: 'btn', type: 'button', id: 'bulk-ok' });
  const cancel = h('button', { class: 'btn btn-ghost', type: 'button', id: 'bulk-cancel' }, 'Cancelar');

  const productOptions = () => [
    h('option', { value: '' }, '— Escolha o produto —'),
    h('option', { value: LIBRARY_ONLY }, 'Só guardar na biblioteca'),
    ctx.categories.map((c) => h('optgroup', { label: c.name },
      ctx.products.filter((p) => p.category_id === c.id).map((p) => h('option', { value: p.id }, p.name)))),
  ];

  const active = () => rows.filter((r) => r.state !== 'removida' && r.state !== 'recusada');
  const dupes = () => {
    const seen = new Map();
    for (const r of active()) if (r.choice && r.choice !== LIBRARY_ONLY) seen.set(r.choice, (seen.get(r.choice) || 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([id]) => id));
  };

  function refresh() {
    const list = active();
    const pending = list.filter((r) => !r.choice).length;
    const dup = dupes();
    const toProduct = list.filter((r) => r.choice && r.choice !== LIBRARY_ONLY).length;
    const toLibrary = list.filter((r) => r.choice === LIBRARY_ONLY).length;
    const replacing = list.filter((r) => ctx.products.find((p) => p.id === r.choice)?.image_url).length;
    for (const r of rows) r.el?.classList.toggle('dup', !!r.choice && dup.has(r.choice));
    if (!finished) {
      ok.textContent = list.length === 1 ? 'Enviar 1 imagem' : `Enviar ${list.length} imagens`;
      ok.disabled = running || !list.length || pending > 0 || dup.size > 0;
      note.textContent = [
        `${plural(toProduct, 'imagem vai', 'imagens vão')} para produtos`,
        toLibrary ? `${plural(toLibrary, 'fica', 'ficam')} só na biblioteca` : null,
        replacing ? `${plural(replacing, 'troca', 'trocam')} uma imagem atual` : null,
        pending ? `${plural(pending, 'precisa', 'precisam')} que você escolha o produto` : null,
        dup.size ? 'dois arquivos estão no mesmo produto: escolha só um' : null,
      ].filter(Boolean).join(' · ') + '.';
    }
  }

  function rowEl(r) {
    const [kind, text] = STATUS_TEXT[r.status];
    const sel = h('select', { class: 'input sm', 'aria-label': `Produto para ${r.file.name}`, dataset: { file: r.file.name } }, productOptions());
    sel.value = r.choice;
    const current = h('div', { class: 'adm-bulk-current' });
    const showCurrent = () => {
      const p = ctx.products.find((x) => x.id === sel.value);
      clear(current);
      if (p?.image_url) add(current, h('img', { src: p.image_thumb_url || p.image_url, alt: '', width: 32, height: 32 }), h('small', {}, 'Troca a imagem atual'));
    };
    sel.addEventListener('change', () => { r.choice = sel.value; showCurrent(); refresh(); });
    showCurrent();
    const thumb = h('div', { class: 'adm-bulk-thumb' }, '…');
    const bar = h('progress', { max: 100, value: 0, hidden: true });
    const state = h('small', { class: 'adm-bulk-state' }, r.duplicate ? 'Outro arquivo tem o mesmo nome' : '');
    const removeBtn = h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': `Tirar ${r.file.name} da lista`, onclick: () => { r.state = 'removida'; r.el.remove(); refresh(); } }, icon('close'));
    r.ui = { sel, bar, state, thumb, removeBtn };
    r.el = h('li', { class: 'adm-bulk-row', dataset: { file: r.file.name } },
      thumb,
      h('div', { class: 'adm-bulk-main' },
        h('strong', { class: 'adm-bulk-name' }, r.file.name),
        h('small', { class: `adm-match ${kind}` }, `${text} · ${kb(r.file.size)}`),
        sel, current, bar, state),
      removeBtn);
    previewImage(r.file).then(({ preview }) => {
      clear(thumb).append(h('img', { src: preview, alt: `Prévia de ${r.file.name}` }));
    }).catch((e) => {
      r.state = 'recusada';
      clear(thumb).append(icon('close'));
      r.el.classList.add('error');
      sel.disabled = true;
      state.textContent = imageErrorMessage(e);
      refresh();
    });
    return r.el;
  }
  rows.forEach((r) => listEl.append(rowEl(r)));

  const d = h('dialog', { class: 'sheet adm-dialog wide', 'aria-labelledby': 'bulk-t' },
    h('div', { class: 'cart-head' },
      h('h2', { class: 'sheet-title', id: 'bulk-t' }, `Conferir ${plural(files.length, 'imagem', 'imagens')}`),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', onclick: () => cancel.click() }, icon('close'))),
    h('div', { class: 'sheet-body' },
      h('p', { class: 'adm-help' }, 'Cada imagem foi ligada ao produto de mesmo nome. Confira, troque o produto se precisar e só então envie. Nada é gravado antes de você tocar em “Enviar”.'),
      listEl, note),
    h('div', { class: 'sheet-foot' }, cancel, ok));

  cancel.addEventListener('click', () => {
    if (running) { ac.abort(); cancel.disabled = true; cancel.textContent = 'Cancelando…'; } else d.close();
  });
  d.addEventListener('cancel', (e) => { if (running) { e.preventDefault(); ac.abort(); } });
  d.addEventListener('close', () => { d.remove(); if (finished) ctx.rerender(); });

  ok.addEventListener('click', async () => {
    running = true;
    refresh();
    cancel.textContent = 'Cancelar envios';
    for (const r of active()) { r.ui.sel.disabled = true; r.ui.removeBtn.disabled = true; r.ui.state.textContent = 'Na fila'; }
    let okCount = 0;
    let failed = 0;
    let canceled = 0;
    for (const r of active()) {
      if (ac.signal.aborted) { r.ui.state.textContent = 'Cancelado (não enviado)'; canceled++; continue; }
      const product = ctx.products.find((p) => p.id === r.choice) || null;
      r.ui.bar.hidden = false;
      r.el.classList.add('sending');
      let saved = null;
      try {
        saved = await addToLibrary(r.file, {
          baseName: product ? product.slug || product.name : r.file.name.replace(/\.[a-z0-9]+$/i, ''),
          alt: product ? product.image_alt || ctx.altSuggestion(product) : null,
          group: product ? ctx.groupOf(product) : 'outros',
          signal: ac.signal,
          onStep: (step, f) => {
            r.ui.bar.value = Math.round(f * 100);
            r.ui.state.textContent = { preparando: 'Otimizando…', enviando: `Enviando ${Math.round(f * 100)}%`, registrando: 'Salvando…' }[step];
          },
        });
        ctx.media.unshift(saved);
        if (product) await setProductImage(product, saved, product.image_alt || ctx.altSuggestion(product));
        r.ui.state.textContent = product ? `Salva em ${product.name}` : 'Guardada na biblioteca';
        r.el.classList.add('done');
        okCount++;
      } catch (e) {
        if (e?.name === 'AbortError') { r.ui.state.textContent = 'Cancelado (não enviado)'; canceled++; } else {
          r.ui.state.textContent = saved ? `Guardada na biblioteca, mas não ligada ao produto: ${imageErrorMessage(e)}` : `Erro: ${imageErrorMessage(e)}`;
          r.el.classList.add('error');
          failed++;
        }
      } finally {
        r.ui.bar.hidden = true;
        r.el.classList.remove('sending');
      }
    }
    running = false;
    finished = true;
    ok.hidden = true;
    cancel.disabled = false;
    cancel.textContent = 'Fechar';
    note.textContent = [`${plural(okCount, 'imagem salva', 'imagens salvas')}`, failed ? `${plural(failed, 'com erro', 'com erro')}` : null, canceled ? `${plural(canceled, 'cancelada', 'canceladas')}` : null].filter(Boolean).join(' · ') + '.';
    if (!failed && !canceled) notify(`${plural(okCount, 'imagem salva', 'imagens salvas')}.`);
  });

  refresh();
  document.body.append(d);
  d.showModal();
}
