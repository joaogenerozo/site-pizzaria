import { supabase } from '../lib/supabase.js';

// Fotos do cardápio no Storage (bucket menu-images, limite de 2 MB por arquivo).

export const BUCKET = 'menu-images';
const MAX_SIDE = 1600; // px; suficiente para a tela do celular e do computador
const MAX_INPUT = 25 * 1024 * 1024; // foto direto da câmera do celular

// Reduz a foto no navegador antes do envio: lado maior até 1600 px, WEBP (ou JPG
// em navegadores sem WEBP). Fotos que já são pequenas vão como estão.
export async function shrinkImage(file) {
  if (file.size > MAX_INPUT) throw new Error('Imagem muito grande (mais de 25 MB).');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Não foi possível ler esta imagem. Use JPG, PNG ou WEBP.');
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
  if (!blob) throw new Error('Não foi possível preparar a imagem.');
  return blob.size < file.size ? blob : file;
}

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
