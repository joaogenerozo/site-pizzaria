// Só a URL do projeto e a chave PUBLICÁVEL (anon). A segurança vem do RLS
// no banco; esta chave pode aparecer no navegador sem risco.
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configError = !supabaseUrl || !supabaseAnonKey
  ? 'O site ainda não foi configurado: faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.'
  : null;
