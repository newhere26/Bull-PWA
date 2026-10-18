import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase is not configured. Copy artifacts/reclaim/.env.example to artifacts/reclaim/.env ' +
    'and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// API base URL: explicit value in local dev (frontend + API on different ports),
// same-origin in production single-host deploys.
setBaseUrl((import.meta.env.VITE_API_URL as string | undefined) || null);

// Attach the Supabase JWT to every API call that doesn't set its own auth header.
setAuthTokenGetter(async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});
