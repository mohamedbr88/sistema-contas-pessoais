// ============================================================================
//  Formulário de conta a pagar.
// ============================================================================

import { MOEDAS } from '../moeda.js';
import { contasApi, fixosApi } from '../api.js';
import { render } from '../bus.js';
import { CATS, LOCS, PAGS, S, V, dia, esc, novoId } from '../estado.js?v=20260720-4';
import { toast } from '../ui.js';

const rotuloMoeda = m => `${MOEDAS[m].n}  ${m}`;
const valorMoeda  = r => Object.keys(MOEDAS).find(m => rotuloMoeda(m) === r) || 'BRL';

export function form(t){
  const novo=!t;
  const diaPad = String(Math.min(V.diaSel || new Date().getDate(), new Date(V.ano, V.mes, 0).getDate())).padStart(2, '0');
  t=t||{id:0,data:`${V.ano}-${String(V.mes).padStart(2,'0')}-${diaPad}`,
        conta:'',cat:'Outros',loc:'Pessoal',pg:'',est:0,pago:0,st:'Pendente',obs:'',moeda:S.moeda||'BRL'};
  const m=document.createElement('div');m.className='mask';
  m.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <h3>${novo?'Nova conta':'Editar conta'}</h3>
    <div class="campos">
      <div class="campo"><label>Conta</label><input id="f_conta" value="${esc(t.conta)}" placeholder="Ex.: Luz chácara" autofocus></div>
      <div class="par">
        <div class="campo"><label>Vencimento</label><input type="date" id="f_data" value="${t.data}"></div>
        <div class="campo"><label>Status</label><select id="f_st">
          <option ${t.st==='Pendente'?'selected':''}>Pendente</option><option ${t.st==='Pago'?'selected':''}>Pago</option></select></div>
      </div>
      <div class="par">
        <div class="campo"><label>Estimativa</label><input type="number" step="0.01" id="f_est" value="${t.est||''}"></div>
        <div class="campo"><label>Pago</label><input type="number" step="0.01" id="f_pago" value="${t.pago||''}"></div>
      </div>
      <div class="par">
        <div class="campo"><label>Categoria</label><select id="f_cat">${CATS.map(c=>`<option ${t.cat===c?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="campo"><label>Local</label><select id="f_loc">${LOCS.map(c=>`<option ${t.loc===c?'selected':''}>${c}</option>`).join('')}</select></div>
      </div>
      <div class="par">
        <div class="campo"><label>Pagamento</label><select id="f_pg">${PAGS.map(c=>`<option value="${c}" ${t.pg===c?'selected':''}>${c||'—'}</option>`).join('')}</select></div>
        <div class="campo"><label>Moeda</label><select id="f_moeda">${Object.keys(MOEDAS).map(m=>`<option value="${m}" ${(t.moeda||'BRL')===m?'selected':''}>${rotuloMoeda(m)}</option>`).join('')}</select></div>
      </div>
      <div class="campo"><label>Obs</label><input id="f_obs" value="${esc(t.obs)}"></div>
      ${novo?`<label style="font-size:12.5px;display:flex;gap:7px;align-items:center;color:var(--ink-2)">
        <input type="checkbox" id="f_fix"> Repetir todo mês (adicionar às fixas)</label>`:''}
    </div>
    <div class="modal-pe"><button class="btn" id="f_ok" style="flex:1">${novo?'Adicionar':'Salvar'}</button>
      <button class="btn-2" id="f_x">Cancelar</button></div></div>`;
  document.body.append(m);
  const g=id=>m.querySelector('#'+id);
  const fechar=()=>m.remove();
  m.onclick=e=>{if(e.target===m)fechar();};
  g('f_x').onclick=fechar;
  m.addEventListener('keydown',e=>{if(e.key==='Escape')fechar();});
  g('f_ok').onclick=async()=>{
    const n=g('f_conta').value.trim();
    if(!n){g('f_conta').focus();toast('Dá um nome pra conta');return;}
    const data=g('f_data').value;
    if(!data){g('f_data').focus();toast('Informe a data de vencimento');return;}
    const o={data,conta:n,cat:g('f_cat').value,loc:g('f_loc').value,
      pg:g('f_pg').value,est:+g('f_est').value||0,pago:+g('f_pago').value||0,st:g('f_st').value,
      obs:g('f_obs').value.trim(),moeda:g('f_moeda').value,fixoId:t.fixoId||null};
    if(o.st==='Pago'&&!o.pago) o.pago=o.est;
    if(o.st==='Pendente') o.pago=0;
    g('f_ok').disabled=true; g('f_ok').textContent='Salvando…';
    try{
      if(novo){
        await contasApi.inserir(o);
        if(g('f_fix') && g('f_fix').checked)
          await fixosApi.inserir({conta:o.conta,dia:+o.data.slice(8,10),cat:o.cat,loc:o.loc,pg:o.pg,est:o.est,moeda:o.moeda,ativo:true});
      } else {
        await contasApi.atualizar(t.id, o);
      }
      fechar(); render(); toast(novo?'Conta adicionada':'Conta salva');
    }catch(err){
      g('f_ok').disabled=false; g('f_ok').textContent=novo?'Adicionar':'Salvar';
      toast(err.message||'Não salvou');
    }
  };
  setTimeout(()=>g('f_conta').focus(),40);
}
