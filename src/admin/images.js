import { supabase } from '../lib/supabase.js';
import { supabaseUrl, supabaseAnonKey } from '../lib/config.js';
import { slugify } from '../lib/text.js';
import { friendlyDbError } from './fields.js';

// Fotos do cardápio no Storage (bucket menu-images, limite de 2 MB por arquivo).
// Toda foto enviada passa por aqui: confere se o conteúdo é mesmo uma imagem,
// redesenha num canvas (o que descarta metadados e qualquer coisa escondida no
// arquivo), gera a versão principal e a miniatura em WebP e envia as duas.

export const BUCKET = 'menu-images';
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
// Alguns celulares mandam o arquivo sem tipo; a extensão ajuda o seletor a mostrar as fotos
export const IMAGE_ACCEPT = `${IMAGE_TYPES.join(',')},.jpg,.jpeg,.png,.webp,.avif`;
const MAX_INPUT = 25 * 1024 * 1024; // foto direto da câmera do celular
const MAX_UPLOAD = 2 * 1024 * 1024; // limite do bucket
const MAIN_SIDE = 1200; // px: nítida na tela do celular e no destaque do produto
const THUMB_SIDE = 400; // px: a miniatura do cardápio aparece com ~100 px (até 3x em telas densas)
const YEAR = 31536000; // nomes de arquivo nunca se repetem, então o navegador pode guardar por 1 ano

export const GROUPS = [
  ['pizzas_salgadas', 'Pizzas salgadas'],
  ['pizzas_doces', 'Pizzas doces'],
  ['bebidas', 'Bebidas'],
  ['combos', 'Combos'],
  ['adicionais', 'Adicionais'],
  ['outros', 'Outros produtos'],
];
export const groupLabel = (g) => (GROUPS.find(([k]) => k === g) || GROUPS.at(-1))[1];

// Problema com o arquivo escolhido (a mensagem já está pronta para mostrar)
export class ImageError extends Error {}
export const imageErrorMessage = (e) => {
  if (e instanceof ImageError) return e.message;
  if (e?.name === 'AbortError') return 'Envio cancelado.';
  return friendlyDbError(e);
};

// Tipo real pelo começo do arquivo ("assinatura"), sem confiar na extensão nem
// no tipo informado pelo navegador. Devolve null se não for JPG, PNG, WebP ou AVIF.
export function sniffImageType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const ascii = (from, to) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return 'image/png';
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 12 && ascii(4, 8) === 'ftyp') {
    // marca principal e compatíveis: avif (imagem) ou avis (sequência)
    const brands = [];
    for (let i = 8; i + 4 <= Math.min(b.length, 64); i += 4) if (i !== 12) brands.push(ascii(i, i + 4));
    if (brands.some((x) => x === 'avif' || x === 'avis')) return 'image/avif';
  }
  return null;
}

async function checkFile(file) {
  if (!file || !file.size) throw new ImageError(`“${file?.name ?? 'arquivo'}” está vazio.`);
  if (file.size > MAX_INPUT) throw new ImageError(`“${file.name}” tem mais de 25 MB. Escolha uma foto menor.`);
  const type = sniffImageType(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  if (!type) throw new ImageError(`“${file.name}” não é uma imagem JPG, PNG, WebP ou AVIF.`);
  return type;
}

async function decode(file, type) {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new ImageError(type === 'image/avif'
      ? `Este navegador não abre AVIF (“${file.name}”). Use o Chrome ou envie em JPG, PNG ou WebP.`
      : `Não foi possível abrir “${file.name}”. O arquivo pode estar corrompido.`);
  }
}

function draw(bitmap, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// WebP quando o navegador sabe gerar; senão JPG (com fundo branco no lugar da transparência)
async function encode(canvas, qualities) {
  for (const q of qualities) {
    const webp = await toBlob(canvas, 'image/webp', q);
    if (webp?.type === 'image/webp' && webp.size <= MAX_UPLOAD) return webp;
    if (!webp || webp.type !== 'image/webp') {
      const flat = document.createElement('canvas');
      flat.width = canvas.width; flat.height = canvas.height;
      const ctx = flat.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, flat.width, flat.height); ctx.drawImage(canvas, 0, 0);
      const jpg = await toBlob(flat, 'image/jpeg', q);
      if (jpg && jpg.size <= MAX_UPLOAD) return jpg;
    }
  }
  throw new ImageError('Mesmo reduzida, a imagem passou de 2 MB. Tente outra foto.');
}

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

