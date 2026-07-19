// ============================================================================
//  Tela "Dia a dia": gasto solto do mês (mercado, restaurante, uber).
// ============================================================================

import { diarioDoMes, resumoDiarioMes, somaValor, agruparDiario, valorEmBRL } from '../calculos.js?v=20260719-2';
import { CATD, MESES, PAGD, LOCS, S, V, cor, esc } from '../estado.js';
import { M, MOEDAS, Mc } from '../moeda.js';
import { despesasApi, metasApi } from '../api.js?v=20260719-2';
import { formGen } from '../ui.js';

function formatDate(year, month, day) {
  return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
}

function formatDateIso(data) {
  if (!data) return '—';
  return `${data.slice(8,10)}/${data.slice(5,7)}/${data.slice(0,4)}`;
}

function resumoComparacao(c) {
  if (!c.temDados) return 'Sem dados para comparação';
  if (!c.total && !c.diferenca) return `Mesmo gasto de ${MESES[c.mes-1].toLowerCase()}`;
  const pct = c.percentual == null ? null : Math.abs(c.percentual);
  if (pct != null && pct < 0.05) return `Mesmo gasto de ${MESES[c.mes-1].toLowerCase()}`;
  const dir = c.diferenca > 0 ? 'maior' : 'menor';
  return `${pct == null ? '—' : pct.toFixed(0)}% ${dir} que ${MESES[c.mes-1].toLowerCase()}`;
}

