// ============================================================================
//  app.js — junta tudo: desenha a tela, liga os eventos, inicia a sessão.
//  É o único arquivo carregado pelo index.html.
// ============================================================================
import { S, V, VERSAO, MESES, ABAS, A0, M0, podar, noMes, esc, viagemAtual } from './estado.js';
import { MOEDAS, M, Mc } from './moeda.js';
import { toast, baixar } from './ui.js';
import { sb } from './supabase.js';
import { pedirLogin, sair, sessao } from './auth.js';
import { carregarTudo, salvarPerfil, contasApi, fixosApi, apagarTudo } from './api.js';
import { setRender } from './bus.js';
import { abrirImport } from './importar.js';
import { fita } from './fita.js';

import { doMes, telaMes }        from './telas/mes.js';
import { telaPainel }            from './telas/painel.js';
import { telaAno }               from './telas/ano.js';
import { telaDiario, formDiario } from './telas/diario.js';
import { telaViagem, formHosp, formGasto } from './telas/viagem.js';
import { formViagem } from './telas/viagem_form.js';
import { telaFixos, gerarMes, gerarAno, formFixo } from './telas/fixos.js';
import { telaDados }             from './telas/dados.js';
import { form }                  from './telas/form_conta.js';

const $ = id => document.getElementById(id);
const on = (id, ev, fn) => { const e = $(id); if (e) e[ev] = fn; };

// ---------------------------------------------------------------------------
//  RENDER
// ---------------------------------------------------------------------------
export function render() {
  if (V.ano < A0 || (V.ano === A0 && V.mes < M0)) { V.ano = A0; V.mes = M0; }
  const noLimite = (V.ano === A0 && V.mes === M0);
  $('prev').style.opacity = noLimite ? .25 : 1;

  $('mesNome').textContent = MESES[V.mes - 1];
  $('anoNome').textContent = V.ano;

  const ts = doMes();
  const pend = ts.filter(t => t.st === 'Pendente').reduce((s, t) => s + (t.est || 0), 0);
  $('hFalta').textContent = pend ? M(pend) : 'nada';
  $('hPago').textContent  = M(ts.reduce((s, t) => s + (t.pago || 0), 0));
  $('cMes').textContent   = ts.length || '';
  $('cFix').textContent   = S.fixos.filter(f => f.ativo).length;
  $('cDia').textContent   = S.diario.filter(d => noMes(d, V.ano, V.mes)).length || '';
  $('ver').textContent    = VERSAO + ' · ' + S.tx.length + ' contas';

  $('moedas').innerHTML = Object.keys(MOEDAS).map(k =>
    `<button data-m="${k}" class="${(S.moeda || 'BRL') === k ? 'on' : ''}"
             title="Ver tudo em ${MOEDAS[k].n}">${MOEDAS[k].n}</button>`).join('');

  document.querySelectorAll('.aba').forEach(b => {
    b.style.setProperty('--t', ABAS[b.dataset.t].c);
    b.classList.toggle('on', b.dataset.t === V.aba);
  });
  $('tela').style.setProperty('--acc', ABAS[V.aba].c);

  $('tela').innerHTML =
    V.aba === 'mes'    ? telaMes()    : V.aba === 'painel' ? telaPainel() :
    V.aba === 'ano'    ? telaAno()    : V.aba === 'diario' ? telaDiario() :
    V.aba === 'viagem' ? telaViagem() : V.aba === 'fixos'  ? telaFixos()  : telaDados();

  fita();
  liga();
}
setRender(render);

