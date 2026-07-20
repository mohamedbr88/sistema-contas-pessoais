// ============================================================================
//  Motor de Inteligência Financeira.
//  Só lê os dados já existentes e deriva indicadores novos sem alterar regra
//  de negócio, schema ou comportamento de telas atuais.
// ============================================================================
import { S, V, A0, MESES, CATS, CATD, cor, esc, noMes, viagemAtual } from './estado.js?v=20260720-4';
import { contasDoMes, diarioDoMes, resumoMes, somaEstimado, somaPago, somaValor, valorEmBRL } from './calculos.js?v=20260720-4';
import { M, Mc, VE } from './moeda.js?v=20260720-4';
import { baixar } from './ui.js?v=20260720-4';

const pad = n => String(n).padStart(2, '0');
const keyMes = (ano, mes) => `${ano}-${pad(mes)}`;
const hoje = () => new Date();
const diasNoMes = (ano, mes) => new Date(ano, mes, 0).getDate();
const isMesAtual = (ano, mes) => ano === hoje().getFullYear() && mes === hoje().getMonth() + 1;
const inicioHistorico = { ano: A0, mes: 5 };

function moverMes(ano, mes, delta) {
  const d = new Date(ano, mes - 1 + delta, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
}

function mesesAte(ano, mes) {
  const out = [];
  let cur = { ...inicioHistorico };
  while (cur.ano < ano || (cur.ano === ano && cur.mes <= mes)) {
    out.push({ ...cur });
    cur = moverMes(cur.ano, cur.mes, 1);
  }
  return out;
}

function mesesAnteriores(ano, mes, quantidade) {
  const out = [];
  for (let i = quantidade - 1; i >= 0; i--) out.push(moverMes(ano, mes, -i));
  return out;
}

function baseMovimentos() {
  const contas = S.tx.map(t => {
    const valor = t.st === 'Pago' ? (t.pago || 0) : (t.est || 0);
    return {
      origem: 'conta',
      tipo: t.st,
      id: t.id,
      data: t.data,
      cat: t.cat || 'Outros',
      loc: t.loc || '',
      pg: t.pg || '',
      moeda: t.moeda || 'BRL',
      valor,
      valorBRL: valorEmBRL(valor, t.moeda || 'BRL'),
      titulo: t.conta,
      detalhe: t.obs || '',
      viagemId: null,
      viagemNome: ''
    };
  });

  const diarias = S.diario.map(d => ({
    origem: 'diario',
    tipo: 'Gasto',
    id: d.id,
    data: d.data,
    cat: d.cat || 'Outros',
    loc: d.loc || '',
    pg: d.pg || '',
    moeda: d.moeda || 'BRL',
    valor: d.valor || 0,
    valorBRL: valorEmBRL(d.valor || 0, d.moeda || 'BRL'),
    titulo: d.desc,
    detalhe: d.obs || '',
    viagemId: null,
    viagemNome: ''
  }));

  const viagens = S.viagens.flatMap(v => {
    const hosp = (v.hosp || []).map(h => ({
      origem: 'viagem',
      tipo: 'Hospedagem',
      id: h.id,
      data: h.data,
      cat: 'Hospedagem',
      loc: h.cidade || v.destino || '',
      pg: '',
      moeda: h.moeda || v.moeda || 'EUR',
      valor: h.valor || 0,
      valorBRL: valorEmBRL(h.valor || 0, h.moeda || v.moeda || 'EUR'),
      titulo: h.nome || v.nome,
      detalhe: h.obs || '',
      viagemId: v.id,
      viagemNome: v.nome,
      cidade: h.cidade || '',
      pais: v.destino || v.nome
    }));
    const gastos = (v.gastos || []).map(g => ({
      origem: 'viagem',
      tipo: 'Gasto',
      id: g.id,
      data: g.data,
      cat: g.cat || 'Outros',
      loc: g.pg || '',
      pg: g.pg || '',
      moeda: g.moeda || v.moeda || 'EUR',
      valor: g.valor || 0,
      valorBRL: valorEmBRL(g.valor || 0, g.moeda || v.moeda || 'EUR'),
      titulo: g.desc,
      detalhe: g.obs || '',
      viagemId: v.id,
      viagemNome: v.nome,
      cidade: v.destino || '',
      pais: v.destino || v.nome
    }));
    return [...hosp, ...gastos];
  });

  return [...contas, ...diarias, ...viagens].sort((a, b) => a.data.localeCompare(b.data) || String(a.id).localeCompare(String(b.id)));
}

function grupoSomado(itens, chave) {
  return Object.values(itens.reduce((acc, item) => {
    const k = item[chave] || 'Outros';
    acc[k] = acc[k] || { k, qtd: 0, total: 0, totalBRL: 0, itens: [] };
    acc[k].qtd += 1;
    acc[k].total += item.valor || 0;
    acc[k].totalBRL += item.valorBRL || 0;
    acc[k].itens.push(item);
    return acc;
  }, {})).sort((a, b) => b.totalBRL - a.totalBRL || a.k.localeCompare(b.k));
}

function serieMensal(anoFinal, mesFinal, movsBase = baseMovimentos()) {
  return mesesAte(anoFinal, mesFinal).map(({ ano, mes }) => {
    const itens = movsBase.filter(m => noMes(m, ano, mes));
    const contas = contasDoMes(ano, mes);
    const diario = diarioDoMes(ano, mes);
    const resumo = resumoMes(ano, mes);
    const totalBRL = itens.reduce((s, i) => s + (i.valorBRL || 0), 0);
    const totalContasBRL = (resumo.pago || 0) + (resumo.pendente || 0);
    const totalDiarioBRL = somaValor(diario);
    const porCategoria = grupoSomado(itens, 'cat');
    const porMoeda = grupoSomado(itens, 'moeda');
    const maiorDia = diario.reduce((max, d) => {
      const v = valorEmBRL(d.valor || 0, d.moeda || 'BRL');
      if (!max || v > max.totalBRL) return { data: d.data, totalBRL: v, total: d.valor || 0, moeda: d.moeda || 'BRL' };
      return max;
    }, null);
    return {
      ano,
      mes,
      itens,
      contas,
      diario,
      resumo,
      totalBRL,
      totalContasBRL,
      totalDiarioBRL,
      porCategoria,
      porMoeda,
      maiorDia,
      label: `${MESES[mes - 1]}/${ano}`
    };
  });
}

function serieResumida(serie, alvo) {
  const base = serie.filter(x => x.ano === alvo.ano && x.mes === alvo.mes);
  return base[0] || null;
}

function sparkline(vals, corLine = '#0F6E5C') {
  if (!vals.length) return '';
  const w = 560;
  const h = 120;
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const span = Math.max(max - min, 1);
  const step = vals.length === 1 ? 0 : w / (vals.length - 1);
  const points = vals.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / span) * (h - 12) - 6;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="insight-spark" preserveAspectRatio="none">
    <polyline fill="none" stroke="${corLine}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" points="${points}"></polyline>
    ${vals.map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / span) * (h - 12) - 6;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${corLine}"></circle>`;
    }).join('')}
  </svg>`;
}

function media(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function formatPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;
}

function moedaLabel(m) {
  return m === 'BRL' ? 'R$' : m === 'USD' ? 'US$' : m === 'EUR' ? '€' : '₲';
}

function dataRefAtual(ano, mes) {
  const h = hoje();
  if (h.getFullYear() === ano && h.getMonth() + 1 === mes) return h.getDate();
  return diasNoMes(ano, mes);
}

function topoCategorias(serieAtual, serieAnterior) {
  const mapa = new Map();
  for (const item of serieAtual.itens) {
    const k = item.cat || 'Outros';
    mapa.set(k, (mapa.get(k) || 0) + (item.valorBRL || 0));
  }
  const mediaAnterior = new Map();
  const hist = serieAnterior;
  for (const cat of CATS.concat(CATD)) {
    const vals = hist.map(m => m.porCategoria.find(x => x.k === cat)?.totalBRL || 0).filter(v => v > 0);
    mediaAnterior.set(cat, media(vals));
  }
  return [...mapa.entries()].map(([k, total]) => {
    const avg = mediaAnterior.get(k) || 0;
    const dif = avg ? ((total - avg) / avg) * 100 : null;
    return { k, total, avg, dif };
  }).sort((a, b) => b.total - a.total);
}

function comparativosMensais(serie) {
  const atual = serie.at(-1);
  const anterior = serie.at(-2) || null;
  const meses3 = serie.slice(-3).map(x => x.totalBRL);
  const meses6 = serie.slice(-6).map(x => x.totalBRL);
  const meses12 = serie.slice(-12).map(x => x.totalBRL);
  const total3 = meses3.reduce((a, b) => a + b, 0);
  const total6 = meses6.reduce((a, b) => a + b, 0);
  const total12 = meses12.reduce((a, b) => a + b, 0);
  const media3 = media(meses3);
  const media6 = media(meses6);
  const media12 = media(meses12);
  return { atual, anterior, total3, total6, total12, media3, media6, media12 };
}

function resumoViagens() {
  return S.viagens.map(v => {
    const itens = [
      ...(v.hosp || []).map(h => ({
        data: h.data,
        totalBRL: valorEmBRL(h.valor || 0, h.moeda || v.moeda || 'EUR'),
        valor: h.valor || 0,
        moeda: h.moeda || v.moeda || 'EUR',
        cat: 'Hospedagem',
        cidade: h.cidade || v.destino || '',
        pais: v.destino || v.nome,
        nome: h.nome || v.nome
      })),
      ...(v.gastos || []).map(g => ({
        data: g.data,
        totalBRL: valorEmBRL(g.valor || 0, g.moeda || v.moeda || 'EUR'),
        valor: g.valor || 0,
        moeda: g.moeda || v.moeda || 'EUR',
        cat: g.cat || 'Outros',
        cidade: v.destino || '',
        pais: v.destino || v.nome,
        nome: g.desc || v.nome
      }))
    ];
    const totalBRL = itens.reduce((s, i) => s + i.totalBRL, 0);
    const dias = Math.max(1, Math.round((new Date(v.fim) - new Date(v.inicio)) / 864e5) + 1);
    const pessoas = Number(v.pessoas || v.passageiros || 0) || null;
    const porCategoria = grupoSomado(itens.map(i => ({ ...i, valorBRL: i.totalBRL, valor: i.valor })), 'cat');
    const porCidade = grupoSomado(itens.map(i => ({ ...i, valorBRL: i.totalBRL, valor: i.valor, cidade: i.cidade || '' })), 'cidade');
    const porPais = grupoSomado(itens.map(i => ({ ...i, valorBRL: i.totalBRL, valor: i.valor, pais: i.pais || '' })), 'pais');
    return {
      id: v.id,
      nome: v.nome,
      destino: v.destino || v.nome,
      moeda: v.moeda || 'EUR',
      totalBRL,
      totalMoeda: v.moeda || 'EUR',
      totalNaMoeda: itens.reduce((s, i) => s + (i.moeda === (v.moeda || 'EUR') ? i.valor : 0), 0),
      dias,
      custoDiaBRL: totalBRL / dias,
      custoPessoaBRL: pessoas ? totalBRL / pessoas : null,
      pessoas,
      porCategoria,
      porCidade,
      porPais,
      inicio: v.inicio,
      fim: v.fim,
      status: v.status || 'planejamento'
    };
  }).sort((a, b) => b.totalBRL - a.totalBRL);
}

export function resumoInsights() {
  const movs = baseMovimentos();
  const serie = serieMensal(V.ano, V.mes, movs);
  const totalAtual = serie.at(-1) || null;
  const totalAnterior = serie.at(-2) || null;
  const dataRef = dataRefAtual(V.ano, V.mes);
  const diasMes = diasNoMes(V.ano, V.mes);
  const diaBase = isMesAtual(V.ano, V.mes) ? dataRef : diasMes;
  const movsMes = movs.filter(m => noMes(m, V.ano, V.mes));
  const totalMesBRL = movsMes.reduce((s, i) => s + i.valorBRL, 0);
  const totalAcumuladoBRL = serie.reduce((s, m) => s + m.totalBRL, 0);
  const totalAnoBRL = serie.filter(x => x.ano === V.ano).reduce((s, m) => s + m.totalBRL, 0);
  const saldoPorMoeda = Object.values(movs.reduce((acc, m) => {
    const k = m.moeda || 'BRL';
    acc[k] = acc[k] || { moeda: k, total: 0, totalBRL: 0, qtd: 0 };
    acc[k].total += m.valor || 0;
    acc[k].totalBRL += m.valorBRL || 0;
    acc[k].qtd += 1;
    return acc;
  }, {})).sort((a, b) => b.totalBRL - a.totalBRL);

  const totaisMensais = serie.map(m => m.totalBRL);
  const totaisGastos = serie.map(m => m.totalDiarioBRL);
  const evolucaoPatrimonio = totaisMensais;
  const evolucaoGastos = totaisGastos;
  const variacaoMes = totalAnterior && totalAnterior.totalBRL ? ((totalAtual.totalBRL - totalAnterior.totalBRL) / totalAnterior.totalBRL) * 100 : null;
  const variacaoGastos = totalAnterior && totalAnterior.totalDiarioBRL ? ((totalAtual.totalDiarioBRL - totalAnterior.totalDiarioBRL) / totalAnterior.totalDiarioBRL) * 100 : null;
  const comparacaoAnoAnterior = serie.filter(x => x.ano === V.ano).reduce((s, m) => s + m.totalBRL, 0);
  const serieAnoAnterior = serie.filter(x => x.ano === V.ano - 1).reduce((s, m) => s + m.totalBRL, 0);
  const acumuladoAteMes = serie.filter(x => x.ano === V.ano && x.mes <= V.mes).reduce((s, m) => s + m.totalBRL, 0);
  const acumuladoAnoAnterior = serie.filter(x => x.ano === V.ano - 1 && x.mes <= V.mes).reduce((s, m) => s + m.totalBRL, 0);
  const mediaDiaria = diaBase ? totalAtual.totalBRL / diaBase : 0;
  const mediaSemanal = mediaDiaria * 7;
  const projecaoMes = mediaDiaria * diasMes;
  const projecaoAno = mediaDiaria * 365;
  const mediaHistorica3 = media(serie.slice(-3).map(x => x.totalBRL));
  const projecaoHist = mediaHistorica3 * 12;

  const categorias = topoCategorias(totalAtual, serie.slice(0, -1));
  const contasMes = contasDoMes(V.ano, V.mes).slice();
  const proximas = contasMes.filter(t => t.st === 'Pendente' && (() => {
    const hojeRef = hoje();
    const base = isMesAtual(V.ano, V.mes) ? hojeRef : new Date(V.ano, V.mes - 1, 1);
    const diff = (new Date(t.data) - base) / 864e5;
    return diff >= 0 && diff <= 7;
  })()).sort((a, b) => a.data.localeCompare(b.data));

  const maiorLancamento = movsMes.slice().sort((a, b) => b.valorBRL - a.valorBRL)[0] || null;
  const maiorDia = totalAtual?.maiorDia || null;
  const recordeDia = serie.reduce((max, m) => !max || (m.maiorDia?.totalBRL || 0) > (max.totalBRL || 0) ? m.maiorDia : max, null);
  const alertasCategorias = categorias.filter(c => c.avg > 0 && c.dif != null && c.dif > 20).slice(0, 5);
  const economias = totalAnterior ? totalAnterior.totalBRL - totalAtual.totalBRL : 0;
  const economiaPct = totalAnterior && totalAnterior.totalBRL ? (economias / totalAnterior.totalBRL) * 100 : null;

  const viagens = resumoViagens();
  const rankingViagens = viagens.slice(0, 8);
  const gastoCidade = viagens.flatMap(v => v.porCidade.map(c => ({ lugar: c.k || 'Sem cidade', totalBRL: c.totalBRL, viagem: v.nome, tipo: 'cidade' }))).sort((a, b) => b.totalBRL - a.totalBRL);
  const gastoPais = viagens.flatMap(v => v.porPais.map(c => ({ lugar: c.k || 'Sem país', totalBRL: c.totalBRL, viagem: v.nome, tipo: 'país' }))).sort((a, b) => b.totalBRL - a.totalBRL);

  const metasMes = S.metas.filter(m => m.prazo && m.prazo.slice(0, 7) === keyMes(V.ano, V.mes));
  const metasAno = S.metas.filter(m => m.prazo && +m.prazo.slice(0, 4) === V.ano);
  const orcamentoCategoria = categorias.slice(0, 8).map(c => ({
    cat: c.k,
    orcamento: c.avg > 0 ? c.avg * 1.1 : c.totalBRL,
    gasto: c.totalBRL,
    uso: c.avg > 0 ? (c.totalBRL / (c.avg * 1.1)) * 100 : 0,
    saldo: c.avg > 0 ? (c.avg * 1.1) - c.totalBRL : 0
  }));

  const insightsIA = [];
  if (maiorLancamento) insightsIA.push(`Principal gasto do período: ${maiorLancamento.titulo || 'lançamento'} em ${Mc(maiorLancamento.valorBRL)}.`);
  if (alertasCategorias[0]) insightsIA.push(`A categoria ${alertasCategorias[0].k} está ${formatPct(alertasCategorias[0].dif)} acima da média recente.`);
  if (economiaPct != null) insightsIA.push(economiaPct > 0 ? `Você economizou ${Mc(economias)} versus o mês anterior.` : `Você gastou ${Mc(Math.abs(economias))} a mais que o mês anterior.`);
  if (proximas.length) insightsIA.push(`${proximas.length} conta(s) vencem nos próximos 7 dias.`);
  if (mediaHistorica3 > 0) insightsIA.push(`Se a tendência continuar, o mês pode fechar perto de ${Mc(projecaoHist / 12)} e o ano em ${Mc(projecaoHist)}.`);
  if (totalAtual?.porCategoria?.[0]) insightsIA.push(`Tendência forte em ${totalAtual.porCategoria[0].k}, com ${Mc(totalAtual.porCategoria[0].totalBRL)} no mês.`);
  if (metasMes.length) insightsIA.push(`Há ${metasMes.length} meta(s) mensal(is) acompanhadas neste fechamento.`);

  return {
    serie,
    totalAtual,
    totalAnterior,
    saldoPorMoeda,
    totalMesBRL,
    totalAcumuladoBRL,
    totalAnoBRL,
    evolucaoPatrimonio,
    evolucaoGastos,
    variacaoMes,
    variacaoGastos,
    mediaDiaria,
    mediaSemanal,
    projecaoMes,
    projecaoAno,
    mediaHistorica3,
    projecaoHist,
    categorias,
    alertasCategorias,
    proximas,
    maiorLancamento,
    maiorDia,
    recordeDia,
    economias,
    economiaPct,
    metasMes,
    metasAno,
    orcamentoCategoria,
    viagens,
    rankingViagens,
    gastoCidade,
    gastoPais,
    insightsIA,
    comparacaoAnoAnterior,
    serieAnoAnterior,
    acumuladoAteMes,
    acumuladoAnoAnterior,
    diaBase
  };
}

function linhaTabela(cols) {
  return `<tr>${cols.map(c => `<td>${c}</td>`).join('')}</tr>`;
}

function secaoHtml(titulo, linhas) {
  return `<h2>${esc(titulo)}</h2><table>${linhas.join('')}</table>`;
}

function buildRelatorio(d) {
  const series = d.serie.map(x => [x.label, Mc(x.totalBRL), Mc(x.totalDiarioBRL), Mc(x.totalContasBRL)].join(';'));
  const rows = [];
  rows.push('Seção;Item;Valor;Detalhe');
  rows.push(`Resumo;Patrimônio atual;${d.totalAcumuladoBRL};Total acumulado do período`);
  rows.push(`Resumo;Gastos do mês;${d.totalMesBRL};Mês selecionado`);
  rows.push(`Resumo;Projeção do mês;${d.projecaoMes};Baseada na média diária`);
  rows.push('');
  rows.push('Serie mensal;Mes;Total;Gastos;Contas');
  d.serie.forEach(x => rows.push(`Serie mensal;${x.label};${x.totalBRL};${x.totalDiarioBRL};${x.totalContasBRL}`));
  return rows.join('\n');
}

function buildWorkbook(d) {
  const linhasSerie = d.serie.map(x => linhaTabela([
    esc(x.label), Mc(x.totalBRL), Mc(x.totalDiarioBRL), Mc(x.totalContasBRL)
  ])).join('');
  const linhasMoedas = d.saldoPorMoeda.map(x => linhaTabela([
    esc(x.moeda), M(x.total, x.moeda || 'BRL'), Mc(x.totalBRL), x.qtd
  ])).join('');
  const linhasCat = d.categorias.map(x => linhaTabela([
    esc(x.k), Mc(x.total), Mc(x.avg || 0), x.dif == null ? '—' : formatPct(x.dif)
  ])).join('');
  const linhasViagens = d.rankingViagens.map(x => linhaTabela([
    esc(x.nome), esc(x.destino), Mc(x.totalBRL), Mc(x.custoDiaBRL), x.custoPessoaBRL == null ? '—' : Mc(x.custoPessoaBRL)
  ])).join('');
  return `
  <html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;padding:18px;color:#16262C}
    h1,h2{margin:0 0 10px} h1{font-size:22px} h2{font-size:15px;margin-top:18px}
    table{border-collapse:collapse;width:100%;margin-top:8px}
    th,td{border:1px solid #D6DFE0;padding:7px 8px;font-size:12px;text-align:left}
    th{background:#F3F7F6;text-transform:uppercase;letter-spacing:.06em;font-size:10px}
    .muted{color:#5C7079;font-size:12px}
  </style></head><body>
    <h1>Relatório de Inteligência Financeira</h1>
    <div class="muted">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
    <h2>Resumo</h2>
    <table><thead><tr><th>Indicador</th><th>Valor</th><th>Detalhe</th></tr></thead><tbody>
      ${linhaTabela(['Patrimônio atual', Mc(d.totalAcumuladoBRL), 'Total acumulado'])}
      ${linhaTabela(['Saldo do mês', Mc(d.totalMesBRL), 'Movimentos do mês selecionado'])}
      ${linhaTabela(['Projeção do mês', Mc(d.projecaoMes), 'Base média diária'])}
      ${linhaTabela(['Projeção anual', Mc(d.projecaoAno), 'Extrapolação da média diária'])}
    </tbody></table>
    <h2>Evolução mensal</h2>
    <table><thead><tr><th>Mês</th><th>Total</th><th>Gastos</th><th>Contas</th></tr></thead><tbody>${linhasSerie}</tbody></table>
    <h2>Moedas</h2>
    <table><thead><tr><th>Moeda</th><th>Valor</th><th>BRL</th><th>Itens</th></tr></thead><tbody>${linhasMoedas}</tbody></table>
    <h2>Categoria</h2>
    <table><thead><tr><th>Categoria</th><th>Total</th><th>Média</th><th>Variação</th></tr></thead><tbody>${linhasCat}</tbody></table>
    <h2>Viagens</h2>
    <table><thead><tr><th>Viagem</th><th>Destino</th><th>Total</th><th>Custo/dia</th><th>Custo/pessoa</th></tr></thead><tbody>${linhasViagens}</tbody></table>
  </body></html>`;
}

export function exportarInsightsCsv() {
  const d = resumoInsights();
  const rows = [];
  rows.push(['Seção', 'Item', 'Valor', 'Detalhe']);
  rows.push(['Resumo', 'Patrimônio atual', Mc(d.totalAcumuladoBRL), 'Total acumulado']);
  rows.push(['Resumo', 'Gastos do mês', Mc(d.totalMesBRL), 'Mês selecionado']);
  rows.push(['Resumo', 'Projeção do mês', Mc(d.projecaoMes), 'Base diária']);
  rows.push(['']);
  rows.push(['Moeda', 'Total', 'BRL', 'Itens']);
  d.saldoPorMoeda.forEach(x => rows.push([x.moeda, M(x.total, x.moeda || 'BRL'), Mc(x.totalBRL), x.qtd]));
  rows.push(['']);
  rows.push(['Categoria', 'Total', 'Média', 'Variação']);
  d.categorias.forEach(x => rows.push([x.k, Mc(x.total), Mc(x.avg || 0), x.dif == null ? '—' : formatPct(x.dif)]));
  const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  baixar(`inteligencia-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
}

export function exportarInsightsXls() {
  const d = resumoInsights();
  const html = buildWorkbook(d);
  baixar(`inteligencia-${new Date().toISOString().slice(0, 10)}.xls`, html, 'application/vnd.ms-excel');
}

export function imprimirInsights() {
  const d = resumoInsights();
  const html = buildWorkbook(d);
  const w = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
  if (!w) {
    throw new Error('O navegador bloqueou a janela de impressão.');
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

export function gerarDadosInsights() {
  return resumoInsights();
}
