// ============================================================================
//  Tela "Dia a dia": gasto solto do mês (mercado, restaurante, uber).
// ============================================================================

import { diarioDoMes, resumoDiarioMes, somaValor, agruparDiario, valorEmBRL } from '../calculos.js?v=20260719-3';
import { CATD, MESES, PAGD, LOCS, S, V, cor, esc } from '../estado.js';
import { M, MOEDAS, Mc } from '../moeda.js';
import { despesasApi, metasApi } from '../api.js?v=20260719-3';
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

function resumoPagamento(pg) {
  if (!pg) return { titulo: 'Sem dados', detalhe: 'Sem lançamentos neste período' };
  return {
    titulo: esc(pg.k || 'Sem dados'),
    detalhe: `${pg.qtd} lançamento(s)`
  };
}

function resumoItem(titulo, valor, detalhe) {
  return `<div class="diario-stat"><span>${titulo}</span><b>${valor}</b><small>${detalhe}</small></div>`;
}

function listaPills(itens, vazio) {
  if (!itens.length) return `<span class="pill pill-cat">${vazio}</span>`;
  return itens.map(item => `<span class="pill pill-cat">${esc(item)}</span>`).join('');
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
  const w = 700, h = 240, padX = 48, padY = 24;
  const usableW = w - padX * 2;
  const usableH = h - padY * 2;
  const pts = totais.map((p, idx) => {
    const x = padX + (idx / Math.max(1, totais.length - 1)) * usableW;
    const y = padY + usableH - (max ? (p.total / max) * usableH : 0);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const ticksY = Array.from({ length: 4 }, (_, i) => {
    const ratio = i / 3;
    const valor = max * (1 - ratio);
    const y = padY + usableH * ratio;
    return { valor, y };
  });
  const ticksX = totais.filter((_, idx) => idx === 0 || idx === totais.length - 1 || idx % Math.max(1, Math.ceil(totais.length / 6)) === 0)
    .map(p => ({
      dia: p.dia,
      x: padX + ((p.dia - 1) / Math.max(1, totais.length - 1)) * usableW
    }));
  const diasComLancamento = new Set(acumulado.map(p => +p.data.slice(8)));
  return { totais, pts, max, w, h, padX, padY, ticksY, ticksX, diasComLancamento };
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
  const menorGastoMes = resumoMes.menorGasto;
  const diaMaisGastou = resumoMes.diaMaisGastou;
  const diaMenosGastou = resumoMes.diaMenosGastou;
  const categoriaMaior = resumoMes.categoriaMaior;
  const categoriaMenor = resumoMes.categoriaMenor;
  const comparacaoAnterior = resumoMes.comparacaoAnterior;
  const pagamentoMaisUsado = resumoMes.pagamentoMaisUsado;
  const metaMes = metasApi.doMes(V.ano, V.mes);
  const metaBRL = metaMes ? valorEmBRL(metaMes.valor, metaMes.moeda) : 0;
  const saldoMeta = metaBRL - totalMes;
  const grafico = pontosGrafico(resumoMes.acumulado, nd);
  const maiorDiaRotulo = diaMaisGastou ? formatDateIso(diaMaisGastou.data) : '—';
  const metaStatus = !metaMes ? 'Defina uma meta mensal' : saldoMeta >= 0 ? `${Mc(saldoMeta)} restantes` : `${Mc(Math.abs(saldoMeta))} acima da meta`;
  const menorDiaRotulo = diaMenosGastou ? formatDateIso(diaMenosGastou.data) : 'Sem dados';
  const dsLista = diaSel ? dsDiaOrdenado : dsMes.slice().sort((a,b)=>b.data.localeCompare(a.data)||String(a.id).localeCompare(String(b.id)));
  const categoriasDoDia = [...new Set(dsDia.map(d => d.cat))];
  const pagamentosDoDia = [...new Set(dsDia.map(d => d.pg))];
  const maiorDia = dsDia.reduce((max, d) => {
    if (!max) return d;
    return valorEmBRL(d.valor, d.moeda) > valorEmBRL(max.valor, max.moeda) ? d : max;
  }, null);
  const resumoPg = resumoPagamento(pagamentoMaisUsado);

  return `<section class="diario-dashboard">
    <div class="card diario-hero"><div class="card-hd"><h3>Gasto do mês</h3>
      <div class="dir"><button class="btn-2" id="editMetaDiario">${metaMes ? 'Editar meta' : 'Definir meta'}</button></div></div>
      <div class="diario-hero-body">
        <div class="diario-hero-total">
          <span>Total do mês</span>
          <b>${Mc(totalMes)}</b>
          <small>${resumoMes.quantidade} lançamento(s) em ${diasComGasto || 0} dia(s)</small>
        </div>
        <div class="diario-hero-side">
          ${resumoItem('Maior gasto do mês', maiorGastoMes ? M(maiorGastoMes.valor, maiorGastoMes.moeda) : 'Sem dados', maiorGastoMes ? `${esc(maiorGastoMes.desc)} · ${formatDateIso(maiorGastoMes.data)}` : 'Sem lançamentos no mês')}
          ${resumoItem('Meta mensal', metaMes ? M(metaMes.valor, metaMes.moeda) : 'Sem dados', esc(metaStatus))}
          ${resumoItem('Comparação com o mês anterior', comparacaoAnterior.temDados ? `${comparacaoAnterior.diferenca >= 0 ? '+' : '-'} ${Mc(Math.abs(comparacaoAnterior.diferenca))}` : 'Sem dados', esc(resumoComparacao(comparacaoAnterior)))}
        </div>
      </div></div>

    <div class="diario-grid-top">
      <div class="card"><div class="card-hd"><h3>Calendário do mês</h3></div>
        <div class="diario-calendar-help">Clique em qualquer dia para focar o total, as categorias e a lista daquele dia.</div>
        <div class="diario-calendario">${Array.from({length: nd}, (_,i) => {
          const d = i + 1;
          const itens = diasPorDia[`${V.ano}-${String(V.mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`] || [];
          const totalDia = somaValor(itens);
          const sel = diaSel === d ? ' selected' : '';
          const badge = itens.length ? `<span class="badge">${itens.length}</span>` : '';
          return `<button class="dia${sel}${itens.length?' has':' no'}" data-dia="${d}" aria-pressed="${diaSel===d}" title="${itens.length ? `${itens.length} lançamento(s) · ${Mc(totalDia)}` : 'Nenhum lançamento neste dia.'}">
            <span class="n">${d}</span>
            <span class="diario-dia-total">${itens.length ? Mc(totalDia) : '—'}</span>${badge}</button>`;
        }).join('')}</div></div>

      <div class="card diario-dia-card"><div class="card-hd"><h3>${diaSel ? `Resumo de ${formatDate(V.ano, V.mes, diaSel)}` : 'Resumo do dia selecionado'}</h3>
        <div class="dir">${diaSel ? `<button class="btn btn-cofre" id="addDday">+ Novo gasto neste dia</button>` : `<button class="btn" id="addD">+ Novo gasto</button>`}</div></div>
        ${diaSel ? (qtd ? `<div class="diario-dia-grid">
            ${resumoItem('Total gasto no dia', Mc(totDia), `${qtd} lançamento(s)`)}
            ${resumoItem('Média do dia', Mc(mediaLanc), 'média por lançamento')}
            ${resumoItem('Maior gasto do dia', maiorDia ? M(maiorDia.valor, maiorDia.moeda) : 'Sem dados', maiorDia ? esc(maiorDia.desc) : 'Sem lançamentos')}
            ${resumoItem('Forma de pagamento', pgMais ? esc(pgMais.k) : 'Sem dados', pgMais ? Mc(pgMais.v) : 'Sem movimentação')}
            <div class="diario-stat diario-stat-full"><span>Categorias do dia</span><div class="diario-pills">${listaPills(categoriasDoDia, 'Sem dados')}</div></div>
            <div class="diario-stat diario-stat-full"><span>Pagamentos usados</span><div class="diario-pills">${listaPills(pagamentosDoDia, 'Sem dados')}</div></div>
          </div>` : `<div class="vazio diario-vazio-dia"><b>Nenhum lançamento neste dia.</b><p>Selecione outro dia ou use o botão acima para criar um lançamento com essa data.</p></div>`) : `<div class="vazio diario-vazio-dia"><b>Escolha um dia no calendário.</b><p>Ao clicar em um dia você verá o total gasto, categorias, forma de pagamento, média e o maior gasto daquele dia.</p></div>`}
      </div>
    </div>

    <div class="card"><div class="card-hd"><h3>Evolução acumulada de ${MESES[V.mes-1]}</h3></div>
      <div class="grafico-cabecalho">
        <p>Mostra quanto o gasto do mês foi crescendo dia após dia. Os pontos destacados marcam dias em que houve lançamento.</p>
        <div class="grafico-legend-inline"><span><i></i>Linha acumulada</span><span><i class="dot"></i>Dia com lançamento</span></div>
      </div>
      <div class="grafico-diario">
        <svg viewBox="0 0 ${grafico.w} ${grafico.h}" role="img" aria-label="Gastos acumulados do mês">
          <rect x="0" y="0" width="${grafico.w}" height="${grafico.h}" rx="10" fill="#F7FAF9"></rect>
          ${grafico.ticksY.map(t => `<g><line x1="${grafico.padX}" y1="${t.y.toFixed(1)}" x2="${grafico.w - grafico.padX}" y2="${t.y.toFixed(1)}" stroke="#D7E2E0" stroke-dasharray="4 4"></line><text x="10" y="${(t.y + 4).toFixed(1)}" font-size="11" fill="#5C7079">${esc(Mc(t.valor))}</text></g>`).join('')}
          <polyline fill="none" stroke="#D84315" stroke-width="3.5" points="${grafico.pts}"></polyline>
          ${grafico.ticksX.map(t => `<text x="${t.x.toFixed(1)}" y="${grafico.h - 6}" text-anchor="middle" font-size="11" fill="#5C7079">${t.dia}</text>`).join('')}
          ${grafico.totais.map(p => {
            const i = p.dia - 1;
            const x = grafico.padX + (i / Math.max(1, grafico.totais.length - 1)) * (grafico.w - grafico.padX * 2);
            const y = grafico.padY + (grafico.h - grafico.padY * 2) - (grafico.max ? (p.total / grafico.max) * (grafico.h - grafico.padY * 2) : 0);
            const destaque = grafico.diasComLancamento.has(p.dia);
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${destaque ? 4.5 : 2.5}" fill="${destaque ? '#0F6E5C' : '#D84315'}"><title>Dia ${p.dia}: ${Mc(p.total)} acumulados${destaque ? ' · houve lançamento' : ''}</title></circle>`;
          }).join('')}
          <text x="${grafico.w / 2}" y="${grafico.h - 20}" text-anchor="middle" font-size="11" fill="#5C7079">Dias do mês</text>
          <text x="14" y="16" font-size="11" fill="#5C7079">Valor acumulado</text>
        </svg>
        <div class="grafico-legenda"><span>Começa em <b>${Mc(0)}</b></span><span>Fecha em <b>${Mc(totalMes)}</b></span><span>Maior acumulado <b>${Mc(grafico.max)}</b></span></div>
      </div></div>

    <div class="card"><div class="card-hd"><h3>Resumo do mês</h3></div>
      <div class="diario-resumo-grid diario-resumo-mensal">
        <div class="kpi"><span>Total do mês</span><b>${Mc(totalMes)}</b><small>${resumoMes.quantidade ? `${resumoMes.quantidade} lançamento(s)` : 'Sem dados'}</small></div>
        <div class="kpi"><span>Média diária</span><b>${diasComGasto ? Mc(mediaPorDiaComGasto) : 'Sem dados'}</b><small>${diasComGasto ? `${diasComGasto} dia(s) com gasto` : 'Sem dados'}</small></div>
        <div class="kpi"><span>Maior gasto</span><b>${maiorGastoMes ? M(maiorGastoMes.valor, maiorGastoMes.moeda) : 'Sem dados'}</b><small>${maiorGastoMes ? esc(maiorGastoMes.desc) : 'Sem dados'}</small></div>
        <div class="kpi"><span>Menor gasto</span><b>${menorGastoMes ? M(menorGastoMes.valor, menorGastoMes.moeda) : 'Sem dados'}</b><small>${menorGastoMes ? esc(menorGastoMes.desc) : 'Sem dados'}</small></div>
        <div class="kpi"><span>Categoria que mais gastou</span><b class="kpi-multi">${categoriaMaior ? esc(categoriaMaior.k) : 'Sem dados'}</b><small>${categoriaMaior ? Mc(categoriaMaior.v) : 'Sem dados'}</small></div>
        <div class="kpi"><span>Categoria que menos gastou</span><b class="kpi-multi">${categoriaMenor ? esc(categoriaMenor.k) : 'Sem dados'}</b><small>${categoriaMenor ? Mc(categoriaMenor.v) : 'Sem dados'}</small></div>
        <div class="kpi"><span>Forma de pagamento mais usada</span><b class="kpi-multi">${resumoPg.titulo}</b><small>${resumoPg.detalhe}</small></div>
        <div class="kpi"><span>Dia com maior gasto</span><b>${diaMaisGastou ? Mc(diaMaisGastou.total) : 'Sem dados'}</b><small>${diaMaisGastou ? maiorDiaRotulo : 'Sem dados'}</small></div>
        <div class="kpi"><span>Dia com menor gasto</span><b>${diaMenosGastou ? Mc(diaMenosGastou.total) : 'Sem dados'}</b><small>${diaMenosGastou ? menorDiaRotulo : 'Sem dados'}</small></div>
        <div class="kpi"><span>Quantidade de lançamentos</span><b>${resumoMes.quantidade || 'Sem dados'}</b><small>${resumoMes.quantidade ? 'no mês selecionado' : 'Sem dados'}</small></div>
      </div></div>

    <div class="card"><div class="card-hd"><h3>${diaSel ? `Lançamentos de ${formatDate(V.ano,V.mes,diaSel)}` : `Lançamentos de ${MESES[V.mes-1]}`}</h3></div>
      ${diaSel && !qtd ? `<div class="vazio"><b>Nenhum lançamento neste dia.</b>
        <p style="margin:6px 0 14px">Use o botão abaixo para criar um gasto já com essa data.</p>
        <button class="btn btn-cofre" id="addDday">+ Novo lançamento</button></div>`
      : dsLista.length ? `<table class="tmes"><thead><tr><th>${diaSel ? 'Horário' : 'Dia'}</th><th>O quê</th><th>Categoria</th><th>${diaSel ? 'Local' : 'Pgto'}</th><th>${diaSel ? 'Pgto' : 'Obs'}</th><th class="num">Valor</th><th>${diaSel ? 'Obs' : ''}</th><th></th></tr></thead>
          <tbody>${dsLista.map(d=>`<tr class="lin" style="--c:${cor(d.cat)}">
            <td class="mono" style="font-size:12px;color:var(--ink-2)">${esc(d.hora||'')}</td>
            <td>${esc(d.desc)}</td>
            <td><span class="pill" style="background:${cor(d.cat)}1A;color:${cor(d.cat)}">${esc(d.cat)}</span></td>
            <td style="font-size:12px;color:var(--ink-2)">${diaSel ? esc(d.loc) : esc(d.pg)}</td>
            <td style="font-size:12px;color:var(--ink-2)">${esc(d.pg)}</td>
            <td class="num" style="font-weight:600">${M(d.valor)}</td>
            <td>${diaSel ? esc(d.obs||'') : ''}</td>
            <td style="text-align:right"><button class="acao" data-ed-diario="${d.id}">editar</button>
            <button class="acao del" data-del-diario="${d.id}" style="margin-left:8px">apagar</button></td></tr>`).join('')}</tbody>
          </table>` : `<div class="vazio"><b>Sem dados</b><p>Não há lançamentos no período selecionado.</p></div>`}
    </div>
  </section>`;
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
