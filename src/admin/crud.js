import { h, clear, add } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { supabase } from '../lib/supabase.js';
import { parseField, displayValue, renderField, friendlyDbError } from './fields.js';
import { notify } from './ui.js';
import { BUCKET, shrinkImage, removeUnusedImages } from './images.js';

// URLs de imagem de um registro (image_url, logo_url…); as de fora do bucket são ignoradas depois
const imageUrls = (row) => Object.entries(row ?? {}).filter(([k, v]) => /_url$/.test(k) && v).map(([, v]) => v);

// Lista com criar/editar/excluir/ativar/ordenar para uma tabela.
// cfg: { table, title, intro, fields, columns, activeKey, orderKey, defaults,
//        links: [{ key, table, fk, other }], validate(values), onChange() }
export function crudView(cfg) {
  const root = h('section', { class: 'adm-card' });
  let rows = [];

  async function load() {
    let q = supabase.from(cfg.table).select('*');
    if (cfg.orderKey) q = q.order(cfg.orderKey).order('created_at');
    else if (cfg.order) cfg.order.forEach(([col, asc = true]) => { q = q.order(col, { ascending: asc }); });
    const { data, error } = await q;
    if (error) { notify(friendlyDbError(error), 'error'); return; }
    rows = data;
    render();
  }

  function render() {
    clear(root);
    add(root,
      h('div', { class: 'adm-card-head' },
        h('div', {}, h('h2', {}, cfg.title), cfg.intro ? h('p', { class: 'adm-help' }, cfg.intro) : null),
        h('button', { class: 'btn', type: 'button', onclick: () => openForm(null) }, icon('plus'), 'Novo')),
      rows.length
        ? h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-table' },
          h('thead', {}, h('tr', {}, cfg.columns.map((c) => h('th', {}, c.label)), cfg.activeKey ? h('th', {}, 'Ativo') : null, h('th', { class: 'sr-only' }, 'Ações'))),
          h('tbody', {}, rows.map((row, i) => h('tr', { class: cfg.activeKey && !row[cfg.activeKey] ? 'off' : '' },
            cfg.columns.map((c) => h('td', { 'data-label': c.label }, c.render ? c.render(row) : row[c.key] ?? '—')),
            cfg.activeKey ? h('td', { 'data-label': 'Ativo' }, toggle(row)) : null,
            h('td', { class: 'adm-actions' },
              cfg.orderKey ? [
                h('button', { class: 'icon-btn sm', type: 'button', title: 'Subir', 'aria-label': 'Subir', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
                h('button', { class: 'icon-btn sm', type: 'button', title: 'Descer', 'aria-label': 'Descer', disabled: i === rows.length - 1, onclick: () => move(i, 1) }, '↓'),
              ] : null,
              h('button', { class: 'link-btn', type: 'button', onclick: () => openForm(row) }, 'Editar'),
              h('button', { class: 'link-btn danger', type: 'button', onclick: () => remove(row) }, 'Excluir')))))))
        : h('p', { class: 'adm-empty' }, 'Nada cadastrado ainda.'));
  }

  function toggle(row) {
    const cb = h('input', { type: 'checkbox', class: 'switch', checked: !!row[cfg.activeKey], 'aria-label': 'Ativo' });
    cb.addEventListener('change', async () => {
      const { error } = await supabase.from(cfg.table).update({ [cfg.activeKey]: cb.checked }).eq('id', row.id);
      if (error) { cb.checked = !cb.checked; notify(friendlyDbError(error), 'error'); return; }
      row[cfg.activeKey] = cb.checked;
      notify(cb.checked ? 'Ativado.' : 'Desativado.');
      render(); cfg.onChange?.();
    });
    return cb;
  }

  async function move(i, dir) {
    const list = [...rows];
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    // renumera 10, 20, 30… para manter a ordem estável
    const updates = list.map((r, idx) => ({ id: r.id, order: (idx + 1) * 10 })).filter((u, idx) => list[idx][cfg.orderKey] !== u.order);
    for (const u of updates) {
      const { error } = await supabase.from(cfg.table).update({ [cfg.orderKey]: u.order }).eq('id', u.id);
      if (error) { notify(friendlyDbError(error), 'error'); break; }
    }
    await load(); cfg.onChange?.();
  }

  async function remove(row) {
    const label = row.name ?? cfg.describe?.(row) ?? 'este item';
    if (!(await confirmDialog(`Excluir “${label}”?`, cfg.deleteWarning ?? 'Esta ação não pode ser desfeita.'))) return;
    const { error } = await supabase.from(cfg.table).delete().eq('id', row.id);
    if (error) return notify(friendlyDbError(error), 'error');
    notify('Excluído.');
    removeUnusedImages(imageUrls(row));
    await load(); cfg.onChange?.();
  }

  async function openForm(row) {
    const values = { ...(cfg.defaults?.() ?? {}), ...(row ?? {}) };
    // carrega ligações (ex.: adicionais do produto)
    for (const link of cfg.links ?? []) {
      if (!row) { values[link.key] = []; continue; }
      const { data, error } = await supabase.from(link.table).select(link.other).eq(link.fk, row.id);
      if (error) return notify(friendlyDbError(error), 'error');
      values[link.key] = data.map((d) => d[link.other]);
    }
    const fields = typeof cfg.fields === 'function' ? await cfg.fields() : cfg.fields;
    const controls = new Map();
    const uploaded = []; // fotos enviadas nesta janela; as que não forem salvas são apagadas
    const formBody = h('div', { class: 'adm-form' });
    const errorBox = h('p', { class: 'errors', role: 'alert', hidden: true });

    const refreshVisibility = () => {
      const current = collect(false).values;
      for (const f of fields) {
        if (f.show) controls.get(f.key).el.hidden = !f.show(current);
      }
    };
    for (const f of fields) {
      const c = renderField(f, f.type === 'multi' ? values[f.key] : displayValue(f, values[f.key]));
      controls.set(f.key, c);
      formBody.append(c.el);
      if (f.type === 'image') formBody.append(imageUploader(c, uploaded));
      c.control.addEventListener?.('change', refreshVisibility);
    }

    function collect(showErrors = true) {
      const out = {};
      let ok = true;
      for (const f of fields) {
        const c = controls.get(f.key);
        if (f.show && !f.show(out)) { out[f.key] = f.type === 'multi' ? [] : (f.type === 'bool' ? false : null); c.setError?.(''); continue; }
        const r = parseField(f, c.getValue());
        if (r.error) { ok = false; if (showErrors) c.setError(r.error); } else c.setError?.('');
        out[f.key] = r.value ?? null;
      }
      return { ok, values: out };
    }

    const dialog = h('dialog', { class: 'sheet adm-dialog', 'aria-labelledby': 'adm-form-title' },
      h('div', { class: 'cart-head' },
        h('h2', { class: 'sheet-title', id: 'adm-form-title' }, `${row ? 'Editar' : 'Novo'}: ${cfg.singular ?? cfg.title}`),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', onclick: () => dialog.close() }, icon('close'))),
      h('div', { class: 'sheet-body' }, formBody, errorBox),
      h('div', { class: 'sheet-foot' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => dialog.close() }, 'Cancelar'),
        h('button', { class: 'btn', type: 'button', id: 'adm-save', onclick: save }, 'Salvar')));

    async function save() {
      const { ok, values: v } = collect(true);
      let extraError = ok ? cfg.validate?.(v) : null;
      if (!ok || extraError) {
        errorBox.hidden = false;
        errorBox.textContent = extraError || 'Corrija os campos destacados.';
        return;
      }
      const payload = {};
      for (const f of fields) if (f.type !== 'multi' && !f.virtual) payload[f.key] = v[f.key];
      const btn = dialog.querySelector('#adm-save');
      btn.disabled = true;
      const q = row
        ? supabase.from(cfg.table).update(payload).eq('id', row.id).select().single()
        : supabase.from(cfg.table).insert(payload).select().single();
      const { data, error } = await q;
      if (error) { btn.disabled = false; errorBox.hidden = false; errorBox.textContent = friendlyDbError(error); return; }
      // sincroniza ligações (apaga as removidas, insere as novas)
      let linkError = null;
      for (const link of cfg.links ?? []) {
        const want = new Set(v[link.key]);
        const had = new Set(values[link.key]);
        const toDel = [...had].filter((x) => !want.has(x));
        const toAdd = [...want].filter((x) => !had.has(x));
        if (toDel.length) {
          const { error: e } = await supabase.from(link.table).delete().eq(link.fk, data.id).in(link.other, toDel);
          if (e) linkError ??= e;
        }
        if (toAdd.length) {
          const { error: e } = await supabase.from(link.table).insert(toAdd.map((x) => ({ [link.fk]: data.id, [link.other]: x })));
          if (e) linkError ??= e;
        }
      }
      // foto antiga trocada e fotos enviadas mas descartadas nesta janela
      const replaced = [...uploaded, ...imageUrls(row)];
      uploaded.length = 0;
      dialog.close();
      removeUnusedImages(replaced);
      // Erro nas ligações não pode ser escondido pelo "Salvo." (ex.: pizza sem tamanho some do cardápio)
      if (linkError) notify(`O cadastro foi salvo, mas as opções marcadas (tamanhos, sabores ou adicionais) não foram gravadas. Abra e salve de novo. ${friendlyDbError(linkError)}`, 'error');
      else notify('Salvo.');
      await load(); cfg.onChange?.();
    }

    dialog.addEventListener('close', () => { dialog.remove(); removeUnusedImages(uploaded); });
    document.body.append(dialog);
    refreshVisibility();
    dialog.showModal();
  }

  load();
  return { el: root, reload: load };
}

