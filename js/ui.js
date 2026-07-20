// ============================================================================
//  Pedaços de interface reaproveitados: aviso, formulário genérico, download.
// ============================================================================
import { esc } from './estado.js?v=20260720-4';
import { render } from './bus.js';

export function toast(msg){
  document.querySelectorAll('.toast').forEach(e=>e.remove());
  const d=document.createElement('div');d.className='toast';d.textContent=msg;document.body.append(d);
  setTimeout(()=>d.remove(),2600);
}

/**
 * Formulário em janela. campos = [{k, l, tipo, opts, ph}]
 * salvarFn(objeto) e apagarFn() são async: a tela só redesenha depois que o
 * Supabase confirmou. Se der erro, a janela fica aberta com o que foi digitado.
 */
export function formGen(titulo, campos, obj, salvarFn, apagarFn){
  const m=document.createElement('div');m.className='mask';
  const inp=c=>{
    const v=obj[c.k]??c.pad??'';
    if(c.tipo==='select') return `<select id="g_${c.k}">${c.opts.map(o=>`<option value="${esc(o)}" ${String(v)===String(o)?'selected':''}>${esc(o)||'—'}</option>`).join('')}</select>`;
    return `<input type="${c.tipo||'text'}" id="g_${c.k}" value="${esc(v)}" ${c.tipo==='number'?'step="0.01"':''} ${c.ph?`placeholder="${esc(c.ph)}"`:''}>`;
  };
  m.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><h3>${esc(titulo)}</h3>
    <div class="campos">${campos.map(c=>`<div class="campo"><label>${esc(c.l)}</label>${inp(c)}</div>`).join('')}</div>
    <div class="modal-pe"><button class="btn" id="g_ok" style="flex:1">Salvar</button>
      ${apagarFn?'<button class="btn-2 acao del" id="g_del">Apagar</button>':''}
      <button class="btn-2" id="g_x">Cancelar</button></div></div>`;
  document.body.append(m);
  const q=id=>m.querySelector('#'+id), fechar=()=>m.remove();
  q('g_x').onclick=fechar; m.onclick=e=>{if(e.target===m)fechar();};
  m.addEventListener('keydown',e=>{if(e.key==='Escape')fechar();});
  if(apagarFn) q('g_del').onclick=async()=>{
    if(!confirm('Apagar este lançamento?')) return;
    try{ await apagarFn(); fechar(); render(); toast('Apagado'); }
    catch(err){ toast(err.message||'Não apagou'); } };
  q('g_ok').onclick=async()=>{
    const o={}; for(const c of campos){const v=q('g_'+c.k).value; o[c.k]= c.tipo==='number'? (+v||0) : v.trim();}
    if(campos[0].obrig!==false && !o[campos[0].k]){q('g_'+campos[0].k).focus();toast('Falta preencher '+campos[0].l);return;}
    q('g_ok').disabled=true; q('g_ok').textContent='Salvando…';
    try{ await salvarFn(o); fechar(); render(); toast('Salvo'); }
    catch(err){ q('g_ok').disabled=false; q('g_ok').textContent='Salvar'; toast(err.message||'Não salvou'); }
  };
  setTimeout(()=>q('g_'+campos[0].k).focus(),40);
}

export function baixar(nome,txt,tipo){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([txt],{type:tipo}));a.download=nome;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('Arquivo baixado');
}