// Confere e prepara a foto: versão principal (até 1200 px) e miniatura (até 400 px).
// preview é a miniatura em data: URL, para mostrar antes de enviar.
export async function processImage(file) {
  const type = await checkFile(file);
  const bitmap = await decode(file, type);
  try {
    const mainCanvas = draw(bitmap, MAIN_SIDE);
    const thumbCanvas = draw(bitmap, THUMB_SIDE);
    const main = await encode(mainCanvas, [0.82, 0.72, 0.6]);
    const thumb = await encode(thumbCanvas, [0.78, 0.65]);
    return {
      main: { blob: main, width: mainCanvas.width, height: mainCanvas.height },
      thumb: { blob: thumb, width: thumbCanvas.width, height: thumbCanvas.height },
      original: { name: file.name, size: file.size, type, width: bitmap.width, height: bitmap.height },
      preview: await blobToDataUrl(thumb),
    };
  } finally {
    bitmap.close?.();
  }
}

// Só a prévia (miniatura), mais rápida, para listas com muitas fotos
export async function previewImage(file) {
  const type = await checkFile(file);
  const bitmap = await decode(file, type);
  try {
    const canvas = draw(bitmap, 240);
    return { preview: await blobToDataUrl(await encode(canvas, [0.7])), width: bitmap.width, height: bitmap.height, type };
  } finally {
    bitmap.close?.();
  }
}

