import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey, configError } from './config.js';

// Cliente completo (login, gravação, fotos): usado só pelo painel /admin/.
export { configError };

export const supabase = configError
  ? null
  : createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cardapio-admin-auth' },
  });
