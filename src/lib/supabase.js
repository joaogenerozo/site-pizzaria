import { createClient } from '@supabase/supabase-js';

// Só a URL do projeto e a chave PUBLICÁVEL (anon). A segurança vem do RLS
// no banco; esta chave pode aparecer no navegador sem risco.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configError = !url || !anonKey
  ? 'O site ainda não foi configurado: faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.'
  : null;

export const supabase = configError
  ? null
  : createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cardapio-admin-auth' },
  });