export const publicUrl = (path) => `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

// Envio com progresso e cancelamento (o supabase-js não informa o progresso).
// Mesma API do Storage que o supabase-js usa; quem barra não-admins é a política do bucket.
async function uploadBlob(path, blob, { onProgress, signal } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ImageError('Sua sessão expirou. Entre de novo no painel.');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', supabaseAnonKey);
    xhr.setRequestHeader('Content-Type', blob.type);
    xhr.setRequestHeader('cache-control', `max-age=${YEAR}`);
    xhr.setRequestHeader('x-upsert', 'false'); // nunca sobrescreve um arquivo existente
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(publicUrl(path));
      let message = '';
      try { message = JSON.parse(xhr.responseText).message || ''; } catch { /* resposta sem JSON */ }
      if (xhr.status === 413 || /maximum allowed size/i.test(message)) return reject(new ImageError('A imagem passou do limite de 2 MB do Storage.'));
      if (xhr.status === 401 || xhr.status === 403 || /row-level security/i.test(message)) return reject(new ImageError('Sem permissão para enviar imagens. Entre de novo com uma conta de administrador.'));
      reject(new ImageError(`O Storage recusou a imagem (${xhr.status}${message ? `: ${message}` : ''}).`));
    };
    xhr.onerror = () => reject(new ImageError('Falha de conexão ao enviar a imagem. Confira a internet e tente de novo.'));
    xhr.onabort = () => reject(Object.assign(new Error('Envio cancelado.'), { name: 'AbortError' }));
    if (signal?.aborted) return xhr.onabort();
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/avif': 'avif' };
const shortId = () => crypto.getRandomValues(new Uint32Array(1))[0].toString(36).padStart(6, '0').slice(-6);

// Nome amigável para o Google: produtos/pizza-calabresa-k3x9q2.webp
export function imagePath(baseName, type, folder = 'produtos') {
  const base = slugify(baseName).slice(0, 60).replace(/-+$/, '') || 'imagem';
  return `${folder}/${base}-${shortId()}.${EXT[type] || 'webp'}`;
}

async function removePaths(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(list);
  if (error) console.warn('Não foi possível apagar arquivos do Storage', error);
}

// Prepara, envia (principal + miniatura) e registra na Biblioteca de Imagens.
// Se o registro falhar, apaga o que foi enviado. Devolve a linha de media_images.
// onStep(fase, fração): 'preparando' | 'enviando' (0..1) | 'registrando'
export async function addToLibrary(file, { baseName, alt = null, group = 'outros', onStep, signal, prepared } = {}) {
  onStep?.('preparando', 0);
  const img = prepared || await processImage(file);
  if (signal?.aborted) throw Object.assign(new Error('Envio cancelado.'), { name: 'AbortError' });
  const name = baseName || file.name.replace(/\.[a-z0-9]+$/i, '');
  const path = imagePath(name, img.main.blob.type);
  const thumbPath = path.replace(/(\.[a-z0-9]+)$/, '-mini$1').replace(/\.[a-z0-9]+$/, `.${EXT[img.thumb.blob.type]}`);
  const total = img.main.blob.size + img.thumb.blob.size;
  const uploaded = [];
  try {
    const url = await uploadBlob(path, img.main.blob, { signal, onProgress: (f) => onStep?.('enviando', (f * img.main.blob.size) / total) });
    uploaded.push(path);
    const thumbUrl = await uploadBlob(thumbPath, img.thumb.blob, { signal, onProgress: (f) => onStep?.('enviando', (img.main.blob.size + f * img.thumb.blob.size) / total) });
    uploaded.push(thumbPath);
    onStep?.('registrando', 1);
    const { data, error } = await supabase.from('media_images').insert({
      path, url, thumb_path: thumbPath, thumb_url: thumbUrl, mime: img.main.blob.type,
      width: img.main.width, height: img.main.height, bytes: img.main.blob.size,
      original_name: String(file.name).slice(0, 200), alt: alt ? String(alt).slice(0, 200) : null, group_type: group,
    }).select('*').single();
    if (error) throw error;
    return data;
  } catch (e) {
    await removePaths(uploaded);
    throw e;
  }
}

// Liga uma imagem da biblioteca a um produto. A imagem anterior continua na
// biblioteca (aparece em "sem produto"), então dá para voltar atrás.
export async function setProductImage(product, media, alt) {
  const patch = {
    image_url: media ? media.url : null,
    image_thumb_url: media ? media.thumb_url ?? null : null,
  };
  if (alt !== undefined) patch.image_alt = alt ? String(alt).trim().slice(0, 200) || null : null;
  const { data, error } = await supabase.from('products').update(patch).eq('id', product.id)
    .select('id, image_url, image_thumb_url, image_alt').single();
  if (error) throw error;
  Object.assign(product, data);
  return product;
}

// Exclui de vez uma imagem da biblioteca (só se nenhum produto usa).
export async function deleteLibraryImage(media) {
  const { count, error } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('image_url', media.url);
  if (error) throw error;
  if (count) throw new ImageError('Esta imagem ainda está num produto. Troque ou remova a imagem do produto antes de excluir.');
  const { error: e1 } = await supabase.storage.from(BUCKET).remove([media.path, media.thumb_path].filter(Boolean));
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('media_images').delete().eq('id', media.id);
  if (e2) throw e2;
}

// Envio simples (logo, capa, sabores): só a versão principal, devolve a URL pública.
export async function uploadImage(file, folder = 'outros') {
  const img = await processImage(file);
  const path = imagePath(file.name.replace(/\.[a-z0-9]+$/i, ''), img.main.blob.type, folder);
  return uploadBlob(path, img.main.blob);
}

// Caminho dentro do bucket a partir da URL pública; null se a imagem não é nossa.
export function storagePath(url) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = String(url ?? '').indexOf(marker);
  return i === -1 ? null : decodeURIComponent(String(url).slice(i + marker.length).split('?')[0]);
}

// Tabelas e colunas que podem apontar para uma foto do bucket
const IMAGE_COLUMNS = [
  ['products', 'image_url'], ['products', 'image_thumb_url'], ['pizza_flavors', 'image_url'],
  ['store_settings', 'logo_url'], ['store_settings', 'cover_url'],
  ['media_images', 'url'], ['media_images', 'thumb_url'], // guardadas na biblioteca: só saem por lá
];

// Apaga do Storage as fotos que não são mais usadas em nenhum cadastro.
// Melhor esforço: se algo falhar, a foto só fica sobrando no bucket.
export async function removeUnusedImages(urls) {
  const candidates = [...new Set(urls.filter((u) => storagePath(u)))];
  const paths = [];
  for (const url of candidates) {
    let used = false;
    for (const [table, column] of IMAGE_COLUMNS) {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq(column, url);
      if (error || count) { used = true; break; }
    }
    if (!used) paths.push(storagePath(url));
  }
  await removePaths(paths);
}
