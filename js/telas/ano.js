// ============================================================================
//  Tela "Ano": categoria x 12 meses.
// ============================================================================

import { A0, CATS, MESES, S, V, cor, esc } from '../estado.js';
import { M, Mc } from '../moeda.js';

export function telaAno(){
  const anos=[...new Set(S.tx.map(t=>+t.data.slice(0,4)))].filter(a=>a>=A0).sort();
  const pagoDe=(cat,m)=>S.tx.filter(t=>+t.data.slice(0,4)===V.ano&&+t.data.slice(5,7)===m&&(!cat||t.cat===cat)).reduce((s,t)=>s+(t.pago||0),0);
  const cats=CATS.filter(c=>S.tx.some(t=>+t.data.slice(0,4)===V.ano&&t.cat===c&&t.pago));
  const linhas=cats.map(c=>{
    const vs=[...Array(12)].map((_,i)=>pagoDe(c,i+1)), tot=vs.reduce((a,b)=>a+b,0);
    const ativos=vs.filter(v=>v>0).length;
    return `<tr class="lin" style="--c:${cor(c)}"><td style="font-size:13px"><i style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${cor(c)};margin-right:6px"></i>${esc(c)}</td>
      ${vs.map(v=>`<td class="num" style="font-size:12px;color:${v?'var(--ink)':'#C8D2D3'}">${v?Mc(v):'·'}</td>`).join('')}
      <td class="num" style="font-weight:600">${Mc(tot)}</td>
      <td class="num" style="font-size:12px;color:var(--ink-2)">${ativos?Mc(tot/ativos):'·'}</td></tr>`;
  }).join('');
  const tots=[...Array(12)].map((_,i)=>pagoDe(null,i+1)), totAno=tots.reduce((a,b)=>a+b,0);
  return `<div class="card"><div class="card-hd"><h3>Pago por categoria × mês</h3>
      <div class="dir">
        <select id="selAno">${anos.map(a=>`<option ${a===V.ano?'selected':''}>${a}</option>`).join('')}</select>
        <span class="mono" style="font-size:12px;color:var(--ink-2)">total ${M(totAno)}</span>
      </div></div>
    <div style="overflow-x:auto"><table style="min-width:1180px"><thead><tr><th>Categoria</th>
      ${MESES.map((m,i)=>`<th class="num" style="color:${i+1===V.mes?'var(--ink)':''}">${m.slice(0,3)}</th>`).join('')}
      <th class="num">Ano</th><th class="num">Média</th></tr></thead>
      <tbody>${linhas||`<tr><td colspan="15" class="vazio">Nada lançado em ${V.ano}.</td></tr>`}</tbody>
      <tfoot><tr class="tot"><td>TOTAL</td>${tots.map(v=>`<td class="num">${v?Mc(v):'·'}</td>`).join('')}
        <td class="num">${Mc(totAno)}</td><td class="num">${Mc(totAno/(tots.filter(v=>v>0).length||1))}</td></tr></tfoot>
    </table></div></div>`;
}
