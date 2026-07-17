// ============================================================================
//  Tela "Fixos" e a geração de meses a partir das contas recorrentes.
// ============================================================================

import { doMes } from './mes.js';
import { render } from '../bus.js';
import { MESES, S, V, cor, dia, esc, novoId } from '../estado.js';
import { M } from '../moeda.js';
import { formGen, toast } from '../ui.js';
import { contasApi, fixosApi } from '../api.js';

export function lancarFixos(ano,mes){
  const chave=`${ano}-${String(mes).padStart(2,'0')}`;
  const tem=new Set(S.tx.filter(t=>t.data.slice(0,7)===chave).map(t=>t.conta.toLowerCase()));
  const nd=new Date(ano,mes,0).getDate();
  return S.fixos.filter(f=>f.ativo&&!tem.has(f.conta.toLowerCase())).map(f=>({
    data:`${chave}-${String(Math.min(f.dia,nd)).padStart(2,'0')}`,
    conta:f.conta,cat:f.cat,loc:f.loc,pg:f.pg,est:f.est,pago:0,st:'Pendente',obs:''}));
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


export function telaFixos(){
  const ativos=S.fixos.filter(f=>f.ativo);
  const jaTem=doMes().length;
  return `<div class="card">
    <div class="card-hd"><h3>Contas fixas do mês</h3>
      <div class="dir">
        <span class="mono" style="font-size:12px;color:var(--ink-2)">${ativos.length} ativas · ${M(ativos.reduce((s,f)=>s+(f.est||0),0))}/mês</span>
        <button class="btn-2" id="addFixo">+ Nova fixa</button>
        <button class="btn-2" id="gerar">Só em ${MESES[V.mes-1]}</button>
        <button class="btn-cofre btn" id="gerarAno">Lançar de ${MESES[V.mes-1]} até dezembro</button>
      </div></div>
    <div style="padding:9px 14px;font-size:12.5px;color:var(--ink-2);border-bottom:1px solid var(--line)">
      ${(()=>{const f=[];for(let m=V.mes;m<=12;m++)if(lancarFixos(V.ano,m).length)f.push(MESES[m-1]);
        return f.length?`Faltam lançar em: <b style="color:var(--ink)">${f.join(', ')}</b>. Tudo entra como <b style="color:var(--ink)">a pagar</b>, com valor zerado — você edita cada uma quando pagar. Nada duplica o que já existe.`
                       :`De ${MESES[V.mes-1]} a dezembro de ${V.ano} já está tudo lançado.`;})()}
    </div>
    <table><thead><tr><th style="width:44px">Ativa</th><th>Conta</th><th class="num" style="width:56px">Dia</th>
      <th>Categoria</th><th>Local · Pgto</th><th class="num">Estimativa</th><th style="width:105px"></th></tr></thead>
    <tbody>${S.fixos.map((f,i)=>`<tr style="opacity:${f.ativo?1:.42}">
      <td><input type="checkbox" data-fx="${i}" ${f.ativo?'checked':''} aria-label="Ativar ${esc(f.conta)}"></td>
      <td>${esc(f.conta)}</td><td class="num">${f.dia}</td>
      <td><span class="pill" style="background:${cor(f.cat)}1A;color:${cor(f.cat)}">${esc(f.cat)}</span></td>
      <td style="font-size:12px;color:var(--ink-2)">${esc(f.loc)}${f.pg?' · '+esc(f.pg):''}</td>
      <td class="num">${f.est?M(f.est):'—'}</td>
      <td style="text-align:right"><button class="acao" data-fxedit="${i}">editar</button> <button class="acao del" data-fxdel="${i}">apagar</button></td></tr>`).join('')}
    </tbody></table></div>`;
}


export function formFixo(f){
  const novo=!f;
  f=f||{conta:'',dia:1,cat:'Outros',loc:'Pessoal',pg:'',est:0,ativo:true};
  formGen(novo?'Nova conta fixa':'Editar conta fixa',[
    {k:'conta',l:'Conta',ph:'Ex.: Internet'},
    {k:'dia',l:'Dia do vencimento',tipo:'number'},
    {k:'est',l:'Estimativa em R$',tipo:'number'},
    {k:'cat',l:'Categoria',tipo:'select',opts:['Aluguel','Assinaturas','Associações','Cartão/Banco','Compras','Condomínio','Contabilidade','Energia','Impostos','Internet','Saúde','Serviços','Telefone','Transporte','Outros']},
    {k:'loc',l:'Local',tipo:'select',opts:['Apartamento','Chácara','Miro','Pessoal']},
    {k:'pg',l:'Pagamento',tipo:'select',opts:['','Boleto','Bradesco','C6','Conta corrente','Dinheiro','Nubank','Picpay','Pix','Santander']}
  ],f,async o=>{
    o.dia=Math.max(1,Math.min(31,Math.round(o.dia||1))); o.ativo=f.ativo!==false;
    if(novo) await fixosApi.inserir(o); else await fixosApi.atualizar(f.id,o);
  });
}