// Envio de imagem para o Storage (bucket menu-images). Só admins conseguem (RLS).
function imageUploader(urlControl, uploaded) {
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'sr-only', id: `up-${Math.random().toString(36).slice(2)}` });
  const status = h('small', { class: 'adm-help' });
  const preview = h('img', { class: 'adm-preview', alt: '', hidden: !urlControl.control.value });
  if (urlControl.control.value) preview.src = urlControl.control.value;
  urlControl.control.addEventListener('change', () => {
    preview.hidden = !/^https:\/\//.test(urlControl.control.value);
    if (!preview.hidden) preview.src = urlControl.control.value;
  });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    file.value = '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { status.textContent = 'Use JPG, PNG ou WEBP.'; return; }
    status.textContent = 'Preparando a imagem…';
    let blob;
    try { blob = await shrinkImage(f); } catch (e) { status.textContent = e.message; return; }
    if (blob.size > 2 * 1024 * 1024) { status.textContent = 'Mesmo reduzida, a imagem passou de 2 MB. Tente outra foto.'; return; }
    status.textContent = 'Enviando…';
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[blob.type];
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) { status.textContent = friendlyDbError(error); return; }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    uploaded.push(data.publicUrl);
    urlControl.control.value = data.publicUrl;
    urlControl.control.dispatchEvent(new Event('change'));
    status.textContent = 'Imagem enviada.';
  });
  return h('div', { class: 'adm-upload' },
    h('label', { class: 'btn btn-ghost', for: file.id }, 'Enviar imagem do computador'),
    file, status, preview);
}

export function confirmDialog(title, text) {
  return new Promise((resolve) => {
    let answer = false;
    const d = h('dialog', { class: 'sheet adm-confirm', role: 'alertdialog', 'aria-labelledby': 'cf-t' },
      h('div', { class: 'sheet-body' }, h('h2', { class: 'sheet-title', id: 'cf-t' }, title), h('p', {}, text)),
      h('div', { class: 'sheet-foot' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => d.close() }, 'Cancelar'),
        h('button', { class: 'btn btn-danger', type: 'button', id: 'cf-ok', onclick: () => { answer = true; d.close(); } }, 'Excluir')));
    d.addEventListener('close', () => { d.remove(); resolve(answer); });
    document.body.append(d);
    d.showModal();
  });
}
