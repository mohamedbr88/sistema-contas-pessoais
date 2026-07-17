// Cliente único do Supabase, usado por todo o app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

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
