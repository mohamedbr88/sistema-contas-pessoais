// ============================================================================
//  Tela "Fixos" e a geração de meses a partir das contas recorrentes.
// ============================================================================

import { valeNoMes, vencimentoNoMes } from '../propagacao.js';
import { doMes } from './mes.js';
import { render } from '../bus.js';
import { MESES, S, V, cor, dia, esc, novoId } from '../estado.js';
import { M, VE } from '../moeda.js';
import { toast } from '../ui.js';

export function lancarFixos(ano,mes){
  const chave=`${ano}-${String(mes).padStart(2,'0')}`;
  // dedupe por fixo_id, não mais pelo TEXTO do nome: renomear a fixa não
  // duplica mais, e duas contas homônimas em locais diferentes não se confundem
  const jaTem=new Set(S.tx.filter(t=>t.data.slice(0,7)===chave&&t.fixoId).map(t=>t.fixoId));
  const nomes=new Set(S.tx.filter(t=>t.data.slice(0,7)===chave&&!t.fixoId).map(t=>t.conta.toLowerCase()));
  return S.fixos
    .filter(f=>valeNoMes(f,ano,mes))                       // respeita inicio/fim da fixa
    .filter(f=>!jaTem.has(f.id)&&!nomes.has(f.conta.toLowerCase()))
    .map(f=>({
      data:vencimentoNoMes(f,ano,mes),
      conta:f.conta,cat:f.cat,loc:f.loc,pg:f.pg,est:f.est,pago:0,st:'Pendente',obs:'',
      moeda:f.moeda||'BRL', fixoId:f.id}));
}
export async function empurrar(novos){ await contasApi.inserirVarias(novos); }
export async function gerarMes(){
  const novos=lancarFixos(V.ano,V.mes);
  if(!novos.length){toast('Todas as fixas já estão lançadas neste mês');return;}
  toast('Lançando…');
  try{ await empurrar(novos); V.aba='mes'; V.diaSel=null; render();
       toast(`${novos.length} conta(s) lançadas em ${MESES[V.mes-1]}`); }
  catch(e){ toast(e.message||'Não consegui lançar'); }
}
export async function gerarAno(){
  let novos=[], meses=0;
  for(let m=V.mes;m<=12;m++){ const n=lancarFixos(V.ano,m); if(n.length){meses++; novos.push(...n);} }
  if(!novos.length){toast(`De ${MESES[V.mes-1]} a dezembro já está tudo lançado`);return;}
  if(!confirm(`Lançar ${novos.length} contas a pagar em ${meses} mês(es), de ${MESES[V.mes-1]} a dezembro de ${V.ano}?\n\nTodas entram como "a pagar", com valor pago zerado. Você edita depois.`)) return;
  toast('Lançando no banco…');
  try{ await empurrar(novos); V.aba='mes'; V.diaSel=null; render();
       toast(`${novos.length} contas lançadas até dezembro`); }
  catch(e){ toast(e.message||'Não consegui lançar'); }
}


/** 'sempre' · 'a partir de ago/2026' · 'até dez/2026' · 'ago/2026 a dez/2026' */
function periodo(f){
  const mm = d => { const [a,m]=d.split('-'); return `${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][+m-1]}/${a}`; };
  if(!f.inicio && !f.fim) return 'sempre';
  if(f.inicio && !f.fim)  return `a partir de ${mm(f.inicio)}`;
  if(!f.inicio && f.fim)  return `até ${mm(f.fim)}`;
  return `${mm(f.inicio)} a ${mm(f.fim)}`;
}

export function telaFixos(){
  const ativos=S.fixos.filter(f=>f.ativo);
  const jaTem=doMes().length;
  return `<div class="card">
    <div class="card-hd"><h3>Contas fixas do mês</h3>
      <div class="dir">
        <button class="btn-2" id="novaFixa">+ Nova fixa</button>
        <span class="mono" style="font-size:12px;color:var(--ink-2)">${ativos.length} ativas · ${M(ativos.reduce((s,f)=>s+(f.est||0),0))}/mês</span>
        <button class="btn-2" id="gerar">Só em ${MESES[V.mes-1]}</button>
        <button class="btn-cofre btn" id="gerarAno">Lançar de ${MESES[V.mes-1]} até dezembro</button>
      </div></div>
    <div style="padding:9px 14px;font-size:12.5px;color:var(--ink-2);border-bottom:1px solid var(--line)">
      ${(()=>{const f=[];for(let m=V.mes;m<=12;m++)if(lancarFixos(V.ano,m).length)f.push(MESES[m-1]);
        return f.length?`Faltam lançar em: <b style="color:var(--ink)">${f.join(', ')}</b>. Tudo entra como <b style="color:var(--ink)">a pagar</b>, com valor zerado — você edita cada uma quando pagar. Nada duplica o que já existe.`
                       :`De ${MESES[V.mes-1]} a dezembro de ${V.ano} já está tudo lançado.`;})()}
    </div>
    <div style="overflow-x:auto"><table><thead><tr><th style="width:44px">Ativa</th><th>Conta</th><th class="num" style="width:56px">Dia</th>
      <th>Categoria</th><th>Local · Pgto</th><th>Período</th><th class="num">Valor por mês</th><th style="width:96px"></th></tr></thead>
    <tbody>${S.fixos.map((f,i)=>`<tr style="opacity:${f.ativo?1:.42}">
      <td><input type="checkbox" data-fx="${i}" ${f.ativo?'checked':''} aria-label="Ativar ${esc(f.conta)}"></td>
      <td>${esc(f.conta)}</td><td class="num">${f.dia}</td>
      <td><span class="pill" style="background:${cor(f.cat)}1A;color:${cor(f.cat)}">${esc(f.cat)}</span></td>
      <td style="font-size:12px;color:var(--ink-2)">${esc(f.loc)}${f.pg?' · '+esc(f.pg):''}</td>
      <td style="font-size:11px;color:var(--ink-2)">${periodo(f)}</td>
      <td class="num">${f.est?VE(f.est,f.moeda||'BRL'):'—'}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="acao" data-fxed="${i}">editar</button>
        <button class="acao del" data-fxdel="${i}">apagar</button></td></tr>`).join('')}
    </tbody></table></div></div>`;
}
