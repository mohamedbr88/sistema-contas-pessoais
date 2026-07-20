// ============================================================================
//  Tela "Dia a dia": gasto solto do mês (mercado, restaurante, uber).
// ============================================================================

import { diarioDoMes, resumoDiarioMes, somaValor, agruparDiario, valorEmBRL } from '../calculos.js?v=20260720-4';
import { CATD, MESES, PAGD, LOCS, S, V, cor, esc } from '../estado.js?v=20260720-4';
import { conv, M, MOEDAS, Mc } from '../moeda.js';
import { despesasApi, metasApi } from '../api.js?v=20260720-4';
import { formGen } from '../ui.js';

function formatDate(year, month, day) {
  return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
}

function formatDateIso(data) {
  if (!data) return '—';
  return `${data.slice(8,10)}/${data.slice(5,7)}/${data.slice(0,4)}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function horaNormalizada(hora) {
  if (!hora) return '';
  const [h = '0', m = '0', s = '0'] = String(hora).split(':');
  return `${pad2(+h || 0)}:${pad2(+m || 0)}:${pad2(+s || 0)}`;
}

function horaFromCreatedAt(createdAt) {
  if (!createdAt) return '';
  const dt = new Date(createdAt);
  if (Number.isNaN(dt.getTime())) return '';
  const partes = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo'
  }).formatToParts(dt);
  const pick = tipo => partes.find(p => p.type === tipo)?.value || '00';
  return `${pick('hour')}:${pick('minute')}:${pick('second')}`;
}

function horaExibicao(d) {
  return horaNormalizada(d.hora) || horaFromCreatedAt(d.createdAt || d.created_at) || '—';
}

function segundosDaHora(hora) {
  const [h = '0', m = '0', s = '0'] = hora.split(':');
  return (+h || 0) * 3600 + (+m || 0) * 60 + (+s || 0);
}

function createdAtTs(d) {
  const ts = Date.parse(d.createdAt || d.created_at || '');
  return Number.isFinite(ts) ? ts : 0;
}

function idDesc(a, b) {
  return String(b.id || '').localeCompare(String(a.id || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function ordenarDiarioRecente(a, b) {
  const porData = String(b.data || '').localeCompare(String(a.data || ''));
  if (porData) return porData;

  const horaA = horaNormalizada(a.hora) || horaFromCreatedAt(a.createdAt || a.created_at) || '00:00:00';
  const horaB = horaNormalizada(b.hora) || horaFromCreatedAt(b.createdAt || b.created_at) || '00:00:00';
  const porHora = segundosDaHora(horaB) - segundosDaHora(horaA);
  if (porHora) return porHora;

  const porCreatedAt = createdAtTs(b) - createdAtTs(a);
  if (porCreatedAt) return porCreatedAt;

  return idDesc(a, b);
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

function valorCalendarioCompacto(totalBRL) {
  const moedaTela = S.moeda || 'BRL';
  const info = MOEDAS[moedaTela] || MOEDAS.BRL;
  const convertido = conv(totalBRL || 0, 'BRL', moedaTela);
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: info.c,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(convertido);
  } catch (e) {
    return M(totalBRL, 'BRL');
  }
}

function divisorMediaDiaria(ano, mes, nd, itensDia) {
  const hoje = new Date();
  const chaveAtual = hoje.getFullYear() * 12 + (hoje.getMonth() + 1);
  const chaveSel = ano * 12 + mes;
  if (chaveSel < chaveAtual) return nd;
  if (chaveSel === chaveAtual) return Math.min(hoje.getDate(), nd);
  return itensDia.filter(item => item.qtd > 0).length;
}

function estruturaFluxoMes(itensDia, mediaDiaria, limiteDiario) {
  const mobile = typeof window !== 'undefined' && window.innerWidth <= 720;
  const w = 700, h = mobile ? 210 : 180, padX = 42, padY = mobile ? 26 : 22;
  const usableW = w - padX * 2;
  const usableH = h - padY * 2;
  const n = Math.max(1, itensDia.length);
  const step = usableW / n;
  const barW = Math.max(2.2, step * (mobile ? 0.72 : 0.68));
  const maxValor = Math.max(
    ...itensDia.map(item => item.total),
    mediaDiaria || 0,
    limiteDiario || 0,
    0
  );
  const maxEscala = maxValor || 1;
  const yPorValor = valor => padY + usableH - ((valor / maxEscala) * usableH);
  const ticksY = Array.from({ length: 4 }, (_, i) => {
    const ratio = i / 3;
    const valor = maxEscala * (1 - ratio);
    const y = padY + usableH * ratio;
    return { valor, y };
  });
  const ticksX = itensDia.filter((_, idx) => idx === 0 || idx === itensDia.length - 1 || idx % Math.max(1, Math.ceil(itensDia.length / 6)) === 0)
    .map((item, idx) => ({
      dia: item.dia,
      x: padX + (idx * step) + (step / 2)
    }));
  const bars = itensDia.map((item, idx) => {
    const x = padX + (idx * step) + ((step - barW) / 2);
    const hBar = item.total ? Math.max((item.total / maxEscala) * usableH, 2.5) : 0;
    const y = padY + usableH - hBar;
    return { ...item, x, y, w: barW, h: hBar };
  });
  return {
    w, h, padX, padY, usableH, ticksY, ticksX, maxEscala,
    yMedia: yPorValor(mediaDiaria || 0),
    yLimite: limiteDiario == null ? null : yPorValor(limiteDiario),
    bars
  };
}

function maiorSequenciaDiasComGasto(itensDia) {
  let atual = 0;
  let maior = 0;
  itensDia.forEach(item => {
    if (item.qtd > 0) {
      atual += 1;
      maior = Math.max(maior, atual);
      return;
    }
    atual = 0;
  });
  return maior;
}

function diaMaisEconomicoComGasto(itensDia) {
  return itensDia
    .filter(item => item.qtd > 0)
    .sort((a, b) => a.total - b.total || a.dia - b.dia)[0] || null;
}

function mesAnoAnterior(ano, mes) {
  if (mes > 1) return { ano, mes: mes - 1 };
  return { ano: ano - 1, mes: 12 };
}

function resumoOndeFoiDinheiro(dsMes, totalMes) {
  const porCategoria = new Map();
  dsMes.forEach(d => {
    const categoria = (d.cat || '').trim() || 'Sem categoria';
    const atual = porCategoria.get(categoria) || { k: categoria, v: 0, qtd: 0 };
    atual.v += valorEmBRL(d.valor, d.moeda);
    atual.qtd += 1;
    porCategoria.set(categoria, atual);
  });
  const itens = [...porCategoria.values()]
    .sort((a, b) => b.v - a.v || a.k.localeCompare(b.k))
    .map(item => ({
      ...item,
      pct: totalMes ? (item.v / totalMes) * 100 : 0
    }));
  const max = Math.max(...itens.map(item => item.v), 1);
  const totalCategorias = itens.reduce((s, item) => s + item.v, 0);
  return { itens, max, totalCategorias };
}

function resumoGastoPorDiaMes(dsMes, ano, mes) {
  const nd = new Date(ano, mes, 0).getDate();
  const prefixo = `${ano}-${String(mes).padStart(2, '0')}`;
  const itens = Array.from({ length: nd }, (_, idx) => ({
    dia: idx + 1,
    data: `${prefixo}-${String(idx + 1).padStart(2, '0')}`,
    total: 0,
    qtd: 0,
    maior: null
  }));

  dsMes.forEach(d => {
    const dia = +d.data.slice(8, 10);
    if (dia < 1 || dia > nd) return;
    const item = itens[dia - 1];
    const valor = valorEmBRL(d.valor, d.moeda);
    item.total += valor;
    item.qtd += 1;
    if (!item.maior || valor > valorEmBRL(item.maior.valor, item.maior.moeda)) {
      item.maior = d;
    }
  });

  const max = Math.max(...itens.map(item => item.total), 0);
  const totalDias = itens.reduce((s, item) => s + item.total, 0);
  const diaMaisGasto = itens.filter(item => item.total > 0)
    .sort((a, b) => b.total - a.total || a.data.localeCompare(b.data))[0] || null;
  return { itens, max, totalDias, diaMaisGasto };
}

function tooltipGastoDiaMes(item, ano, mes) {
  const maior = item.maior
    ? `${esc(item.maior.desc || 'Sem descrição')} (${M(item.maior.valor, item.maior.moeda)})`
    : 'Sem lançamentos';
  return `${formatDate(ano, mes, item.dia)} · ${Mc(item.total)} · ${item.qtd} lançamento(s) · maior: ${maior}`;
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
  const dsDiaOrdenado = dsDia.slice().sort(ordenarDiarioRecente);
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
  const maiorDiaRotulo = diaMaisGastou ? formatDateIso(diaMaisGastou.data) : '—';
  const metaStatus = !metaMes ? 'Defina uma meta mensal' : saldoMeta >= 0 ? `${Mc(saldoMeta)} restantes` : `${Mc(Math.abs(saldoMeta))} acima da meta`;
  const menorDiaRotulo = diaMenosGastou ? formatDateIso(diaMenosGastou.data) : 'Sem dados';
  const dsLista = diaSel ? dsDiaOrdenado : dsMes.slice().sort(ordenarDiarioRecente);
  const diaPicoCalendario = diaMaisGastou ? +diaMaisGastou.data.slice(8, 10) : null;
  const categoriasDoDia = [...new Set(dsDia.map(d => d.cat))];
  const pagamentosDoDia = [...new Set(dsDia.map(d => d.pg))];
  const maiorDia = dsDia.reduce((max, d) => {
    if (!max) return d;
    return valorEmBRL(d.valor, d.moeda) > valorEmBRL(max.valor, max.moeda) ? d : max;
  }, null);
  const resumoPg = resumoPagamento(pagamentoMaisUsado);
  const ondeFoi = resumoOndeFoiDinheiro(dsMes, totalMes);
  const gastoPorDia = resumoGastoPorDiaMes(dsMes, V.ano, V.mes);
  const divisorMedia = divisorMediaDiaria(V.ano, V.mes, nd, gastoPorDia.itens);
  const mediaDiariaFluxo = divisorMedia > 0 ? totalMes / divisorMedia : 0;
  const limiteDiarioIdeal = metaMes ? (metaBRL / nd) : null;
  const fluxo = estruturaFluxoMes(gastoPorDia.itens, mediaDiariaFluxo, limiteDiarioIdeal);
  const nomeMesLower = MESES[V.mes-1].toLowerCase();
  const maiorDiaFluxo = gastoPorDia.diaMaisGasto;
  const maiorDiaResumo = maiorDiaFluxo ? `${maiorDiaFluxo.dia} de ${nomeMesLower} — ${Mc(maiorDiaFluxo.total)}` : 'Sem dados';
  const maiorSequenciaFluxo = maiorSequenciaDiasComGasto(gastoPorDia.itens);
  const diaMaisEconomicoFluxo = diaMaisEconomicoComGasto(gastoPorDia.itens);
  const diaMaisEconomicoResumo = diaMaisEconomicoFluxo ? `${diaMaisEconomicoFluxo.dia} de ${nomeMesLower} — ${Mc(diaMaisEconomicoFluxo.total)}` : 'Sem dados';
  const projecaoMes = mediaDiariaFluxo * nd;
  const diasSemLancamento = Math.max(0, nd - (diasComGasto || 0));
  const statusMeta = (() => {
    if (!metaMes) {
      return { classe: 'neutral', titulo: 'Defina um orçamento mensal para ativar este indicador.', detalhe: '' };
    }
    const razao = metaBRL > 0 ? (projecaoMes / metaBRL) : 0;
    if (razao < 0.95) return { classe: 'ok', titulo: 'Abaixo do planejado', detalhe: `Projeção ${Mc(projecaoMes)} para orçamento ${M(metaMes.valor, metaMes.moeda)}` };
    if (razao <= 1.05) return { classe: 'warn', titulo: 'Dentro do esperado', detalhe: `Projeção ${Mc(projecaoMes)} para orçamento ${M(metaMes.valor, metaMes.moeda)}` };
    return { classe: 'danger', titulo: 'Acima do esperado', detalhe: `Projeção ${Mc(projecaoMes)} para orçamento ${M(metaMes.valor, metaMes.moeda)}` };
  })();
  const mesAnteriorRef = mesAnoAnterior(V.ano, V.mes);
  const nomeMesAnterior = MESES[mesAnteriorRef.mes - 1];
  const totalMesAnterior = comparacaoAnterior.temDados ? (comparacaoAnterior.total || 0) : 0;
  const difAnterior = comparacaoAnterior.temDados ? (comparacaoAnterior.diferenca || 0) : 0;
  const pctAnterior = comparacaoAnterior.temDados && comparacaoAnterior.percentual != null
    ? comparacaoAnterior.percentual : null;
  const setaAnterior = pctAnterior == null ? '→' : pctAnterior > 0 ? '↑' : pctAnterior < 0 ? '↓' : '→';
  const fimSemanaTotal = gastoPorDia.itens.reduce((acc, item) => {
    const wd = new Date(V.ano, V.mes - 1, item.dia).getDay();
    const isFimSemana = wd === 0 || wd === 6;
    return isFimSemana ? acc + item.total : acc;
  }, 0);
  const pctFimSemana = totalMes > 0 ? (fimSemanaTotal / totalMes) * 100 : 0;
  const diasAcimaMedia = gastoPorDia.itens.filter(item => item.qtd > 0 && item.total > mediaDiariaFluxo).length;
  const ndAnterior = new Date(mesAnteriorRef.ano, mesAnteriorRef.mes, 0).getDate();
  const mediaAnterior = comparacaoAnterior.temDados ? (totalMesAnterior / ndAnterior) : 0;
  const deltaMediaAnteriorPct = mediaAnterior > 0 ? ((mediaDiariaFluxo - mediaAnterior) / mediaAnterior) * 100 : null;
  const insights = [];
  if (!resumoMes.quantidade) {
    insights.push('Sem lançamentos no mês selecionado para gerar insights.');
  } else {
    if (maiorDiaFluxo) insights.push(`Seu maior gasto ocorreu no dia ${maiorDiaFluxo.dia}.`);
    insights.push(`Você gastou acima da média em ${diasAcimaMedia} dia(s).`);
    insights.push(`Os finais de semana representam ${pctFimSemana.toFixed(0)}% das despesas.`);
    if (categoriaMaior) insights.push(`${categoriaMaior.k} continua sendo sua principal categoria.`);
    if (deltaMediaAnteriorPct != null) {
      const abs = Math.abs(deltaMediaAnteriorPct).toFixed(0);
      const dir = deltaMediaAnteriorPct > 0 ? 'aumentou' : deltaMediaAnteriorPct < 0 ? 'reduziu' : 'se manteve estável';
      insights.push(dir === 'se manteve estável'
        ? 'Sua média diária se manteve estável em relação ao mês anterior.'
        : `Sua média diária ${dir} ${abs}% em relação ao mês anterior.`);
    }
  }

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
        <div class="diario-calendario-wrap"><div class="diario-calendario">${Array.from({length: nd}, (_,i) => {
          const d = i + 1;
          const itens = diasPorDia[`${V.ano}-${String(V.mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`] || [];
          const totalDia = somaValor(itens);
          const sel = diaSel === d ? ' selected' : '';
          const pico = diaPicoCalendario === d ? ' is-max' : '';
          const badge = itens.length ? `<span class="badge">${itens.length}</span>` : '';
          const valorCompacto = itens.length ? valorCalendarioCompacto(totalDia) : '—';
          const valorCompleto = itens.length ? M(totalDia, 'BRL') : 'Nenhum lançamento neste dia.';
          const esconderValor = !itens.length || (window.innerWidth <= 360 && valorCompacto.length > 9);
          return `<button class="dia${sel}${pico}${itens.length?' has':' no'}" data-dia="${d}" aria-pressed="${diaSel===d}" title="${itens.length ? `${itens.length} lançamento(s) · ${valorCompleto}` : valorCompleto}">
            <span class="n">${d}</span>
            ${badge}
            <span class="diario-dia-total${esconderValor ? ' is-hidden' : ''}">${valorCompacto}</span></button>`;
        }).join('')}</div></div></div>

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

    <div class="card"><div class="card-hd"><h3>FLUXO DO MÊS — ${MESES[V.mes-1].toUpperCase()}</h3></div>
      <div class="grafico-cabecalho">
        <p>Compare seus gastos diários com a média do mês e o limite diário planejado.</p>
        <div class="grafico-legend-inline"><span><i class="bar"></i>Gasto do dia</span><span><i class="avg"></i>Média diária</span><span><i class="limit"></i>Limite diário ideal</span></div>
      </div>
      <div class="grafico-diario">
        <svg class="diario-evolucao" viewBox="0 0 ${fluxo.w} ${fluxo.h}" role="img" aria-label="Fluxo diário de gastos do mês">
          <rect x="0" y="0" width="${fluxo.w}" height="${fluxo.h}" rx="10" fill="#F7FAF9"></rect>
          ${fluxo.ticksY.map(t => `<g><line x1="${fluxo.padX}" y1="${t.y.toFixed(1)}" x2="${fluxo.w - fluxo.padX}" y2="${t.y.toFixed(1)}" stroke="#D7E2E0" stroke-dasharray="4 4"></line><text x="10" y="${(t.y + 4).toFixed(1)}" font-size="11" fill="#5C7079">${esc(Mc(t.valor))}</text></g>`).join('')}
          ${fluxo.bars.map(item => {
            const destaque = maiorDiaFluxo && maiorDiaFluxo.dia === item.dia;
            const valorLabel = Mc(item.total);
            const pctMes = totalMes > 0 ? Math.round((item.total / totalMes) * 100) : 0;
            const dataCompleta = `${item.dia} de ${nomeMesLower} de ${V.ano}`;
            const tip = `${dataCompleta}\n${valorLabel}\n${item.qtd} lançamentos\n${pctMes}% do gasto do mês`;
            const tipTouch = `${dataCompleta} — ${valorLabel} — ${item.qtd} lançamentos — ${pctMes}% do gasto do mês`;
            const xCentro = item.x + (item.w / 2);
            return `<g class="fluxo-bar-group${destaque ? ' is-peak' : ''}" data-fluxo-tip="${esc(tipTouch)}" style="cursor:pointer">
              <line class="fluxo-guide" x1="${xCentro.toFixed(1)}" y1="${fluxo.padY.toFixed(1)}" x2="${xCentro.toFixed(1)}" y2="${(fluxo.padY + fluxo.usableH).toFixed(1)}"></line>
              <rect class="fluxo-bar" x="${item.x.toFixed(1)}" y="${item.y.toFixed(1)}" width="${item.w.toFixed(1)}" height="${item.h.toFixed(1)}" rx="3.8" fill="${destaque ? '#116A66' : '#D84315'}" opacity="${item.total ? (destaque ? '0.98' : '0.84') : '0.24'}"></rect>
              <title>${tip}</title>
            </g>`;
          }).join('')}
          <line x1="${fluxo.padX}" y1="${fluxo.yMedia.toFixed(1)}" x2="${fluxo.w - fluxo.padX}" y2="${fluxo.yMedia.toFixed(1)}" stroke="#0D5C56" stroke-width="2.6" stroke-dasharray="7 4"></line>
          ${fluxo.yLimite == null ? '' : `<line x1="${fluxo.padX}" y1="${fluxo.yLimite.toFixed(1)}" x2="${fluxo.w - fluxo.padX}" y2="${fluxo.yLimite.toFixed(1)}" stroke="#2F4F9E" stroke-width="2.4" stroke-dasharray="3 6"></line>`}
          ${fluxo.ticksX.map(t => `<text x="${t.x.toFixed(1)}" y="${fluxo.h - 6}" text-anchor="middle" font-size="11" fill="#5C7079">${t.dia}</text>`).join('')}
          <text x="14" y="16" font-size="11.5" font-weight="600" fill="#3E525B">Valor por dia</text>
          <text x="${fluxo.w / 2}" y="${fluxo.h - 20}" text-anchor="middle" font-size="11" fill="#5C7079">Dias do mês</text>
        </svg>
        ${limiteDiarioIdeal == null ? `<div class="fluxo-alerta">Defina um orçamento mensal para acompanhar seu limite diário</div>` : ''}
          <div class="grafico-legenda fluxo-resumo"><span>Total gasto: <b>${Mc(totalMes)}</b></span><span>Média diária: <b>${Mc(mediaDiariaFluxo)}</b></span><span>Maior dia: <b>${maiorDiaResumo}</b></span><span>Dias com gasto: <b>${diasComGasto || 0}</b></span><span>Maior sequência: <b>${maiorSequenciaFluxo || 0} dia(s)</b></span><span>Dia mais econômico: <b>${diaMaisEconomicoResumo}</b></span></div>
          <div class="fluxo-intel-grid">
            <div class="fluxo-intel-item">
              <span>Projeção do fechamento do mês</span>
              <b>Projeção do mês: ${Mc(projecaoMes)}</b>
              <small>Estimativa baseada na média diária atual.</small>
            </div>
            <div class="fluxo-intel-item fluxo-status ${statusMeta.classe}">
              <span>Status do mês</span>
              <b>${statusMeta.classe === 'ok' ? '🟢' : statusMeta.classe === 'warn' ? '🟡' : statusMeta.classe === 'danger' ? '🔴' : '⚪'} ${statusMeta.titulo}</b>
              <small>${statusMeta.detalhe}</small>
            </div>
            <div class="fluxo-intel-item">
              <span>Comparação com ${nomeMesAnterior}</span>
              ${comparacaoAnterior.temDados
                ? `<b>${setaAnterior} ${pctAnterior == null ? '0,0' : Math.abs(pctAnterior).toFixed(1).replace('.', ',')}% em relação a ${nomeMesAnterior}</b>
                  <small>${nomeMesAnterior}: ${Mc(totalMesAnterior)} · Diferença: ${difAnterior >= 0 ? '+' : '-'} ${Mc(Math.abs(difAnterior))}</small>`
                : `<b>Sem base de comparação</b><small>Sem lançamentos no mês anterior.</small>`}
            </div>
            <div class="fluxo-intel-item">
              <span>Dias sem gastos</span>
              <b>Você teve ${diasSemLancamento} dia(s) sem lançamentos neste mês.</b>
              <small>Total de dias no mês: ${nd}.</small>
            </div>
            <div class="fluxo-intel-item">
              <span>Maior categoria</span>
              ${categoriaMaior
                ? `<b>${esc(categoriaMaior.k)}</b><small>${Mc(categoriaMaior.v)} · ${(totalMes > 0 ? (categoriaMaior.v / totalMes) * 100 : 0).toFixed(0)}% do total</small>`
                : `<b>Sem dados</b><small>Nenhum gasto categorizado neste mês.</small>`}
            </div>
            <div class="fluxo-intel-item fluxo-intel-resumo">
              <span>Resumo Inteligente</span>
              <ul>${insights.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
            </div>
          </div>
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

    <div class="grid2 diario-graficos-mes">
      <div class="card"><div class="card-hd"><h3>Onde foi o dinheiro no mês</h3></div>
        <div class="diario-categorias-mes">
          ${!ondeFoi.itens.length
            ? `<div class="vazio" style="padding:26px 16px">Nada gasto ainda.<br>As barras aparecem no primeiro lançamento.</div>`
            : ondeFoi.itens.map(item => `<div class="barra diario-barra-cat"><div class="lab"><b>${esc(item.k)}</b><small>${item.pct.toFixed(0)}% · ${item.qtd} lançamento(s)</small></div>
                <div class="trilho"><div class="fill" style="width:${(item.v / ondeFoi.max) * 100}%;background:${cor(item.k)}"></div></div>
                <div class="v">${Mc(item.v)}</div></div>`).join('')}
        </div>
        <div class="diario-grafico-soma">Total das categorias: <b>${Mc(ondeFoi.totalCategorias)}</b></div>
      </div>

      <div class="card"><div class="card-hd"><h3>Gasto por dia do mês</h3><div class="dir" style="font-size:11px;color:var(--ink-2)">só o dia a dia</div></div>
        <div class="diario-gasto-dia-wrap">
          ${!resumoMes.quantidade
            ? `<div class="vazio" style="width:100%;padding:26px 16px">Sem gasto lançado.</div>`
            : `<div class="diario-gasto-dia-bars">${gastoPorDia.itens.map(item => {
                const alturaBase = gastoPorDia.max ? (item.total / gastoPorDia.max) * 100 : 0;
                const altura = item.total > 0 ? Math.max(alturaBase, 3.2) : 0;
                const destaque = gastoPorDia.diaMaisGasto && gastoPorDia.diaMaisGasto.dia === item.dia;
                return `<button class="diario-dia-bar${item.total ? '' : ' zero'}${destaque ? ' is-max' : ''}${diaSel === item.dia ? ' selected' : ''}" data-dia="${item.dia}" title="${esc(tooltipGastoDiaMes(item, V.ano, V.mes))}" aria-label="Dia ${item.dia}: ${Mc(item.total)}" style="height:${altura.toFixed(2)}%"></button>`;
              }).join('')}</div>
              <div class="diario-gasto-dia-labels">${gastoPorDia.itens.map(item => `<span class="diario-dia-col-label">${item.dia}</span>`).join('')}</div>
              <div class="diario-gasto-dia-meta"><span class="mono">total do mês: ${Mc(gastoPorDia.totalDias)}</span><span class="mono">maior dia: ${gastoPorDia.diaMaisGasto ? formatDateIso(gastoPorDia.diaMaisGasto.data) : 'Sem dados'}</span><span class="mono">valor do maior dia: ${gastoPorDia.diaMaisGasto ? Mc(gastoPorDia.diaMaisGasto.total) : 'Sem dados'}</span></div>`}
        </div>
      </div>
    </div>

    <div class="card"><div class="card-hd"><h3>${diaSel ? `Lançamentos de ${formatDate(V.ano,V.mes,diaSel)}` : `Lançamentos de ${MESES[V.mes-1]}`}</h3></div>
      ${diaSel && !qtd ? `<div class="vazio"><b>Nenhum lançamento neste dia.</b>
        <p style="margin:6px 0 14px">Use o botão abaixo para criar um gasto já com essa data.</p>
        <button class="btn btn-cofre" id="addDday">+ Novo lançamento</button></div>`
      : dsLista.length ? `<table class="tmes"><thead><tr><th>Data e hora</th><th>O quê</th><th>Categoria</th><th>${diaSel ? 'Local' : 'Pgto'}</th><th>${diaSel ? 'Pgto' : 'Obs'}</th><th class="num">Valor</th><th>${diaSel ? 'Obs' : ''}</th><th></th></tr></thead>
          <tbody>${dsLista.map(d=>`<tr class="lin" style="--c:${cor(d.cat)}">
        <td class="mono" style="font-size:12px;color:var(--ink-2)"><div>${formatDateIso(d.data)}</div><div>${horaExibicao(d)}</div></td>
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

function arred2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function formMetaDiario(){
  const atual = metasApi.doMes(V.ano, V.mes);
  formGen(`Meta de ${MESES[V.mes-1]} / ${V.ano}`,[
    {k:'valor',l:`Meta na moeda exibida (${S.moeda || 'BRL'})`,tipo:'number'},
  ], { valor: atual ? arred2(MetasValorLocal(atual)) : 0 }, async o => {
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
