// ============================================================================
//  app.js — junta tudo: desenha a tela, liga os eventos, inicia a sessão.
//  É o único arquivo carregado pelo index.html.
// ============================================================================
import { S, V, VERSAO, MESES, ABAS, A0, M0, podar, noMes, esc, viagemAtual, carregarEstadoTela, salvarEstadoTela, CACHE_VERSAO } from './estado.js?v=20260720-6';
import { MOEDAS, M, Mc } from './moeda.js?v=20260720-6';
import { toast, baixar } from './ui.js?v=20260720-6';
import { sb } from './supabase.js';
import { pedirLogin, sair, sessao } from './auth.js?v=20260720-6';
import { carregarTudo, salvarPerfil, contasApi, fixosApi, apagarTudo, despesasApi } from './api.js?v=20260720-6';
import { propagar, limparAoApagar, vincularTodasFixas } from './propagacao.js?v=20260720-6';
import { setRender } from './bus.js';
import { resumoMes, diarioDoMes, somaValor, somaPendente, somaPago } from './calculos.js?v=20260720-6';
import { importarBase, temBase } from './seed.js?v=20260720-6';
import { abrirImport } from './importar.js?v=20260720-6';
import { fita } from './fita.js?v=20260720-6';
import { iniciarRelogio } from './relogio.js?v=20260720-6';

import { doMes, telaMes }        from './telas/mes.js?v=20260720-6';
import { telaPainel }            from './telas/painel.js?v=20260720-6';
import { telaAno }               from './telas/ano.js?v=20260720-6';
import { telaDiario, formDiario, formMetaDiario } from './telas/diario.js?v=20260720-6';
import { telaViagem, formHosp, formGasto } from './telas/viagem.js?v=20260720-6';
import { formViagem } from './telas/viagem_form.js?v=20260720-6';
import { formFixo } from './telas/fixo_form.js?v=20260720-6';
import { telaInsights, exportarInsightsCsv, exportarInsightsXls, imprimirInsights } from './telas/insights.js?v=20260720-6';
import { telaFixos, gerarMes, gerarAno }   from './telas/fixos.js?v=20260720-6';
import { telaDados }             from './telas/dados.js?v=20260720-6';
import { telaDiagnostico, executarSincronizacao } from './telas/diagnostico.js?v=20260720-6';
import { form }                  from './telas/form_conta.js?v=20260720-6';

const $ = id => document.getElementById(id);
const on = (id, ev, fn) => { const e = $(id); if (e) e[ev] = fn; };
const RELOAD_TOPO = 'contas:voltar-topo';

