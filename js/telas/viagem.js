// ============================================================================
//  Tela "Viagem": hospedagem e gastos do dia, na moeda da viagem.
// ============================================================================

import { CATD, PAGD, S, V, STATUS, cor, dia, esc, viagemAtual } from '../estado.js';
import { M, MOEDAS, VE } from '../moeda.js';
import { formGen } from '../ui.js';
import { viagemApi } from '../api.js';

export function telaViagem(){
  const v=viagemAtual();
  // primeira vez: sem viagem nenhuma. Convite, não beco sem saída.
  if(!v) return `<div class="card"><div class="vazio">
      <b style="color:var(--ink);font-size:15px">Nenhuma viagem ainda</b>
      <p style="margin:6px 0 14px">Crie uma viagem para lançar hospedagem e gastos do dia.</p>
      <button class="btn btn-cofre" id="novaViagem">+ Nova viagem</button></div></div>`;
  const th=v.hosp.reduce((s,h)=>s+(h.valor||0),0), tg=v.gastos.reduce((s,g)=>s+(g.valor||0),0);
  const noites=v.hosp.reduce((s,h)=>s+(h.noites||1),0);
  const dias=Math.round((new Date(v.fim)-new Date(v.inicio))/864e5)+1;
  const mo=v.moeda||'EUR';        // a moeda em que ESTA viagem foi paga
  const cxv=v.cambio||S.cambio||1; // o câmbio travado NESTA viagem (etapa 2 preenche do banco)
  const porCat=CATD.map(c=>({k:c,v:v.gastos.filter(g=>g.cat===c).reduce((s,g)=>s+g.valor,0)})).filter(x=>x.v).sort((a,b)=>b.v-a.v);
  const maxC=Math.max(...porCat.map(x=>x.v),1);
  const porDia={}; v.gastos.forEach(g=>{porDia[g.data]=(porDia[g.data]||0)+g.valor;});
  const maxD=Math.max(...Object.values(porDia),1);
  const dd=(x)=>x.slice(8)+'/'+x.slice(5,7);
  const vs=[...S.viagens].sort((a,b)=>b.inicio.localeCompare(a.inicio));
  return `<div class="card"><div class="card-hd"><h3>${esc(v.destino||v.nome)} · ${dd(v.inicio)} a ${dd(v.fim)} · ${dias} dias</h3>
      <div class="dir">
        ${vs.length>1?`<select id="selViagem" title="Trocar de viagem">${vs.map(x=>
          `<option value="${x.id}" ${x.id===v.id?'selected':''}>${esc(x.nome)}</option>`).join('')}</select>`:''}
        <button class="btn-2" id="novaViagem">+ Nova viagem</button>
      </div></div>
    <div class="viagem-sub">
      <span class="pastilha" style="--c:${v.status==='em_viagem'?'var(--cofre)':v.status==='planejamento'?'var(--azul)':'var(--ink-2)'}">${STATUS[v.status]||v.status}</span>
      <span class="mono">valores exibidos em ${MOEDAS[S.moeda||'BRL'].n} · original em ${MOEDAS[mo].n} · câmbio R$ ${cxv.toFixed(2)} / ${MOEDAS[mo].n}</span>
      ${v.orcamento?`<span class="mono">orçamento ${M(v.orcamento,mo)}</span>`:''}
      <button class="lnk" id="editarViagem">editar viagem</button>
    </div>
    <div class="kpis">
      <div class="kpi"><span>Hospedagem</span><b>${M(th,mo)}</b><small>${noites} noites · ${M(th/(noites||1),mo)}/noite</small></div>
      <div class="kpi"><span>Gastos do dia</span><b>${M(tg,mo)}</b><small>${v.gastos.length} lançamentos</small></div>
      <div class="kpi"><span>Total da viagem</span><b style="color:var(--cofre)">${M(th+tg,mo)}</b><small>${dias} dias</small></div>
      <div class="kpi"><span>Por dia</span><b>${M((th+tg)/dias,mo)}</b><small>hosp ${M(th/(noites||1),mo)} + dia ${M(tg/dias,mo)}</small></div>
    </div></div>
    <div class="grid2">
      <div class="card"><div class="card-hd"><h3>Onde foi o dinheiro</h3></div>
        <div style="padding:8px 0 12px">${!porCat.length?`<div class="vazio" style="padding:26px 16px">Nada gasto ainda.<br>As barras aparecem no primeiro lançamento.</div>`:''}${porCat.map(x=>`<div class="barra"><div class="lab">${esc(x.k)}</div>
          <div class="trilho"><div class="fill" style="width:${x.v/maxC*100}%;background:${cor(x.k)}"></div></div>
          <div class="v">${M(x.v,mo)}</div></div>`).join('')}</div></div>
      <div class="card"><div class="card-hd"><h3>Gasto por dia</h3><div class="dir" style="font-size:11px;color:var(--ink-2)">só o dia a dia, sem hospedagem</div></div>
        <div style="padding:10px 14px;display:flex;gap:2px;align-items:flex-end;height:120px">
          ${!Object.keys(porDia).length?`<div class="vazio" style="width:100%;padding:26px 16px">Sem gasto lançado.</div>`:''}
          ${Object.keys(porDia).sort().map(d=>`<div title="${dd(d)} · ${M(porDia[d],mo)}" style="flex:1;background:var(--cofre);opacity:.75;border-radius:2px 2px 0 0;height:${porDia[d]/maxD*100}%"></div>`).join('')}
        </div><div style="padding:0 14px 10px;font-size:10px;color:var(--ink-2);display:flex;justify-content:space-between">
          <span class="mono">${dd(v.inicio)}</span><span class="mono">maior dia: ${M(maxD,mo)}</span><span class="mono">${dd(v.fim)}</span></div></div>
    </div>
    <div class="card"><div class="card-hd"><h3>Hospedagem</h3>
      <div class="dir"><span class="mono" style="font-size:12px;color:var(--ink-2)">${M(th,mo)}</span><button class="btn-2" id="addH">+ Estadia</button></div></div>
      <table class="tmes"><thead><tr><th>Entrada</th><th>Hotel</th><th>Cidade</th><th class="num">Noites</th>
        <th class="num">Valor (${MOEDAS[S.moeda||'BRL'].n})</th><th class="num">Por noite</th><th></th><th></th></tr></thead>
      <tbody>${!v.hosp.length?`<tr><td colspan="8" class="vazio" style="padding:22px">Nenhuma hospedagem ainda. Use <b style="color:var(--ink)">+ Estadia</b>.</td></tr>`:''}${v.hosp.slice().sort((a,b)=>a.data.localeCompare(b.data)).map((h,i)=>`<tr class="lin" style="--c:${cor('Hospedagem')}">
        <td class="mono" style="font-size:12px;color:var(--ink-2)">${dd(h.data)}</td>
        <td>${esc(h.nome)}</td><td style="font-size:12px;color:var(--ink-2)">${esc(h.cidade)}</td>
        <td class="num">${h.noites}</td><td class="num" style="font-weight:600">${M(h.valor,mo)}</td>
        <td class="num" style="font-size:12px;color:var(--ink-2)">${M(h.valor/(h.noites||1),mo)}</td><td></td>
        <td style="text-align:right"><button class="acao" data-eh="${h.id}">editar</button></td></tr>`).join('')}</tbody>
      <tfoot><tr class="tot"><td colspan="3">${v.hosp.length} estadias</td><td class="num">${noites}</td>
        <td class="num">${M(th,mo)}</td><td class="num">${M(th/(noites||1),mo)}</td><td colspan="2"></td></tr></tfoot></table></div>
    <div class="card"><div class="card-hd"><h3>Gastos do dia</h3>
      <div class="dir"><span class="mono" style="font-size:12px;color:var(--ink-2)">${M(tg,mo)}</span><button class="btn" id="addG">+ Gasto</button></div></div>
      <div style="max-height:520px;overflow:auto"><table class="tmes"><thead><tr><th>Dia</th><th>O quê</th><th>Categoria</th><th>Pgto</th>
        <th class="num">Valor (${MOEDAS[S.moeda||'BRL'].n})</th><th class="num">Original (${MOEDAS[mo].n})</th><th></th><th></th></tr></thead>
      <tbody>${!v.gastos.length?`<tr><td colspan="8" class="vazio" style="padding:22px">Nenhum gasto ainda. Use <b style="color:var(--ink)">+ Gasto</b>.</td></tr>`:''}${v.gastos.slice().sort((a,b)=>a.data.localeCompare(b.data)).map((g,i)=>`<tr class="lin" style="--c:${cor(g.cat)}">
        <td class="mono" style="font-size:12px;color:var(--ink-2)">${dd(g.data)}</td>
        <td>${esc(g.desc)}</td><td><span class="pill" style="background:${cor(g.cat)}1A;color:${cor(g.cat)}">${esc(g.cat)}</span></td>
        <td style="font-size:12px;color:var(--ink-2)">${esc(g.pg)}</td>
        <td class="num" style="font-weight:600">${M(g.valor,mo)}</td>
        <td class="num" style="font-size:12px;color:var(--ink-2)">${VE(g.valor,mo)}</td><td></td>
        <td style="text-align:right"><button class="acao" data-eg="${g.id}">editar</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
export function formHosp(h){
  const v=viagemAtual(), novo=!h;
  if(!v) return;
  h=h||{data:v.inicio,nome:'',cidade:'',noites:1,valor:0};
  formGen(novo?'Nova estadia':'Editar estadia',[
    {k:'nome',l:'Hotel / apartamento'},{k:'cidade',l:'Cidade'},{k:'data',l:'Entrada',tipo:'date'},
    {k:'noites',l:'Noites',tipo:'number'},{k:'valor',l:`Valor em ${MOEDAS[v.moeda||'EUR'].n} — a moeda desta viagem`,tipo:'number'},
  ], h, async o=>{ o.noites=Math.max(1,Math.round(o.noites));
    if(novo) await viagemApi.addHosp(v.id, o);
    else     await viagemApi.editHosp(h.id, o);
  }, novo ? null : async()=>{ await viagemApi.delHosp(h.id); });
}
export function formGasto(id){
  const v=viagemAtual(), novo=id==null;
  if(!v) return;
  const g=novo?{data:v.inicio,desc:'',cat:'Restaurante',pg:'Cartão',valor:0}:v.gastos.find(x=>x.id===id);
  formGen(novo?'Novo gasto da viagem':'Editar gasto',[
    {k:'desc',l:'O quê'},{k:'data',l:'Dia',tipo:'date'},{k:'valor',l:`Valor em ${MOEDAS[v.moeda||'EUR'].n} — moeda da viagem`,tipo:'number'},
    {k:'cat',l:'Categoria',tipo:'select',opts:CATD},{k:'pg',l:'Pagamento',tipo:'select',opts:PAGD},
  ], g, async o=>{
    if(novo) await viagemApi.addGasto(v.id, o);
    else     await viagemApi.editGasto(g.id, o);
  }, novo ? null : async()=>{ await viagemApi.delGasto(g.id); });
}
