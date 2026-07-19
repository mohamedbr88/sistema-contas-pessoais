// ============================================================================
//  Tela "Contas do mês": lista, filtros, ordenação por coluna.
// ============================================================================

import { contasDoMes, somaEstimado, somaPago } from '../calculos.js?v=20260719-2';
import { CATS, LOCS, MESES, PAGS, S, V, cor, dia, esc, noMes, vencido } from '../estado.js';
import { M } from '../moeda.js';

// mantido como apelido: meia dúzia de telas já importam doMes daqui
export const doMes = () => contasDoMes();

export function telaMes(){
  let ts=doMes();
  if(V.diaSel) ts=ts.filter(t=>dia(t)===V.diaSel);
  if(V.filtro.q){const q=V.filtro.q.toLowerCase();ts=ts.filter(t=>((t.conta||'')+' '+(t.obs||'')).toLowerCase().includes(q));}
  if(V.filtro.cat) ts=ts.filter(t=>t.cat===V.filtro.cat);
  if(V.filtro.loc) ts=ts.filter(t=>t.loc===V.filtro.loc);
  if(V.filtro.pg) ts=ts.filter(t=>(t.pg||'—')===V.filtro.pg);
  if(V.filtro.st) ts=ts.filter(t=>V.filtro.st==='Vencido'?vencido(t):t.st===V.filtro.st);
  const txt=(a,b,c)=>String(a[c]||'').localeCompare(String(b[c]||''),'pt-BR');
  const cmp={ data:(a,b)=>a.data.localeCompare(b.data), conta:(a,b)=>txt(a,b,'conta'),
    cat:(a,b)=>txt(a,b,'cat'), loc:(a,b)=>txt(a,b,'loc')||txt(a,b,'pg'), pg:(a,b)=>txt(a,b,'pg')||txt(a,b,'conta'),
    est:(a,b)=>(a.est||0)-(b.est||0), pago:(a,b)=>(a.pago||0)-(b.pago||0), st:(a,b)=>txt(a,b,'st') };
  ts.sort((a,b)=>(cmp[V.ord.col](a,b)*V.ord.dir)||a.conta.localeCompare(b.conta,'pt-BR'));

  const linhas=ts.map(t=>`<tr class="lin" style="--c:${cor(t.cat)}">
    <td class="mono" style="font-size:12px;color:var(--ink-2)">${dia(t)}/${String(V.mes).padStart(2,'0')}</td>
    <td><b style="font-weight:500">${esc(t.conta)}</b>${t.obs?`<div style="font-size:11px;color:var(--ink-2);margin-top:1px">${esc(t.obs)}</div>`:''}</td>
    <td><span class="pill" style="background:${cor(t.cat)}1A;color:${cor(t.cat)}">${esc(t.cat)}</span></td>
    <td style="font-size:12px;color:var(--ink-2)">${esc(t.loc)}${t.pg?' · '+esc(t.pg):''}</td>
    <td class="num" style="color:var(--ink-2);font-size:12px">${t.est?M(t.est):'—'}</td>
    <td class="num" style="font-weight:600">${t.pago?M(t.pago):'—'}</td>
    <td><button class="st ${vencido(t)?'st-venc':(t.st==='Pago'?'st-pago':'st-pend')}" data-toggle="${t.id}"
        title="Marcar como ${t.st==='Pago'?'a pagar':'pago'}">${vencido(t)?'vencido':(t.st==='Pago'?'pago':'a pagar')}</button></td>
    <td style="text-align:right;white-space:nowrap">
      <button class="acao" data-edit="${t.id}">editar</button>
      <button class="acao del" data-del="${t.id}">apagar</button></td>
  </tr>`).join('');

  const somaE=somaEstimado(ts), somaP=somaPago(ts);
  return `<div class="card">
    <div class="card-hd">
      <div class="filtros">
        <input type="search" id="fq" placeholder="Buscar conta…" value="${esc(V.filtro.q)}">
        <select id="fcat"><option value="">Toda categoria</option>${CATS.map(c=>`<option value="${esc(c)}" ${V.filtro.cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
        <select id="floc"><option value="">Todo local</option>${LOCS.map(c=>`<option value="${esc(c)}" ${V.filtro.loc===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
        <select id="fpg"><option value="">Todo pagamento</option>${PAGS.filter(p=>p).concat('—').map(c=>`<option value="${esc(c)}" ${V.filtro.pg===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
        <select id="fst"><option value="">Todo status</option>${['Pago','Pendente','Vencido'].map(c=>`<option value="${esc(c)}" ${V.filtro.st===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
        ${V.diaSel?`<button class="btn-2" id="limpaDia">dia ${V.diaSel} ✕</button>`:''}
      </div>
      <div class="dir"><button class="btn" id="add">+ Nova conta</button></div>
    </div>
    ${ts.length?`<table class="tmes"><thead><tr>${[['data','Venc.',''],['conta','Conta',''],['cat','Categoria',''],
      ['loc','Local · Pgto',''],['est','Estimado','num'],['pago','Pago','num'],['st','Status','']]
      .map(([c,r,k])=>`<th class="${k} V.ord ${V.ord.col===c?'on':''}" data-o="${c}">${r}${V.ord.col===c?(V.ord.dir>0?' ↑':' ↓'):''}</th>`).join('')}<th></th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr class="tot"><td colspan="4">${ts.length} conta${ts.length>1?'s':''}</td>
        <td class="num">${M(somaE)}</td><td class="num">${M(somaP)}</td><td colspan="2"></td></tr></tfoot></table>`
      :(doMes().length?`<div class="vazio">Nenhuma conta com esses filtros.<br><br><button class="btn" id="add2">+ Nova conta</button></div>`
        :`<div class="vazio"><b style="color:var(--ink);font-size:15px">${MESES[V.mes-1]} de ${V.ano} está vazio</b>
          <p style="margin:6px 0 14px">Lance aqui as ${S.fixos.filter(f=>f.ativo).length} contas fixas de julho — mesmas descrições e estimativas, com o valor pago zerado.</p>
          <button class="btn btn-cofre" id="gerarAqui">Lançar as fixas em ${MESES[V.mes-1]}</button>
          <button class="btn-2" id="add2" style="margin-left:6px">+ Nova conta</button></div>`)}
  </div>`;
}
