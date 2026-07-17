// ============================================================================
//  >>>>>  É AQUI QUE VOCÊ COLA AS DUAS CHAVES DO SUPABASE  <<<<<
//
//  Onde achar:
//    Supabase → seu projeto → Settings (engrenagem) → API
//      • "Project URL"            →  cole em SUPABASE_URL
//      • "Publishable key" (anon) →  cole em SUPABASE_ANON_KEY
//
//  NUNCA cole aqui a "Service role key" / "secret key".
//  Este arquivo vai para o GitHub e qualquer um consegue ler.
//  A anon key é pública de propósito — quem protege seus dados é o RLS do banco.
// ============================================================================

export const SUPABASE_URL = 'https://xgtwbdpddhalnlhxunwa.supabase.co';

export const SUPABASE_ANON_KEY = 'sb_publishable_Wo4wFzsKON23en2EH0IVIg_3f0mqURz';

// ---------------------------------------------------------------------------
// Trava de segurança: avisa alto se você colar a chave errada.
// ---------------------------------------------------------------------------
if (/service_role/.test(SUPABASE_ANON_KEY) || /^sb_secret_/.test(SUPABASE_ANON_KEY)) {
  document.body.innerHTML =
    '<div style="font:16px system-ui;padding:40px;color:#B4232A;max-width:640px;margin:auto">' +
    '<h1>Pare agora</h1><p>Você colou a <b>Service Role Key</b> em <code>js/config.js</code>. ' +
    'Ela ignora todo o RLS e está indo para o GitHub — qualquer pessoa poderia ler e apagar o banco inteiro.</p>' +
    '<p><b>Faça já:</b> troque pela <b>Publishable (anon) key</b>, e vá em Supabase → Settings → API → ' +
    '<b>Revoke / rotate</b> a service role key que vazou.</p></div>';
  throw new Error('Service role key no frontend — bloqueado.');
}

if (SUPABASE_URL.includes('COLE_AQUI') || SUPABASE_ANON_KEY.includes('COLE_AQUI')) {
  document.body.innerHTML =
    '<div style="font:16px system-ui;padding:40px;color:#16262C;max-width:640px;margin:auto">' +
    '<h1>Falta configurar</h1><p>Abra <code>js/config.js</code> e cole as duas chaves do seu projeto Supabase:</p>' +
    '<p><code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code><br>' +
    '(Supabase → Settings → API → Project URL e Publishable key)</p></div>';
  throw new Error('config.js sem as chaves do Supabase.');
}
