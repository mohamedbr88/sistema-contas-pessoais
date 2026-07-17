// ============================================================================
//  Tela "Dia a dia": gasto solto do mês (mercado, restaurante, uber).
// ============================================================================

import { doMes } from './mes.js';
import { CATD, MESES, PAGD, S, V, cor, dia, esc, hojeISO, noMes } from '../estado.js';
import { M, Mc, outra } from '../moeda.js';
import { formGen } from '../ui.js';
import { despesasApi } from '../api.js';

export function telaDiario(){
  const ds=S.diario.filter(d=>noMes(d,V.ano,V.mes)).sort((a,b)=>b.data.localeCompare(a.data)||b.id-a.id);
  const tot=ds.reduce((s,d)=>s+(d.valor||0),0);
  const dias=new Set(ds.map(d=>d.data)).size;
  const porCat=CATD.map(c=>({k:c,v:ds.filter(d=>d.cat===c).reduce((s,d)=>s+d.valor,0)})).filter(x=>x.v).sort((a,b)=>b.v-a.v);
  const max=Math.max(...porCat.map(x=>x.v),1);
  const contasMes=doMes().reduce((s,t)=>s+(t.pago||0),0);
  return `<div class="card"><div class="kpis">
      <div class="kpi"><span>Gasto do dia a dia</span><b>${Mc(tot)}</b><small>${ds.length} lançamento(s)</small></div>
      <div class="kpi"><span>Por dia</span><b>${Mc(dias?tot/dias:0)}</b><small>${dias} dia(s) com gasto</small></div>
      <div class="kpi"><span>Contas do mês</span><b>${Mc(contasMes)}</b><small>as fixas, pagas</small></div>
      <div class="kpi"><span>Tudo somado</span><b style="color:var(--cofre)">${Mc(tot+contasMes)}</b><small>dia a dia + contas</small></div>
    </div></div>
    ${porCat.length?`<div class="card"><div class="card-hd"><h3>Onde foi, em ${MESES[V.mes-1]}</h3></div>
      <div style="padding:8px 0 12px">${porCat.map(x=>`<div class="barra"><div class="lab">${esc(x.k)}</div>
        <div class="trilho"><div class="fill" style="width:${x.v/max*100}%;background:${cor(x.k)}"></div></div>
        <div class="v">${Mc(x.v)}</div></div>`).join('')}</div></div>`:''}
    <div class="card"><div class="card-hd"><h3>Lançamentos de ${MESES[V.mes-1]}</h3>
      <div class="dir"><button class="btn" id="addD">+ Novo gasto</button></div></div>
    ${ds.length?`<table class="tmes"><thead><tr><th>Dia</th><th>O quê</th><th>Categoria</th><th>Pgto</th><th class="num">Valor</th><th></th><th></th><th></th></tr></thead>
      <tbody>${ds.map(d=>`<tr class="lin" style="--c:${cor(d.cat)}">
        <td class="mono" style="font-size:12px;color:var(--ink-2)">${d.data.slice(8)}/${d.data.slice(5,7)}</td>
        <td>${esc(d.desc)}</td>
        <td><span class="pill" style="background:${cor(d.cat)}1A;color:${cor(d.cat)}">${esc(d.cat)}</span></td>
        <td style="font-size:12px;color:var(--ink-2)">${esc(d.pg)}</td>
        <td class="num" style="font-weight:600">${M(d.valor)}</td><td></td><td></td>
        <td style="text-align:right"><button class="acao" data-ed="${d.id}">editar</button></td></tr>`).join('')}</tbody>
      <tfoot><tr class="tot"><td colspan="4">${ds.length} gasto(s)</td><td class="num">${M(tot)}</td><td colspan="3"></td></tr></tfoot></table>`
    :`<div class="vazio"><b style="color:var(--ink);font-size:15px">Nada lançado em ${MESES[V.mes-1]}</b>
      <p style="margin:6px 0 14px">Aqui vai o gasto solto do dia: mercado, restaurante, uber, farmácia. As contas fixas ficam na outra V.aba.</p>
      <button class="btn btn-cofre" id="addD2">+ Primeiro gasto</button></div>`}
    </div>`;
}
export function formDiario(d){
  const novo=!d;
  d=d||{id:0,data:hojeISO.slice(0,8)+String(Math.min(new Date().getDate(),new Date(V.ano,V.mes,0).getDate())).padStart(2,'0'),desc:'',cat:'Restaurante',pg:'Cartão',valor:0};
  if(novo) d.data=`${V.ano}-${String(V.mes).padStart(2,'0')}-${d.data.slice(8)}`;
  formGen(novo?'Novo gasto do dia':'Editar gasto',[
    {k:'desc',l:'O quê',ph:'Ex.: Mercado, Uber, jantar'},
    {k:'data',l:'Dia',tipo:'date'},
    {k:'valor',l:'Valor em R$ (moeda do dia a dia)',tipo:'number'},
    {k:'cat',l:'Categoria',tipo:'select',opts:CATD},
    {k:'pg',l:'Pagamento',tipo:'select',opts:PAGD},
  ], d, async o=>{
    if(novo) await despesasApi.inserir(o);
    else     await despesasApi.atualizar(d.id, o);
  }, novo ? null : async()=>{ await despesasApi.apagar(d.id); });
}
