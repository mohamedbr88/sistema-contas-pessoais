// ============================================================================
//  Autenticação por e-mail e senha (Supabase Auth).
//  A tela de login usa o mesmo CSS do app — nenhum estilo novo.
// ============================================================================
import { sb, erroLegivel } from './supabase.js';

const tela = () => document.getElementById('login');

export async function sessao() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function sair() {
  await sb.auth.signOut();
  location.reload();
}

/** Desenha a tela de entrada e devolve uma Promise que resolve quando logar. */
export function pedirLogin() {
  const el = tela();
  el.hidden = false;
  document.getElementById('app').hidden = true;

  let modo = 'entrar';   // entrar | criar | recuperar
  const desenha = () => {
    el.innerHTML = `
      <div class="card login-card">
        <div class="login-topo">
          <h1>Contas</h1>
          <p>${modo === 'entrar' ? 'Entre para ver suas contas.'
              : modo === 'criar' ? 'Crie sua conta. Leva 10 segundos.'
              : 'Mandamos um link para você trocar a senha.'}</p>
        </div>
        <div class="campos">
          ${modo === 'criar' ? `<div class="campo"><label>Seu nome</label><input id="l_nome" autocomplete="name"></div>` : ''}
          <div class="campo"><label>E-mail</label>
            <input type="email" id="l_email" autocomplete="email" inputmode="email" placeholder="voce@email.com"></div>
          ${modo !== 'recuperar' ? `<div class="campo"><label>Senha</label>
            <input type="password" id="l_senha" autocomplete="${modo==='criar'?'new-password':'current-password'}"
                   placeholder="${modo==='criar'?'mínimo 6 caracteres':''}"></div>` : ''}
          <div id="l_erro" class="login-erro" hidden></div>
          <button class="btn" id="l_ok" style="width:100%;padding:10px">
            ${modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}
          </button>
          <div class="login-links">
            ${modo === 'entrar'
              ? ``
              : `<button class="lnk" data-m="entrar">← Voltar para entrar</button>`}
          </div>
        </div>
      </div>`;
    liga();
  };

  const erro = m => { const e = document.getElementById('l_erro'); e.textContent = m; e.hidden = false; };

  function liga() {
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { modo = b.dataset.m; desenha(); });
    const ok = document.getElementById('l_ok');
    el.querySelectorAll('input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') ok.click(); });

    ok.onclick = async () => {
      const email = document.getElementById('l_email').value.trim();
      const senha = document.getElementById('l_senha')?.value ?? '';
      if (!email) return erro('Falta o e-mail.');
      ok.disabled = true; ok.textContent = 'Um instante…';
      try {
        if (modo === 'entrar') {
          const { error } = await sb.auth.signInWithPassword({ email, password: senha });
          if (error) throw error;
          location.reload();

        } else if (modo === 'criar') {
          const nome = document.getElementById('l_nome').value.trim();
          const { data, error } = await sb.auth.signUp({
            email, password: senha, options: { data: { nome } }
          });
          if (error) throw error;
          if (!data.session) {
            el.innerHTML = `<div class="card login-card"><div class="login-topo">
              <h1>Confira seu e-mail</h1>
              <p>Mandamos um link de confirmação para <b>${email}</b>. Clique nele e volte aqui.</p>
              <p style="font-size:12.5px;margin-top:10px">Não chegou? Olhe o spam. Se você é o único usuário,
              dá para desligar a confirmação em Supabase → Authentication → Providers → Email.</p>
              </div></div>`;
            return;
          }
          location.reload();

        } else {
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
          if (error) throw error;
          erro('Link enviado. Olhe seu e-mail.');
        }
      } catch (e) {
        erro(erroLegivel(e));
      } finally {
        ok.disabled = false;
        ok.textContent = modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link';
      }
    };
  }

  desenha();
}