function pontosGrafico(acumulado, nd) {
  const totais = [];
  let parcial = 0;
  const mapa = Object.fromEntries(acumulado.map(p => [+p.data.slice(8), p.total]));
  for (let dia = 1; dia <= nd; dia++) {
    if (Object.prototype.hasOwnProperty.call(mapa, dia)) parcial = mapa[dia];
    totais.push({ dia, total: parcial });
  }
  const max = Math.max(...totais.map(p => p.total), 0);
  const w = 640, h = 180, padX = 18, padY = 16;
  const usableW = w - padX * 2;
  const usableH = h - padY * 2;
  const pts = totais.map((p, idx) => {
    const x = padX + (idx / Math.max(1, totais.length - 1)) * usableW;
    const y = padY + usableH - (max ? (p.total / max) * usableH : 0);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return { totais, pts, max, w, h, padX, padY };
}

export function telaDiario(){
  const resumoMes = resumoDiarioMes();
  const dsMes = resumoMes.dsMes;
  const nd = new Date(V.ano, V.mes, 0).getDate();
  const diasPorDia = resumoMes.porDia;
  const diaSel = V.diaSel;
  const chaveDiaSel = diaSel ? `${V.ano}-${String(V.mes).padStart(2,'0')}-${String(diaSel).padStart(2,'0')}` : null;
  const dsDia = chaveDiaSel ? (diasPorDia[chaveDiaSel] || []) : [];
  const totDia = somaValor(dsDia);
  const qtd = dsDia.length;
  const mediaLanc = qtd ? totDia / qtd : 0;
  const porCatDia = agruparDiario(dsDia, CATD);
  const catMais = porCatDia[0];
  const porLocDia = LOCS.map(l => ({ k: l, v: somaValor(dsDia.filter(d => d.loc === l)) }))
                        .filter(x => x.v).sort((a, b) => b.v - a.v);
  const locMais = porLocDia[0];
  const porPgDia = PAGD.map(p => ({ k: p, v: somaValor(dsDia.filter(d => d.pg === p)) }))
                        .filter(x => x.v).sort((a, b) => b.v - a.v);
  const pgMais = porPgDia[0];
  const maior = qtd ? Math.max(...dsDia.map(d=>d.valor||0)) : 0;
  const menor = qtd ? Math.min(...dsDia.map(d=>d.valor||0)) : 0;
  const totalMes = resumoMes.total;
  const diasComGasto = resumoMes.diasComGasto;
  const mediaPorDiaComGasto = resumoMes.mediaPorDiaComGasto;
  const mediaDiaMes = totalMes / nd;
  const diferenca = totDia - mediaDiaMes;
  const comparacao = diaSel ? `${diferenca >= 0 ? '+' : '-'} ${Mc(Math.abs(diferenca))} ${diferenca >= 0 ? 'acima' : 'abaixo'} da média diária do mês` : '';
  const dsDiaOrdenado = dsDia.slice().sort((a,b) => ((a.hora || '').localeCompare(b.hora || '')) || a.id.localeCompare(b.id));
  const maiorGastoMes = resumoMes.maiorGasto;
  const diaMaisGastou = resumoMes.diaMaisGastou;
  const categoriaMaior = resumoMes.categoriaMaior;
  const comparacaoAnterior = resumoMes.comparacaoAnterior;
  const metaMes = metasApi.doMes(V.ano, V.mes);
  const metaBRL = metaMes ? valorEmBRL(metaMes.valor, metaMes.moeda) : 0;
  const saldoMeta = metaBRL - totalMes;
  const grafico = pontosGrafico(resumoMes.acumulado, nd);
  const maiorDiaRotulo = diaMaisGastou ? formatDateIso(diaMaisGastou.data) : '—';
  const metaStatus = !metaMes ? 'Defina uma meta mensal' : saldoMeta >= 0 ? `${Mc(saldoMeta)} restantes` : `${Mc(Math.abs(saldoMeta))} acima da meta`;

  return `<div class="card"><div class="card-hd"><h3>Gasto do mês</h3>
      <div class="dir"><button class="btn-2" id="editMetaDiario">${metaMes ? 'Editar meta' : 'Definir meta'}</button></div></div>
      <div class="diario-resumo-grid">
        <div class="kpi"><span>Gasto do mês</span><b>${Mc(totalMes)}</b><small>${resumoMes.quantidade} lançamento(s)</small></div>
        <div class="kpi"><span>Maior gasto do mês</span><b>${maiorGastoMes ? M(maiorGastoMes.valor, maiorGastoMes.moeda) : '—'}</b><strong>${maiorGastoMes ? esc(maiorGastoMes.desc) : 'Sem lançamentos'}</strong><em>${maiorGastoMes ? formatDateIso(maiorGastoMes.data) : ''}</em></div>
        <div class="kpi"><span>Dia que mais gastou</span><b>${diaMaisGastou ? Mc(diaMaisGastou.total) : '—'}</b><strong>${maiorDiaRotulo}</strong><em>${diaMaisGastou ? `${diaMaisGastou.itens.length} lançamento(s)` : ''}</em></div>
        <div class="kpi"><span>Média diária</span><b>${diasComGasto ? Mc(mediaPorDiaComGasto) : '—'}</b><small>${diasComGasto ? `${diasComGasto} dia(s) com gasto` : 'sem gastos nesse mês'}</small></div>
        <div class="kpi"><span>Categoria com maior gasto</span><b class="kpi-multi">${categoriaMaior ? esc(categoriaMaior.k) : '—'}</b><small>${categoriaMaior ? Mc(categoriaMaior.v) : 'sem categoria dominante'}</small></div>
        <div class="kpi"><span>Mês anterior</span><b>${comparacaoAnterior.temDados ? `${comparacaoAnterior.diferenca >= 0 ? '+' : '-'} ${Mc(Math.abs(comparacaoAnterior.diferenca))}` : '—'}</b><small>${esc(resumoComparacao(comparacaoAnterior))}</small></div>
        <div class="kpi"><span>Meta mensal</span><b>${metaMes ? M(metaMes.valor, metaMes.moeda) : '—'}</b><small>${esc(metaStatus)}</small></div>
        <div class="kpi"><span>Total x meta</span><b>${metaMes ? Mc(Math.max(saldoMeta, 0)) : Mc(0)}</b><small>${metaMes ? (saldoMeta >= 0 ? 'ainda pode gastar' : `ultrapassou ${Mc(Math.abs(saldoMeta))}`) : 'defina uma meta para acompanhar'}</small></div>
      </div></div>
    <div class="card"><div class="card-hd"><h3>Evolução de ${MESES[V.mes-1]}</h3></div>
      <div class="grafico-diario">
        <svg viewBox="0 0 ${grafico.w} ${grafico.h}" role="img" aria-label="Gastos acumulados do mês">
          <rect x="0" y="0" width="${grafico.w}" height="${grafico.h}" rx="10" fill="#F7FAF9"></rect>
          <polyline fill="none" stroke="#D84315" stroke-width="3" points="${grafico.pts}"></polyline>
          ${grafico.totais.filter((_, idx) => idx === grafico.totais.length - 1 || idx === 0 || idx % Math.max(1, Math.ceil(grafico.totais.length / 6)) === 0).map(p => {
            const i = p.dia - 1;
            const x = grafico.padX + (i / Math.max(1, grafico.totais.length - 1)) * (grafico.w - grafico.padX * 2);
            const y = grafico.padY + (grafico.h - grafico.padY * 2) - (grafico.max ? (p.total / grafico.max) * (grafico.h - grafico.padY * 2) : 0);
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#D84315"></circle>`;
          }).join('')}
        </svg>
        <div class="grafico-legenda"><span>Começa em <b>${Mc(0)}</b></span><span>Fecha em <b>${Mc(totalMes)}</b></span><span>Pico acumulado <b>${Mc(grafico.max)}</b></span></div>
      </div></div>
    <div class="card"><div class="card-hd"><h3>Calendário de ${MESES[V.mes-1]}</h3></div>
      <div class="diario-calendario">${Array.from({length: nd}, (_,i) => {
        const d = i + 1;
        const itens = diasPorDia[`${V.ano}-${String(V.mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`] || [];
        const sel = diaSel === d ? ' selected' : '';
        const badge = itens.length ? `<span class="badge">${itens.length}</span>` : '';
        return `<button class="dia${sel}${itens.length?' has':' no'}" data-dia="${d}" aria-pressed="${diaSel===d}">
          <span class="n">${d}</span>${badge}</button>`;
      }).join('')}</div></div>
    <div class="card"><div class="card-hd"><h3>${diaSel ? `Resumo de ${formatDate(V.ano, V.mes, diaSel)}` : `Resumo do mês`}</h3>
      <div class="dir">${diaSel ? `<button class="btn btn-cofre" id="addDday">+ Novo gasto neste dia</button>` : `<button class="btn" id="addD">+ Novo gasto</button>`}</div></div>
      <div class="kpis">
        <div class="kpi"><span>${diaSel ? 'Data selecionada' : 'Total do mês'}</span><b>${diaSel ? formatDate(V.ano, V.mes, diaSel) : formatDate(V.ano, V.mes, 1).slice(3)}</b></div>
        <div class="kpi"><span>Total gasto no dia</span><b>${Mc(totDia)}</b><small>${qtd} lançamento(s)</small></div>
        <div class="kpi"><span>Valor médio</span><b>${Mc(mediaLanc)}</b><small>${qtd ? 'por lançamento' : 'sem lançamentos'}</small></div>
        <div class="kpi"><span>Categoria maior</span><b>${catMais ? esc(catMais.k) : '—'}</b><small>${catMais ? Mc(catMais.v) : ''}</small></div>
        <div class="kpi"><span>Local maior</span><b>${locMais ? esc(locMais.k) : '—'}</b><small>${locMais ? Mc(locMais.v) : ''}</small></div>
        <div class="kpi"><span>Pagamento mais usado</span><b>${pgMais ? esc(pgMais.k) : '—'}</b><small>${pgMais ? Mc(pgMais.v) : ''}</small></div>
        <div class="kpi"><span>Comparação com média</span><b>${diaSel ? comparacao : Mc(mediaDiaMes)}</b><small>${diaSel ? 'média diária do mês' : 'média do mês'}</small></div>
        <div class="kpi"><span>Maior / menor gasto</span><b>${qtd ? `${Mc(maior)} / ${Mc(menor)}` : '—'}</b><small>${qtd ? 'no dia' : ''}</small></div>
      </div></div>
    <div class="card"><div class="card-hd"><h3>${diaSel ? `Lançamentos de ${formatDate(V.ano,V.mes,diaSel)}` : `Lançamentos de ${MESES[V.mes-1]}`}</h3></div>
      ${diaSel && !qtd ? `<div class="vazio"><b>Nenhum lançamento neste dia.</b>
        <p style="margin:6px 0 14px">Use o botão abaixo para criar um gasto já com essa data.</p>
        <button class="btn btn-cofre" id="addDday">+ Novo lançamento</button></div>`
      : dsDiaOrdenado.length ? `<table class="tmes"><thead><tr><th>Horário</th><th>O quê</th><th>Categoria</th><th>Local</th><th>Pgto</th><th class="num">Valor</th><th>Obs</th><th></th></tr></thead>
          <tbody>${dsDiaOrdenado.map(d=>`<tr class="lin" style="--c:${cor(d.cat)}">
            <td class="mono" style="font-size:12px;color:var(--ink-2)">${esc(d.hora||'')}</td>
            <td>${esc(d.desc)}</td>
            <td><span class="pill" style="background:${cor(d.cat)}1A;color:${cor(d.cat)}">${esc(d.cat)}</span></td>
            <td style="font-size:12px;color:var(--ink-2)">${esc(d.loc)}</td>
            <td style="font-size:12px;color:var(--ink-2)">${esc(d.pg)}</td>
            <td class="num" style="font-weight:600">${M(d.valor)}</td>
            <td>${esc(d.obs||'')}</td>
            <td style="text-align:right"><button class="acao" data-ed-diario="${d.id}">editar</button>
            <button class="acao del" data-del-diario="${d.id}" style="margin-left:8px">apagar</button></td></tr>`).join('')}</tbody>
          </table>` : `<table class="tmes"><thead><tr><th>Dia</th><th>O quê</th><th>Categoria</th><th>Pgto</th><th class="num">Valor</th><th></th></tr></thead>
          <tbody>${dsMes.sort((a,b)=>b.data.localeCompare(a.data)||a.id.localeCompare(b.id)).map(d=>`<tr class="lin" style="--c:${cor(d.cat)}">
            <td class="mono" style="font-size:12px;color:var(--ink-2)">${d.data.slice(8)}/${d.data.slice(5,7)}</td>
            <td>${esc(d.desc)}</td>
            <td><span class="pill" style="background:${cor(d.cat)}1A;color:${cor(d.cat)}">${esc(d.cat)}</span></td>
            <td style="font-size:12px;color:var(--ink-2)">${esc(d.pg)}</td>
            <td class="num" style="font-weight:600">${M(d.valor)}</td><td style="text-align:right"><button class="acao" data-ed-diario="${d.id}">editar</button></td></tr>`).join('')}</tbody>
          </table>`}
    </div>`;
}
const rotuloMoeda = m => `${MOEDAS[m].n}  ${m}`;
const valorMoeda  = r => Object.keys(MOEDAS).find(m => rotuloMoeda(m) === r) || 'BRL';

export function formMetaDiario(){
  const atual = metasApi.doMes(V.ano, V.mes);
  formGen(`Meta de ${MESES[V.mes-1]} / ${V.ano}`,[
    {k:'valor',l:`Meta na moeda exibida (${S.moeda || 'BRL'})`,tipo:'number'},
  ], { valor: atual ? Number(MetasValorLocal(atual).toFixed(2)) : 0 }, async o => {
    await metasApi.salvarMetaDiario(V.ano, V.mes, o.valor || 0, S.moeda || 'BRL');
  }, null);
}

function MetasValorLocal(meta) {
  return meta.moeda === (S.moeda || 'BRL') ? meta.valor : valorEmBRL(meta.valor, meta.moeda) / valorEmBRL(1, S.moeda || 'BRL');
}

export function formDiario(d){
  const novo=!d;
  const nd = new Date(V.ano,V.mes,0).getDate();
  const defaultDay = V.diaSel || (V.ano === new Date().getFullYear() && V.mes === new Date().getMonth() + 1 ? new Date().getDate() : 1);
  d=d||{id:0,data:`${V.ano}-${String(V.mes).padStart(2,'0')}-${String(Math.min(defaultDay, nd)).padStart(2,'0')}`,desc:'',cat:'Restaurante',loc:'Pessoal',pg:'Cartão',valor:0,obs:'',moeda:S.moeda||'BRL'};
  if(novo) d.data=`${V.ano}-${String(V.mes).padStart(2,'0')}-${d.data.slice(8)}`;
  formGen(novo?'Novo gasto do dia':'Editar gasto',[
    {k:'desc',l:'O quê',ph:'Ex.: Mercado, Uber, jantar'},
    {k:'data',l:'Dia',tipo:'date'},
    {k:'valor',l:'Valor',tipo:'number'},
    {k:'moeda',l:'Moeda',tipo:'select',opts:Object.keys(MOEDAS).map(rotuloMoeda)},
    {k:'cat',l:'Categoria',tipo:'select',opts:CATD},
    {k:'loc',l:'Local',tipo:'select',opts:LOCS},
    {k:'pg',l:'Pagamento',tipo:'select',opts:PAGD},
    {k:'obs',l:'Obs'},
  ], {...d, moeda: rotuloMoeda(d.moeda||'BRL')}, async o=>{
    o.moeda = valorMoeda(o.moeda);
    if(novo) await despesasApi.inserir(o);
    else     await despesasApi.atualizar(d.id, o);
  }, novo ? null : async()=>{ await despesasApi.apagar(d.id); });
}