function alinharNoTopo(sempre = false) {
  const marcado = (() => {
    try { return sessionStorage.getItem(RELOAD_TOPO) === '1'; }
    catch (e) { return false; }
  })();
  const precisa = sempre || marcado || window.scrollY > Math.max(40, window.innerHeight * 0.2);
  if (marcado) {
    try { sessionStorage.removeItem(RELOAD_TOPO); } catch (e) {}
  }
  if (!precisa) return;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function restaurarEstadoInicial() {
  const salvo = carregarEstadoTela();
  if (!salvo) return;
  if (salvo.aba && ABAS[salvo.aba]) V.aba = salvo.aba;
  if (Number.isFinite(+salvo.ano)) V.ano = +salvo.ano;
  if (Number.isFinite(+salvo.mes)) V.mes = +salvo.mes;
  if (salvo.moeda && MOEDAS[salvo.moeda]) S.moeda = salvo.moeda;
  if (salvo.viagemId !== undefined) V.viagemId = salvo.viagemId;
  if (salvo.viagemDiaSel !== undefined) V.viagemDiaSel = salvo.viagemDiaSel;
  if (salvo.diaSel !== undefined) V.diaSel = salvo.diaSel;
  if (salvo.viagemMoedas) V.viagemMoedas = salvo.viagemMoedas;
}

function snapshotEstadoTela() {
  salvarEstadoTela();
}

// ---------------------------------------------------------------------------
//  RENDER
// ---------------------------------------------------------------------------
export function render() {
  if (V.ano < A0 || (V.ano === A0 && V.mes < M0)) { V.ano = A0; V.mes = M0; }
  const noLimite = (V.ano === A0 && V.mes === M0);
  $('prev').style.opacity = noLimite ? .25 : 1;

  $('mesNome').textContent = MESES[V.mes - 1];
  $('anoNome').textContent = V.ano;

  // o cabeçalho lê do MESMO motor que o painel: não tem como discordarem
  const r = resumoMes();
  const fixasMes = r.ts.filter(t => t.fixoId);
  const faltaFixas = somaPendente(fixasMes);
  const pagoFixas = somaPago(fixasMes);
  const gastosMes = somaValor(diarioDoMes(V.ano, V.mes));
  const desembolsado = pagoFixas + gastosMes;

  $('hFalta').textContent = faltaFixas ? M(faltaFixas) : 'nada';
  $('hPago').textContent  = M(pagoFixas);
  $('hGastos').textContent = M(gastosMes);
  $('hDesemb').textContent = M(desembolsado);
  $('cMes').textContent   = r.nContas || '';
  $('cFix').textContent   = S.fixos.filter(f => f.ativo).length;
  $('cDia').textContent   = S.diario.filter(d => noMes(d, V.ano, V.mes)).length || '';
  $('ver').textContent    = VERSAO + ' · ' + S.tx.length + ' contas';
  $('fitaTitulo').textContent = V.aba === 'diario' ? 'Calendário Financeiro' : 'Vencimentos do mês';
  $('fitaLeg').textContent = V.aba === 'diario'
    ? 'clique em um dia para ver total, categorias e lançamentos daquele dia'
    : 'cheio = pago · vazio = a pagar · vermelho = vencido';
  const secaoFita = document.querySelector('.fita');
  const esconderFita = V.aba === 'viagem';
  if (secaoFita) secaoFita.hidden = esconderFita;

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
    V.aba === 'viagem' ? telaViagem() : V.aba === 'fixos'  ? telaFixos()  :
    V.aba === 'insights' ? telaInsights() : V.aba === 'diagnostico' ? telaDiagnostico() : telaDados();

  if (!esconderFita) fita();
  else $('dias').innerHTML = '';
  snapshotEstadoTela();
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
    if (!t) return;
    const antes = { st: t.st, pago: t.pago };
    if (t.st === 'Pago') { t.st = 'Pendente'; t.pago = 0; }
    else { t.st = 'Pago'; if (!t.pago) t.pago = t.est || 0; }
    render();                                    // responde na hora
    try { await contasApi.atualizar(t.id, t); }  // e confirma no banco
    catch (e) { Object.assign(t, antes); render(); toast(e.message || 'Não salvou'); }
  });

  document.querySelectorAll('[data-edit]').forEach(b =>
    b.onclick = () => {
      const t = S.tx.find(x => x.id === b.dataset.edit);
      if (t) form(t);
    });

  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const t = S.tx.find(x => x.id === b.dataset.del);
    if (!t) return;
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
    try {
      await fixosApi.ativar(f.id, c.checked);
      // após ativar/desativar, propaga imediatamente para ajustar lançamentos
      const f2 = S.fixos.find(x => x.id === f.id);
      try { await propagar(f2); } catch (e) { /* falha na propagação não bloqueia */ }
      render();
    } catch (e) { c.checked = !c.checked; toast(e.message); }
  });
  document.querySelectorAll('[data-fxdel]').forEach(b => b.onclick = async () => {
    const f = S.fixos[b.dataset.fxdel];
    if (!confirm(`Tirar "${f.conta}" das fixas?`)) return;
    try {
      // solta pendentes futuras e depois apaga a fixa
      await limparAoApagar(f.id);
      await fixosApi.apagar(f.id);
      render();
    } catch (e) { toast(e.message); }
  });
  on('gerar',    'onclick', gerarMes);
  on('gerarAno', 'onclick', gerarAno);
  on('novaFixa', 'onclick', () => formFixo(null));
  document.querySelectorAll('[data-fxed]').forEach(b =>
    b.onclick = () => formFixo(S.fixos[b.dataset.fxed]));

  // diagnostico: botao de execução da rotina
  const diagBtn = document.getElementById('diag_run');
  if (diagBtn) diagBtn.onclick = async () => {
    diagBtn.disabled = true; diagBtn.textContent = 'Sincronizando...';
    try { await executarSincronizacao(); } catch (e) { toast(e.message || 'Erro'); }
    diagBtn.disabled = false; diagBtn.textContent = 'Executar sincronização';
  };

  // dia a dia
  on('addD',  'onclick', () => formDiario(null));
  on('addD2', 'onclick', () => formDiario(null));
  on('addDday','onclick', () => formDiario(null));
  on('editMetaDiario', 'onclick', () => formMetaDiario());
  document.querySelectorAll('[data-ed]').forEach(b =>
    b.onclick = () => formDiario(S.diario.find(x => x.id === b.dataset.ed)));
  document.querySelectorAll('[data-ed-diario]').forEach(b =>
    b.onclick = () => formDiario(S.diario.find(x => x.id === b.dataset.edDiario)));
  document.querySelectorAll('[data-del-diario]').forEach(b =>
    b.onclick = async () => {
      const d = S.diario.find(x => x.id === b.dataset.delDiario);
      if (!d) return;
      if (!confirm(`Apagar "${d.desc}" de ${d.data.slice(8)}/${d.data.slice(5,7)}?`)) return;
      try { await despesasApi.apagar(d.id); render(); toast('Gasto apagado'); }
      catch (e) { toast(e.message || 'Não apagou'); }
    });
  document.querySelectorAll('[data-dia]').forEach(b => b.onclick = () => {
    const d = +b.dataset.dia;
    V.diaSel = V.diaSel === d ? null : d;
    render();
  });
  document.querySelectorAll('[data-fluxo-tip]').forEach(el => {
    const ativar = () => {
      document.querySelectorAll('.fluxo-bar-group.is-active').forEach(x => x.classList.remove('is-active'));
      el.classList.add('is-active');
    };
    el.onpointerenter = ativar;
    el.onpointerdown = () => {
      ativar();
      const t = el.dataset.fluxoTip;
      if (t) toast(t);
    };
    el.onpointerleave = () => {
      if (el.matches(':hover')) return;
      el.classList.remove('is-active');
    };
  });

  // viagem
  on('addH', 'onclick', () => formHosp(null));
  on('addG', 'onclick', () => formGasto(null));
  document.querySelectorAll('[data-eh]').forEach(b =>
    b.onclick = () => formHosp(viagemAtual()?.hosp.find(x => x.id === b.dataset.eh)));
  document.querySelectorAll('[data-eg]').forEach(b =>
    b.onclick = () => formGasto(b.dataset.eg));

  const viagemMostrarTodas = document.getElementById('viagemMostrarTodas');
  if (viagemMostrarTodas) {
    viagemMostrarTodas.onchange = () => { V.viagemMoedas = viagemMostrarTodas.checked ? 'todas' : 'atual'; render(); };
  }

  document.querySelectorAll('[data-vdia]').forEach(b => {
    b.onclick = () => { V.viagemDiaSel = b.dataset.vdia; render(); };
  });
  // trocar de viagem, criar e editar
  on('selViagem', 'onchange', e => { V.viagemId = e.target.value; render(); });
  on('novaViagem', 'onclick', () => formViagem(null));
  on('editarViagem', 'onclick', () => formViagem(viagemAtual()));

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
  on('expInsightsCsv', 'onclick', exportarInsightsCsv);
  on('expInsightsXls', 'onclick', exportarInsightsXls);
  on('expInsightsPdf', 'onclick', () => { try { imprimirInsights(); } catch (e) { toast(e.message || 'Não imprimiu'); } });
  on('expInsightsPrint', 'onclick', () => { try { imprimirInsights(); } catch (e) { toast(e.message || 'Não imprimiu'); } });

  on('semear', 'onclick', async () => {
    if (temBase() && !confirm('Sua conta já tem dados. Importar a base inicial vai duplicar. Continuar mesmo assim?')) return;
    const b = $('semear'); b.disabled = true;
    try {
      const r = await importarBase(txt => { b.textContent = txt; });
      await carregarTudo(); podar(); render();
      toast(`Base importada: ${r.contas} contas, ${r.gastos} gastos da viagem`);
    } catch (e) { toast(e.message || 'Não importou'); }
    finally { b.disabled = false; b.textContent = 'Importar base inicial'; }
  });

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
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  iniciarRelogio();          // uma vez só, no boot — nunca dentro do render()
  const s = await sessao();
  if (!s) { pedirLogin(); return; }

  document.getElementById('login').innerHTML = '';
  document.getElementById('login').hidden = true;
  document.getElementById('app').hidden = false;
  document.getElementById('carregando').hidden = false;
  restaurarEstadoInicial();
  alinharNoTopo(true);

  const carregarComRetry = async () => {
    try {
      return await carregarTudo();
    } catch (e) {
      const msg = String(e?.message || '');
      if (!/jwt|token|401|unauthorized/i.test(msg)) throw e;
      const { error } = await sb.auth.refreshSession();
      if (error) throw e;
      return await carregarTudo();
    }
  };

  try {
    const r = await carregarComRetry();
    podar();
    // primeiro login: nada no banco ainda
    if (r.contas === 0 && r.fixos === 0 && r.viagens === 0) V.aba = 'dados';
    // Vincula automaticamente lançamentos antigos sem fixo_id em background
    try {
      vincularTodasFixas().then(res => {
        if (res && res.total) {
          podar(); render(); toast(`${res.total} lançamento(s) antigo(s) vinculados automaticamente`);
        }
      }).catch(() => {});
    } catch (e) {}
  } catch (e) {
    document.getElementById('carregando').innerHTML =
      `<div class="vazio"><b style="color:var(--carimbo)">Não consegui falar com o Supabase</b>
       <p style="margin-top:6px">${esc(e.message)}</p>
       <p style="font-size:12px;margin-top:8px">Confira <code>js/config.js</code> e se o <code>schema.sql</code> já rodou.</p></div>`;
    return;
  }
  document.getElementById('carregando').hidden = true;
  render();
  alinharNoTopo();
}

sb.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT') location.reload();
});

iniciar();
