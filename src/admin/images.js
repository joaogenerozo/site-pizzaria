import { supabase } from '../lib/supabase.js';
import { friendlyDbError } from './fields.js';

// Fotos do cardápio no Storage (bucket menu-images, limite de 2 MB por arquivo).

export const BUCKET = 'menu-images';
const MAX_SIDE = 1600; // px; suficiente para a tela do celular e do computador
const MAX_INPUT = 25 * 1024 * 1024; // foto direto da câmera do celular

// Problema com o arquivo escolhido (a mensagem já está pronta para mostrar)
class ImageError extends Error {}

// Reduz a foto no navegador antes do envio: lado maior até 1600 px, WEBP (ou JPG
// em navegadores sem WEBP). Fotos que já são pequenas vão como estão.
export async function shrinkImage(file) {
  if (file.size > MAX_INPUT) throw new ImageError('Imagem muito grande (mais de 25 MB).');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError('Não foi possível ler esta imagem. Use JPG, PNG ou WEBP.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 500 * 1024) { bitmap.close?.(); return file; }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const toBlob = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await toBlob('image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85);
  if (!blob) throw new ImageError('Não foi possível preparar a imagem.');
  return blob.size < file.size ? blob : file;
}

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD = 2 * 1024 * 1024; // limite do bucket

// Reduz e envia uma foto para o bucket. Devolve a URL pública.
export async function uploadImage(file) {
  if (!IMAGE_TYPES.includes(file.type)) throw new ImageError('Use JPG, PNG ou WEBP.');
  const blob = await shrinkImage(file);
  if (blob.size > MAX_UPLOAD) throw new ImageError('Mesmo reduzida, a imagem passou de 2 MB. Tente outra foto.');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[blob.type];
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export const imageErrorMessage = (e) => (e instanceof ImageError ? e.message : friendlyDbError(e));

// Caminho dentro do bucket a partir da URL pública; null se a imagem não é nossa.
export function storagePath(url) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = String(url ?? '').indexOf(marker);
  return i === -1 ? null : decodeURIComponent(String(url).slice(i + marker.length).split('?')[0]);
}

// Tabelas e colunas que podem apontar para uma foto do bucket
const IMAGE_COLUMNS = [['products', 'image_url'], ['pizza_flavors', 'image_url'], ['store_settings', 'logo_url'], ['store_settings', 'cover_url']];

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
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.warn('Não foi possível apagar fotos antigas do Storage', error);
}
