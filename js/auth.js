// ============================================================================
//  Autenticação por e-mail e senha (Supabase Auth).
//  A tela de login usa o mesmo CSS do app — nenhum estilo novo.
// ============================================================================
import { sb, erroLegivel } from './supabase.js';

const tela = () => document.getElementById('login');
const RELOAD_TOPO = 'contas:voltar-topo';

function reiniciarNoTopo() {
  try { sessionStorage.setItem(RELOAD_TOPO, '1'); } catch (e) {}
  window.scrollTo(0, 0);
  location.replace(location.pathname + location.search + location.hash);
}

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
  window.scrollTo(0, 0);
  document.getElementById('app').hidden = true;

  let modo = 'entrar';   // entrar | recuperar
  const desenha = () => {
    el.innerHTML = `
      <div class="card login-card">
        <div class="login-topo">
          <h1>Contas</h1>
          <p>${modo === 'entrar' ? 'Entre na sua conta' : 'Mandamos um link para você trocar a senha.'}</p>
        </div>
        <div class="campos">
          <div class="campo"><label>E-mail</label>
            <input type="email" id="l_email" autocomplete="email" inputmode="email" placeholder="voce@email.com"></div>
          ${modo !== 'recuperar' ? `<div class="campo"><label>Senha</label>
            <input type="password" id="l_senha" autocomplete="current-password"></div>` : ''}
          <div id="l_erro" class="login-erro" hidden></div>
          <button class="btn" id="l_ok" style="width:100%;padding:10px">
            ${modo === 'entrar' ? 'Entrar' : 'Enviar link'}
          </button>
          <div class="login-links">
            ${modo === 'entrar'
              ? `<button class="lnk" data-m="recuperar">Esqueci a senha</button>`
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
      if (modo === 'entrar' && (!email || !senha)) return erro('Preencha o e-mail e a senha.');
      if (modo === 'recuperar' && !email) return erro('Preencha o e-mail.');
      ok.disabled = true; ok.textContent = 'Um instante…';
      try {
        if (modo === 'entrar') {
          const { error } = await sb.auth.signInWithPassword({ email, password: senha });
          if (error) {
            const msg = String(error.message || '');
            if (/invalid login credentials|invalid credentials|invalid email or password/i.test(msg)) {
              throw new Error('E-mail ou senha incorretos.');
            }
            throw error;
          }
          reiniciarNoTopo();

        } else {
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
          if (error) throw error;
          erro('Link enviado. Olhe seu e-mail.');
        }
      } catch (e) {
        const msg = String(e?.message || '');
        if (msg === 'Preencha o e-mail e a senha.' || msg === 'E-mail ou senha incorretos.') {
          erro(msg);
        } else if (modo === 'entrar') {
          erro('Não foi possível entrar. Tente novamente.');
        } else {
          erro(erroLegivel(e));
        }
      } finally {
        ok.disabled = false;
        ok.textContent = modo === 'entrar' ? 'Entrar' : 'Enviar link';
      }
    };
  }

  desenha();
}