// ---------------------------------------------------------------------------
//  EVENTOS  (religados a cada render, porque o HTML é redesenhado)
// ---------------------------------------------------------------------------
function liga() {
  // moeda
  document.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
    S.moeda = b.dataset.m; render();
    try { await salvarPerfil({ moeda_padrao: S.moeda }); } catch (e) { toast(e.message); }
  });

  // contas: marcar pago / a pagar
  document.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
    const t = S.tx.find(x => x.id === b.dataset.toggle);
    const antes = { st: t.st, pago: t.pago };
    if (t.st === 'Pago') { t.st = 'Pendente'; t.pago = 0; }
    else { t.st = 'Pago'; if (!t.pago) t.pago = t.est || 0; }
    render();                                    // responde na hora
    try { await contasApi.atualizar(t.id, t); }  // e confirma no banco
    catch (e) { Object.assign(t, antes); render(); toast(e.message || 'Não salvou'); }
  });

  document.querySelectorAll('[data-edit]').forEach(b =>
    b.onclick = () => form(S.tx.find(x => x.id === b.dataset.edit)));

  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const t = S.tx.find(x => x.id === b.dataset.del);
    if (!confirm(`Apagar "${t.conta}" de ${t.data.slice(8)}/${t.data.slice(5,7)}?`)) return;
    try { await contasApi.apagar(t.id); render(); toast('Conta apagada'); }
    catch (e) { toast(e.message || 'Não apagou'); }
  });

  on('add',  'onclick', () => form(null));
  on('add2', 'onclick', () => form(null));
  on('gerarAqui', 'onclick', gerarMes);
  on('limpaDia', 'onclick', () => { V.diaSel = null; render(); });

  // filtros e ordenação
  on('fq', 'oninput', e => {
    V.filtro.q = e.target.value; const p = e.target.selectionStart; render();
    const n = $('fq'); if (n) { n.focus(); n.setSelectionRange(p, p); }
  });
  ['fcat','floc','fpg','fst'].forEach(id =>
    on(id, 'onchange', e => { V.filtro[id.slice(1)] = e.target.value; render(); }));
  document.querySelectorAll('[data-o]').forEach(h => h.onclick = () => {
    const c = h.dataset.o;
    V.ord = (V.ord.col === c) ? { col: c, dir: -V.ord.dir } : { col: c, dir: 1 };
    render();
  });
  on('selAno', 'onchange', e => { V.ano = +e.target.value; render(); });

  // câmbios
  const cambio = async (id, campo, chave) => on(id, 'onchange', async e => {
    S[chave] = +e.target.value || 1; render();
    try { await salvarPerfil({ [campo]: S[chave] }); toast('Câmbio atualizado'); }
    catch (err) { toast(err.message); }
  });
  cambio('cambio', 'cambio_eur', 'cambio');
  cambio('usd',    'cambio_usd', 'usd');
  cambio('pyg',    'cambio_pyg', 'pyg');

  // fixos
  document.querySelectorAll('[data-fx]').forEach(c => c.onchange = async () => {
    const f = S.fixos[c.dataset.fx];
    try { await fixosApi.ativar(f.id, c.checked); render(); }
    catch (e) { c.checked = !c.checked; toast(e.message); }
  });
  document.querySelectorAll('[data-fxdel]').forEach(b => b.onclick = async () => {
    const f = S.fixos[b.dataset.fxdel];
    if (!confirm(`Tirar "${f.conta}" das fixas?`)) return;
    try { await fixosApi.apagar(f.id); render(); } catch (e) { toast(e.message); }
  });
  on('gerar',    'onclick', gerarMes);
  on('gerarAno', 'onclick', gerarAno);
  on('addFixo', 'onclick', () => formFixo(null));
  document.querySelectorAll('[data-fxedit]').forEach(b =>
    b.onclick = () => formFixo(S.fixos[+b.dataset.fxedit]));

  // dia a dia
  on('addD',  'onclick', () => formDiario(null));
  on('addD2', 'onclick', () => formDiario(null));
  document.querySelectorAll('[data-ed]').forEach(b =>
    b.onclick = () => formDiario(S.diario.find(x => x.id === b.dataset.ed)));

  // viagem
  on('novaViagem', 'onclick', () => formViagem(null));
  on('editarViagem', 'onclick', () => formViagem(viagemAtual()));
  on('selViagem', 'onchange', e => { V.viagemId = e.target.value; render(); });
  on('addH', 'onclick', () => formHosp(null));
  on('addG', 'onclick', () => formGasto(null));
  document.querySelectorAll('[data-eh]').forEach(b =>
    b.onclick = () => { const v = S.viagens.find(x => x.id === V.viagemId) || S.viagens[0]; formHosp(v.hosp.find(x => x.id === b.dataset.eh)); });
  document.querySelectorAll('[data-eg]').forEach(b =>
    b.onclick = () => formGasto(b.dataset.eg));

  // importar OFX/CSV
  on('impExt', 'onclick', () => $('impExtFile').click());
  on('impExtFile', 'onchange', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        let txt = new TextDecoder('utf-8').decode(r.result);
        if (txt.includes('\uFFFD')) txt = new TextDecoder('windows-1252').decode(r.result);
        abrirImport(txt, f.name);
      } catch (err) { toast('Não consegui ler esse arquivo — tente o OFX'); console.warn(err); }
      e.target.value = '';
    };
    r.readAsArrayBuffer(f);
  });

  // conta do usuário
  on('sair', 'onclick', () => { if (confirm('Sair da conta?')) sair(); });
  on('trocarSenha', 'onclick', async () => {
    const nova = prompt('Nova senha (mínimo 6 caracteres):');
    if (!nova) return;
    const { error } = await sb.auth.updateUser({ password: nova });
    toast(error ? error.message : 'Senha trocada');
  });

  // backup
  on('expJson', 'onclick', () => baixar(`contas-backup-${new Date().toISOString().slice(0,10)}.json`,
    JSON.stringify({ tx:S.tx, fixos:S.fixos, diario:S.diario, viagens:S.viagens }, null, 1), 'application/json'));
  on('expCsv', 'onclick', expCsv);

  on('zerar', 'onclick', async () => {
    if (!confirm('Apagar TODAS as suas contas, fixas, dia a dia e viagens do Supabase?\n\nIsso não tem volta. Baixe o backup antes.')) return;
    if (prompt('Digite APAGAR para confirmar:') !== 'APAGAR') return;
    try { await apagarTudo(); render(); toast('Tudo apagado'); }
    catch (e) { toast(e.message); }
  });
}

