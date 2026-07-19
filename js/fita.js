// ============================================================================
//  A fita de vencimentos: os dias do mês com um traço por conta.
// ============================================================================

import { render } from './bus.js';
import { S, V, dia, hojeISO, val, vencido } from './estado.js';
import { M } from './moeda.js';

export function fita(){
  const el=document.getElementById('dias');
  const nd=new Date(V.ano,V.mes,0).getDate();
  let h='';
  for(let d=1;d<=nd;d++){
    const iso=`${V.ano}-${String(V.mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const ts=S.tx.filter(t=>t.data===iso);
    const ticks=ts.slice(0,7).map(t=>`<i class="tick ${vencido(t)?'venc':(t.st==='Pago'?'':'pend')}"></i>`).join('');
    h+=`<button class="dia ${iso===hojeISO?'hoje':''}" data-d="${d}" aria-pressed="${V.diaSel===d}"
        title="${ts.length?ts.length+' conta(s) · '+M(ts.reduce((s,t)=>s+val(t),0)):'sem contas'}">
        <div class="barras">${ticks}</div><span class="n">${d}</span></button>`;
  }
  el.innerHTML=h;
  el.querySelectorAll('.dia').forEach(b=>b.onclick=()=>{
    const d=+b.dataset.d;
    V.diaSel = (V.diaSel===d?null:d);
    if (V.aba !== 'diario') V.aba='mes';
    render();
  });
}
