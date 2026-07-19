// Cliente único do Supabase, usado por todo o app.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// During automated tests run under Node we don't want to import the remote
// ESM bundle from esm.sh (it uses https: and breaks Node's ESM loader). If
// the environment variable RUNNING_TESTS is set we export a lightweight
// in-memory stub that prevents network calls. In the browser the real
// client is created as before.
export let sb = null;

if (typeof process !== 'undefined' && process.env && process.env.RUNNING_TESTS) {
  // test stub
  sb = {
    auth: {
      async getSession() { return { data: { session: null } }; },
      async getUser() { return { data: { user: null } }; },
      onAuthStateChange() { return { data: null }; }
    },
    from() { return { select: async ()=>({ data: [] }), insert: async ()=>({ data: [] }), update: async ()=>({ data: [] }), delete: async ()=>({}) }; }
  };
} else {
  // browser: import the real client
  // eslint-disable-next-line no-undef
  const _create = await import('https://esm.sh/@supabase/supabase-js@2.45.4').then(m=>m.createClient);
  sb = _create(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}

/** id do usuário logado agora (ou null) */
export async function usuarioId() {
  const { data } = await sb.auth.getUser();
  return data?.user?.id ?? null;
}

/** Traduz erro do Supabase para português de gente. */
export function erroLegivel(e) {
  const m = (e?.message || String(e)).toLowerCase();
  if (m.includes('invalid login credentials'))  return 'E-mail ou senha errados.';
  if (m.includes('email not confirmed'))        return 'Confirme seu e-mail antes de entrar. Veja a caixa de entrada.';
  if (m.includes('user already registered'))    return 'Esse e-mail já tem conta. Tente entrar.';
  if (m.includes('password should be at least'))return 'A senha precisa de pelo menos 6 caracteres.';
  if (m.includes('row-level security'))         return 'O banco recusou: essa linha não é sua.';
  if (m.includes('failed to fetch'))            return 'Sem conexão com o Supabase. Confira a URL em js/config.js.';
  if (m.includes('rate limit'))                 return 'Muitas tentativas. Espere um minuto.';
  return e?.message || 'Deu erro. Veja o console (F12).';
}