function expCsv() {
  const h = ['Data','Ano','Mês','Conta','Categoria','Local','Pagamento','Estimativa','Pago','Status','Obs'];
  const l = [...S.tx].sort((a,b) => a.data.localeCompare(b.data)).map(t => [
    t.data.split('-').reverse().join('/'), t.data.slice(0,4), +t.data.slice(5,7), t.conta, t.cat, t.loc, t.pg,
    String(t.est || '').replace('.', ','), String(t.pago || '').replace('.', ','), t.st, t.obs]);
  const csv = '\uFEFF' + [h, ...l].map(r =>
    r.map(c => `"${String(c == null ? '' : c).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  baixar(`contas-${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv');
}

// ---------------------------------------------------------------------------
//  NAVEGAÇÃO
// ---------------------------------------------------------------------------
$('prev').onclick = () => {
  if (V.ano === A0 && V.mes === M0) { toast('O histórico começa em maio de 2026'); return; }
  V.mes--; if (V.mes < 1) { V.mes = 12; V.ano--; } V.diaSel = null; render();
};
$('next').onclick = () => {
  V.mes++; if (V.mes > 12) { V.mes = 1; V.ano++; } V.diaSel = null; render();
};
document.querySelectorAll('.aba').forEach(b => b.onclick = () => { V.aba = b.dataset.t; render(); });
document.addEventListener('keydown', e => {
  if (e.target.matches('input,select,textarea')) return;
  if (e.key === 'ArrowLeft')  $('prev').click();
  if (e.key === 'ArrowRight') $('next').click();
});

// ---------------------------------------------------------------------------
//  INÍCIO
// ---------------------------------------------------------------------------
async function iniciar() {
  const s = await sessao();
  if (!s) { pedirLogin(); return; }

  document.getElementById('login').hidden = true;
  document.getElementById('app').hidden = false;
  document.getElementById('carregando').hidden = false;

  try {
    const r = await carregarTudo();
    podar();
    // primeiro login: nada no banco ainda
    if (r.contas === 0 && r.fixos === 0 && r.viagens === 0) V.aba = 'dados';
  } catch (e) {
    document.getElementById('carregando').innerHTML =
      `<div class="vazio"><b style="color:var(--carimbo)">Não consegui falar com o Supabase</b>
       <p style="margin-top:6px">${esc(e.message)}</p>
       <p style="font-size:12px;margin-top:8px">Confira <code>js/config.js</code> e se o <code>schema.sql</code> já rodou.</p></div>`;
    return;
  }
  document.getElementById('carregando').hidden = true;
  render();
}

sb.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT') location.reload();
});

iniciar();
