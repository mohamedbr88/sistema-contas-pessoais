import { S } from '../estado.js?v=20260720-6';
import { carregarTudo } from '../api.js';
import { propagar, vincularTodasFixas, atualizarLancamentosVinculados } from '../propagacao.js';
import { render } from '../bus.js';
import { M } from '../moeda.js';

function fmtMoney(v, de){ return (v==null)?'':M(v, de || 'BRL'); }

export function telaDiagnostico() {
  const diag = S.__diagnostico || {};
  const nFixos = S.fixos.length;
  const vinculados = S.tx.filter(t=>t.fixoId).length;
  const semFixo = S.tx.filter(t=>!t.fixoId).length;
  const atualizadosMes = diag.atualizadosMes || 0;
  const atualizadosFuturos = diag.atualizadosFuturos || 0;
  const falta = diag.resumo && diag.resumo.pendente ? fmtMoney(diag.resumo.pendente) : '';
  const contasMes = diag.resumo && diag.resumo.estimado ? fmtMoney(diag.resumo.estimado) : '';
  const painel = diag.resumo ? fmtMoney((diag.resumo.pendente||0)-(diag.resumo.pago||0)) : '';
  const last = diag.lastSync || '';
  const lista = diag.lastChanged || [];

  return `
    <div class="diagnostico">
      <h3>Diagnóstico</h3>
      <div class="campos">
        <div><b>Contas fixas:</b> ${nFixos}</div>
        <div><b>Lançamentos vinculados:</b> ${vinculados}</div>
        <div><b>Lançamentos sem fixo_id:</b> ${semFixo}</div>
        <div><b>Atualizados (mês atual):</b> ${atualizadosMes}</div>
        <div><b>Atualizados (futuros):</b> ${atualizadosFuturos}</div>
        <div><b>Falta a pagar:</b> ${falta}</div>
        <div><b>Contas do Mês (estimado):</b> ${contasMes}</div>
        <div><b>Painel (dif):</b> ${painel}</div>
        <div><b>Última sincronização:</b> ${last}</div>
      </div>
      <div style="margin-top:12px"><button id="diag_run" class="btn">Executar sincronização</button></div>
      <h4 style="margin-top:14px">Últimas alterações</h4>
      <div id="diag_list">
        <table style="width:100%"><thead><tr><th>ID</th><th>Data</th><th>Conta</th><th>Est</th><th>Moeda</th></tr></thead>
        <tbody>
          ${lista.map(x=>`<tr><td>${x.id}</td><td>${x.data||''}</td><td>${x.conta||''}</td><td>${x.est==null?'':fmtMoney(x.est, x.moeda || 'BRL')}</td><td>${x.moeda||''}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;
}

export async function executarSincronizacao() {
  // safe: para cada fixa, chama propagar e atualiza lançamentos vinculados
  const resultado = { totalFixos: 0, totalVinculadosAtualizados: 0, atualizadosIds: [] };
  for (const f of S.fixos) {
    resultado.totalFixos++;
    try {
      await propagar(f, { reload: false });
      const r = await atualizarLancamentosVinculados(f);
      if (r && r.atualizados) {
        resultado.totalVinculadosAtualizados += r.atualizados;
        resultado.atualizadosIds.push(...r.ids);
      }
    } catch (e) { console.warn('sincronizacao: erro para fixa', f.id, e && e.message); }
  }
  // recarrega tudo uma vez
  try { await carregarTudo(); } catch (e) { /*ignore*/ }
  S.__diagnostico = S.__diagnostico || {};
  S.__diagnostico.lastSync = new Date().toISOString();
  S.__diagnostico.lastChanged = resultado.atualizadosIds.map(id => {
    const t = S.tx.find(x=>x.id===id); return t ? { id:t.id, data:t.data, conta:t.conta, est:t.est, moeda:t.moeda } : { id };
  });
  S.__diagnostico.atualizadosMes = S.__diagnostico.lastChanged.filter(x=>x.data && x.data.slice(0,7) === new Date().toISOString().slice(0,7)).length;
  S.__diagnostico.atualizadosFuturos = S.__diagnostico.lastChanged.length - S.__diagnostico.atualizadosMes;
  try { const calc = await import('../js/calculos.js'); S.__diagnostico.resumo = calc.resumoMes(S.__diagnostico.lastSync ? new Date().getFullYear() : new Date().getFullYear(), (new Date()).getMonth()+1); } catch(e){}
  render();
  return S.__diagnostico;
}
