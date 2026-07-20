// ============================================================================
//  Leitor de OFX/CSV do banco: adivinha categoria, ignora entradas, evita repetidos.
// ============================================================================

import { render } from './bus.js';
import { contasApi } from './api.js';
import { CATS, LOCS, PAGS, S, V, dia, esc, novoId } from './estado.js?v=20260720-7';
import { M } from './moeda.js';
import { toast } from './ui.js';

export const REGRAS=[
  [/netflix|spotif|hbo|max |disney|prime video|apple\.com|apple one|itunes|openai|chatgpt|claude|anthropic|linkedin|adobe|starlink|google one|youtube/i,'Assinaturas'],
  [/uber|99app|99 |cabify|posto|ipiranga|shell|petrobr|combust|estacion|zona azul|pedagio|sem parar/i,'Transporte'],
  [/unimed|drogaria|farmac|droga ?raia|pacheco|panvel|hospital|laborat|clinica|dentist/i,'Saúde'],
  [/vivo|claro|tim |oi fixo|telefon|celular/i,'Telefone'],
  [/net |vivo fibra|internet|banda larga|fibra/i,'Internet'],
  [/enel|cpfl|elektro|cemig|copel|light|energia|eletric/i,'Energia'],
  [/condomin/i,'Condomínio'],
  [/aluguel|imobiliar/i,'Aluguel'],
  [/darf|das |imposto|receita federal|iptu|ipva|prefeitura|tribut/i,'Impostos'],
  [/mercado ?livre|meli|amazon|magalu|americanas|shopee|aliexpress|shein|loja|magazine/i,'Compras'],
  [/rotary|associac|clube|sindicat/i,'Associações'],
  [/contabil|contador|escritorio/i,'Contabilidade'],
  [/pag ?fatura|pagamento (de )?fatura|pagamento recebido|estorno|credito de|rendimento|transferencia recebida/i,'__CREDITO__'],
];
export function adivinha(desc){
  for(const [re,cat] of REGRAS) if(re.test(desc)) return cat;
  return 'Outros';
}
export function parseOFX(t){
  const out=[];
  const blocos=t.split(/<STMTTRN>/i).slice(1);
  for(const b of blocos){
    const g=re=>{const m=b.match(re);return m?m[1].trim():'';};
    const d=g(/<DTPOSTED>\s*([0-9]{8})/i);
    const v=g(/<TRNAMT>\s*(-?[0-9.,]+)/i);
    const n=g(/<MEMO>\s*([^<\r\n]+)/i)||g(/<NAME>\s*([^<\r\n]+)/i);
    if(!d||!v) continue;
    // OFX padrão usa ponto decimal; alguns bancos BR mandam vírgula
    const num = v.includes(',') ? v.replace(/\./g,'').replace(',','.') : v;
    const f=parseFloat(num); if(isNaN(f)) continue;
    out.push({data:`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`,desc:n||'(sem descrição)',valor:f});
  }
  return out;
}
export function parseCSV(t){
  const linhas=t.split(/\r?\n/).filter(l=>l.trim());
  if(!linhas.length) return [];
  const sep=[',',';','\t'].sort((a,b)=>linhas[0].split(b).length-linhas[0].split(a).length)[0];
  const corta=l=>{const o=[];let c='',q=false;
    for(let i=0;i<l.length;i++){const x=l[i];
      if(x==='"'){ if(q&&l[i+1]==='"'){c+='"';i++;} else q=!q; }
      else if(x===sep&&!q){o.push(c);c='';} else c+=x;}
    o.push(c);return o.map(s=>s.trim().replace(/^"|"$/g,''));};
  const cab=corta(linhas[0]).map(h=>h.toLowerCase());
  const ache=(...alvos)=>cab.findIndex(h=>alvos.some(a=>h.includes(a)));
  const iD=ache('data','date'), iV=ache('valor','amount','value','montante'),
        iT=ache('descri','title','memo','estabelec','lançamento','lancamento','historico','histórico');
  if(iD<0||iV<0) throw new Error('sem coluna de data ou valor');
  const out=[];
  for(const l of linhas.slice(1)){
    const c=corta(l); if(c.length<2) continue;
    let d=c[iD]; 
    if(/^\d{2}\/\d{2}\/\d{4}/.test(d)) d=d.slice(0,10).split('/').reverse().join('-');
    else if(/^\d{4}-\d{2}-\d{2}/.test(d)) d=d.slice(0,10); else continue;
    let v=c[iV].replace(/[R$\s]/g,'');
    v = v.includes(',') ? v.replace(/\./g,'').replace(',','.') : v;
    const n=parseFloat(v); if(isNaN(n)) continue;
    out.push({data:d,desc:(iT>=0?c[iT]:'')||'(sem descrição)',valor:n});
  }
  return out;
}
export function abrirImport(txt,nome){
  const ofx=/<OFX|<STMTTRN/i.test(txt);
  let itens = ofx?parseOFX(txt):parseCSV(txt);
  if(!itens.length){toast('Não achei lançamentos nesse arquivo');return;}
  // gasto = valor negativo no OFX; no CSV alguns bancos usam positivo pra despesa
  const temNeg=itens.some(i=>i.valor<0);
  itens=itens.map(i=>({...i, gasto: temNeg? -i.valor : i.valor}));
  const dup=i=>S.tx.some(t=>t.data===i.data && Math.abs((t.pago||0)-i.gasto)<0.005);
  itens=itens.map(i=>({...i, cat:adivinha(i.desc), dup:dup(i)}))
             .filter(i=>i.gasto>0)  // só saídas
             .sort((a,b)=>a.data.localeCompare(b.data));
  if(!itens.length){toast('Só achei entradas/créditos nesse arquivo');return;}
  itens.forEach(i=>{ i.on = !i.dup && i.cat!=='__CREDITO__'; if(i.cat==='__CREDITO__') i.cat='Outros'; });

  const m=document.createElement('div');m.className='mask';
  const total=()=>itens.filter(i=>i.on).reduce((s,i)=>s+i.gasto,0);
  m.innerHTML=`<div class="modal" role="dialog" aria-modal="true" style="max-width:720px">
    <h3>Conferir importação <span style="font-weight:400;color:var(--ink-2);font-size:12px">· ${esc(nome)}</span></h3>
    <div class="campos" style="gap:8px">
      <div class="par">
        <div class="campo"><label>Lançar como pagamento</label><select id="i_pg">${PAGS.map(c=>`<option value="${c}">${c||'—'}</option>`).join('')}</select></div>
        <div class="campo"><label>Local de todos</label><select id="i_loc">${LOCS.map(c=>`<option ${c==='Pessoal'?'selected':''}>${c}</option>`).join('')}</select></div>
      </div>
      <p style="font-size:12px;color:var(--ink-2)">${itens.length} saída(s) encontrada(s)${itens.filter(i=>i.dup).length?` · <b style="color:var(--carimbo)">${itens.filter(i=>i.dup).length} já parecem estar lançadas</b> e vieram desmarcadas`:''}. Ajuste a categoria de cada uma se eu errei.</p>
    </div>
    <div style="max-height:46vh;overflow:auto;border-top:1px solid var(--line)">
      <table><tbody id="i_lista">${itens.map((i,n)=>`<tr style="${i.dup?'background:var(--carimbo-2)':''}">
        <td style="width:30px"><input type="checkbox" data-i="${n}" ${i.on?'checked':''} aria-label="Incluir"></td>
        <td class="mono" style="width:64px;font-size:11px;color:var(--ink-2)">${i.data.slice(8)}/${i.data.slice(5,7)}</td>
        <td style="font-size:12.5px">${esc(i.desc)}${i.dup?'<div style="font-size:10px;color:var(--carimbo)">já existe uma conta desse valor nesse dia</div>':''}</td>
        <td style="width:130px"><select data-c="${n}" style="font-size:11px;padding:2px 4px;border:1px solid var(--line);border-radius:5px;background:var(--paper)">
          ${CATS.map(c=>`<option ${i.cat===c?'selected':''}>${c}</option>`).join('')}</select></td>
        <td class="num" style="width:88px;font-weight:600">${M(i.gasto)}</td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="modal-pe"><button class="btn btn-cofre" id="i_ok" style="flex:1">Lançar <span id="i_n">${itens.filter(i=>i.on).length}</span> · <span id="i_t">${M(total())}</span></button>
      <button class="btn-2" id="i_x">Cancelar</button></div></div>`;
  document.body.append(m);
  const g=id=>m.querySelector('#'+id);
  const atual=()=>{g('i_n').textContent=itens.filter(i=>i.on).length;g('i_t').textContent=M(total());};
  m.querySelectorAll('[data-i]').forEach(c=>c.onchange=()=>{itens[c.dataset.i].on=c.checked;atual();});
  m.querySelectorAll('[data-c]').forEach(s=>s.onchange=()=>{itens[s.dataset.c].cat=s.value;});
  const fechar=()=>m.remove();
  g('i_x').onclick=fechar; m.onclick=e=>{if(e.target===m)fechar();};
  m.addEventListener('keydown',e=>{if(e.key==='Escape')fechar();});
  g('i_ok').onclick=async()=>{
    const sel=itens.filter(i=>i.on);
    if(!sel.length){toast('Marque pelo menos uma');return;}
    g('i_ok').disabled=true; g('i_ok').textContent='Gravando no banco…';
    try{
      await contasApi.inserirVarias(sel.map(i=>({
        data:i.data, conta:i.desc.slice(0,60), cat:i.cat, loc:g('i_loc').value,
        pg:g('i_pg').value, est:i.gasto, pago:i.gasto, st:'Pago', obs:`importado de ${nome}`})));
      fechar();
      V.ano=+sel[0].data.slice(0,4); V.mes=+sel[0].data.slice(5,7); V.aba='mes'; V.diaSel=null;
      render(); toast(`${sel.length} lançamento(s) importados`);
    }catch(err){ g('i_ok').disabled=false; g('i_ok').textContent='Tentar de novo'; toast(err.message||'Não importou'); }
  };
}
