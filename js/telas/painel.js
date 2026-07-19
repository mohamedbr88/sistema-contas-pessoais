// ============================================================================
//  Tela "Painel": indicadores do mês, vencidas, barras por categoria e local.
// ============================================================================

import { resumoMes, agrupar, somaEstimado } from '../calculos.js?v=20260719-3';
import { doMes } from './mes.js';
import { CATS, LOCS, V, cor, dia, esc, vencido } from '../estado.js';
import { M, Mc } from '../moeda.js';

export function telaPainel(){
  const r=resumoMes();
  const ts=r.ts, est=r.estimado, pago=r.pago, pend=r.pendente, venc=r.vencidas;
  const grupo=(campo,lista)=>agrupar(ts,campo,lista);
  const barras=(g,campo)=>{const max=Math.max(...g.map(x=>Math.max(x.p,x.e)),1);
    return g.map(x=>`<div class="barra"><div class="lab" title="${esc(x.k)}">${esc(x.k)}</div>
      <div class="trilho"><div class="fill" style="width:${x.p/max*100}%;background:${campo==='cat'?cor(x.k):'var(--cofre)'}"></div><div class="fill fill-p" style="width:${Math.max(0,x.e-x.p)/max*100}%"></div></div>
      <div class="v">${Mc(x.p)}</div></div>`).join('');};
  return `<div class="card"><div class="kpis">
      <div class="kpi"><span>Estimado</span><b>${Mc(est)}</b></div>
      <div class="kpi"><span>Pago</span><b style="color:var(--cofre)">${Mc(pago)}</b><small>${r.nPagas} conta(s) paga(s)</small></div>
      <div class="kpi"><span>Falta pagar</span><b style="color:${pend?'var(--carimbo)':'var(--ink-2)'}">${Mc(pend)}</b><small>${r.nPendentes} conta(s)</small></div>
      <div class="kpi"><span>Pago − estimado</span><b style="color:${pago>est?'var(--carimbo)':'var(--ink-2)'}">${pago>est?'+':''}${Mc(pago-est)}</b></div>
    </div></div>
    ${venc.length?`<div class="card" style="border-color:var(--carimbo)">
      <div class="card-hd" style="border-color:var(--carimbo-2)"><h3 style="color:var(--carimbo)">Vencidas · ${venc.length}</h3>
      <div class="dir mono" style="color:var(--carimbo);font-weight:600">${M(somaEstimado(venc))}</div></div>
      <table><tbody>${venc.sort((a,b)=>a.data.localeCompare(b.data)).map(t=>`<tr>
        <td class="mono" style="width:52px;font-size:12px;color:var(--carimbo)">${dia(t)}/${String(V.mes).padStart(2,'0')}</td>
        <td>${esc(t.conta)}</td><td class="num">${M(t.est)}</td>
        <td style="width:96px;text-align:right"><button class="btn-2" data-toggle="${t.id}">marcar pago</button></td></tr>`).join('')}</tbody></table></div>`:''}
    <div class="grid2">
      <div class="card"><div class="card-hd"><h3>Por categoria</h3><div class="dir" style="font-size:11px;color:var(--ink-2)">barra cheia = pago · hachura = a pagar</div></div>
        <div style="padding:8px 0 12px">${barras(grupo('cat',CATS),'cat')||'<div class="vazio">Sem lançamentos neste mês.</div>'}</div></div>
      <div class="card"><div class="card-hd"><h3>Por local</h3></div>
        <div style="padding:8px 0 12px">${barras(grupo('loc',LOCS),'loc')||'<div class="vazio">Sem lançamentos neste mês.</div>'}</div></div>
    </div>`;
}
