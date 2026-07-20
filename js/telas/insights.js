// ============================================================================
//  Tela Insights: inteligência financeira, comparativos, projeções e exports.
// ============================================================================
import { esc, MESES, cor } from '../estado.js?v=20260720-7';
import { M, Mc, VE } from '../moeda.js?v=20260720-7';
import { exportarInsightsCsv, exportarInsightsXls, imprimirInsights, gerarDadosInsights } from '../inteligencia.js';

function sparkline(vals, corLine = '#0F6E5C') {
  if (!vals.length) return '<div class="vazio">Sem dados suficientes.</div>';
  const w = 620;
  const h = 120;
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const span = Math.max(max - min, 1);
  const step = vals.length === 1 ? 0 : w / (vals.length - 1);
  const points = vals.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / span) * (h - 16) - 8;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="insights-sparkline">
    <polyline fill="none" stroke="${corLine}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" points="${points}"></polyline>
    ${vals.map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / span) * (h - 16) - 8;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.3" fill="${corLine}"></circle>`;
    }).join('')}
  </svg>`;
}

function barra(itens, max = null) {
  if (!itens.length) return '<div class="vazio">Sem dados.</div>';
  const topo = max || Math.max(...itens.map(i => i.totalBRL || i.total || 0), 1);
  return itens.map(i => {
    const total = i.totalBRL ?? i.total ?? 0;
    const pct = topo ? (total / topo) * 100 : 0;
    return `<div class="barra insights-barra"><div class="lab" title="${esc(i.k || i.cat || i.lugar || '')}">
      <b>${esc(i.k || i.cat || i.lugar || '')}</b>${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</div>
      <div class="trilho"><div class="fill" style="width:${pct}% ;background:${i.cor || 'var(--cofre)'}"></div></div>
      <div class="v">${i.moeda ? VE(i.total || 0, i.moeda) : Mc(total)}</div></div>`;
  }).join('');
}

function badge(texto, classe = '') {
  return `<span class="pill ${classe}">${esc(texto)}</span>`;
}

function cardKpi(titulo, valor, detalhe, corTexto = '') {
  return `<div class="kpi"><span>${esc(titulo)}</span><b${corTexto ? ` style="color:${corTexto}"` : ''}>${valor}</b><small>${esc(detalhe)}</small></div>`;
}

function linha(texto, valor) {
  return `<div class="insights-line"><span>${esc(texto)}</span><b>${valor}</b></div>`;
}

function agruparTotais(lista, chave) {
  const mapa = new Map();
  for (const item of lista) {
    const k = item[chave] || 'Outros';
    const atual = mapa.get(k) || { k, totalBRL: 0, sub: '' };
    atual.totalBRL += item.totalBRL || 0;
    if (!atual.sub && item.sub) atual.sub = item.sub;
    mapa.set(k, atual);
  }
  return [...mapa.values()].sort((a, b) => b.totalBRL - a.totalBRL || a.k.localeCompare(b.k));
}

export function telaInsights() {
  const d = gerarDadosInsights();
  const moedaAtual = d.saldoPorMoeda[0]?.moeda || 'BRL';
  const resumoAtual = d.totalAtual || {};
  const mesLabel = `${MESES[(resumoAtual.mes || 1) - 1]} de ${resumoAtual.ano || ''}`;

  const moedas = d.saldoPorMoeda.slice(0, 4).map(x => ({
    moeda: x.moeda,
    totalBRL: x.totalBRL,
    total: x.total,
    qtd: x.qtd
  }));

  const alertas = [];
  if (d.maiorLancamento) alertas.push(`Principal gasto: ${d.maiorLancamento.titulo || 'lançamento'} com ${Mc(d.maiorLancamento.valorBRL)}.`);
  if (d.alertasCategorias[0]) alertas.push(`Categoria em alta: ${d.alertasCategorias[0].k} está ${d.alertasCategorias[0].dif == null ? 'sem base' : `${d.alertasCategorias[0].dif.toFixed(0)}%`} acima da média recente.`);
  if (d.proximas.length) alertas.push(`${d.proximas.length} conta(s) vencem nos próximos 7 dias.`);
  if (d.recordeDia) alertas.push(`Recorde diário: ${d.recordeDia.data.slice(8,10)}/${d.recordeDia.data.slice(5,7)} com ${Mc(d.recordeDia.totalBRL)}.`);
  if (d.economiaPct != null) alertas.push(d.economiaPct >= 0 ? `Economia de ${Mc(d.economias)} versus o mês anterior.` : `Alta de ${Mc(Math.abs(d.economias))} versus o mês anterior.`);

  const recomendações = d.insightsIA.length ? d.insightsIA : ['Sem dados suficientes para gerar recomendações.'];

  const viagensTop = d.rankingViagens.slice(0, 6);
  const budgetTop = d.orcamentoCategoria.slice(0, 8);
  const viagensCategorias = agruparTotais(d.viagens.flatMap(v => v.porCategoria.map(x => ({ k: x.k, totalBRL: x.totalBRL, sub: v.nome }))), 'k');
  const viagensCidades = agruparTotais(d.viagens.flatMap(v => v.porCidade.map(x => ({ k: x.k, totalBRL: x.totalBRL, sub: v.nome }))), 'k');
  const viagensPaises = agruparTotais(d.viagens.flatMap(v => v.porPais.map(x => ({ k: x.k, totalBRL: x.totalBRL, sub: v.nome }))), 'k');

  const comparativo3 = d.serie.slice(-3).map(x => ({ k: x.label, totalBRL: x.totalBRL, sub: `Gastos: ${Mc(x.totalDiarioBRL)} · Contas: ${Mc(x.totalContasBRL)}` }));
  const comparativo12 = d.serie.slice(-12).map(x => x.totalBRL);

  return `<section class="insights-dashboard">
    <div class="card insights-hero">
      <div class="card-hd">
        <h3>Dashboard Executivo</h3>
        <div class="dir">
          <span class="mono" style="font-size:12px;color:var(--ink-2)">${mesLabel || 'Período selecionado'}</span>
          <span class="pill pill-cat">Inteligência financeira</span>
        </div>
      </div>
      <div class="kpis insights-kpis">
        ${cardKpi('Patrimônio atual', Mc(d.totalAcumuladoBRL), 'Total acumulado no controle', 'var(--cofre)')}
        ${cardKpi('Saldo por moeda dominante', moedas[0] ? M(moedas[0].total, moedas[0].moeda) : '—', `${moedas[0] ? moedas[0].qtd : 0} itens dominantes`, 'var(--azul)')}
        ${cardKpi('Evolução do patrimônio', d.variacaoMes == null ? '—' : `${d.variacaoMes >= 0 ? '+' : ''}${d.variacaoMes.toFixed(0)}%`, `vs. ${d.totalAnterior ? d.totalAnterior.label : 'mês anterior'}`, d.variacaoMes > 0 ? 'var(--carimbo)' : 'var(--cofre)')}
        ${cardKpi('Evolução dos gastos', d.variacaoGastos == null ? '—' : `${d.variacaoGastos >= 0 ? '+' : ''}${d.variacaoGastos.toFixed(0)}%`, `média diária ${Mc(d.mediaDiaria)}`, d.variacaoGastos > 0 ? 'var(--carimbo)' : 'var(--cofre)')}
      </div>
      <div class="insights-moedas">
        ${moedas.map(m => `<div class="insight-moeda"><span>${esc(m.moeda)}</span><b>${M(m.total, m.moeda)}</b><small>${Mc(m.totalBRL)} em BRL · ${m.qtd} item(ns)</small></div>`).join('')}
      </div>
      <div class="insights-resumo">
        <div class="insights-resumo-texto">
          <p><b>Resumo financeiro:</b> ${d.totalAtual ? `${Mc(d.totalAtual.totalBRL)} no período selecionado, com ${Mc(d.totalAtual.totalDiarioBRL)} em gastos soltos e ${Mc(d.totalAtual.totalContasBRL)} em contas.` : 'Sem dados suficientes para resumir.'}</p>
          <p><b>Indicadores de crescimento:</b> ${d.economiaPct == null ? '—' : (d.economiaPct >= 0 ? `economia de ${d.economiaPct.toFixed(0)}% vs. mês anterior` : `crescimento de ${Math.abs(d.economiaPct).toFixed(0)}% vs. mês anterior`)}</p>
          <p><b>Média semanal:</b> ${Mc(d.mediaSemanal)} · <b>Projeção mensal:</b> ${Mc(d.projecaoMes)} · <b>Projeção anual:</b> ${Mc(d.projecaoAno)}</p>
        </div>
        <div class="insights-spark-card">
          <div class="insights-spark-title">Evolução do patrimônio</div>
          ${sparkline(d.evolucaoPatrimonio, '#0F6E5C')}
          <div class="insights-spark-legend">linha verde = soma mensal em BRL</div>
        </div>
      </div>
    </div>

    <div class="grid2 insights-grid">
      <div class="card">
        <div class="card-hd"><h3>Projeções</h3><div class="dir mono" style="font-size:12px;color:var(--ink-2)">baseadas na média do período</div></div>
        <div class="insights-blocos">
          ${linha('Média diária', Mc(d.mediaDiaria))}
          ${linha('Média semanal', Mc(d.mediaSemanal))}
          ${linha('Projeção até o fim do mês', Mc(d.projecaoMes))}
          ${linha('Projeção anual', Mc(d.projecaoAno))}
          ${linha('Previsão histórica', Mc(d.projecaoHist))}
        </div>
      </div>
      <div class="card">
        <div class="card-hd"><h3>Alertas inteligentes</h3><div class="dir mono" style="font-size:12px;color:var(--ink-2)">${d.proximas.length} proximidades</div></div>
        <div class="insights-lista">
          ${alertas.length ? alertas.map(a => `<div class="insight-alerta">${badge('Atenção','pill-cat')}<span>${esc(a)}</span></div>`).join('') : '<div class="vazio">Sem alertas críticos no recorte atual.</div>'}
        </div>
      </div>
    </div>

    <div class="grid2 insights-grid">
      <div class="card">
        <div class="card-hd"><h3>Centro Financeiro</h3><div class="dir mono" style="font-size:12px;color:var(--ink-2)">${d.metasMes.length} meta(s) mensal(is)</div></div>
        <div class="insights-blocos">
          ${linha('Metas mensais', d.metasMes.length || '—')}
          ${linha('Metas anuais', d.metasAno.length || '—')}
          ${linha('Saldo disponível', Mc(Math.max(0, d.projecaoMes - d.totalAtual.totalBRL)))}
          ${linha('Percentual utilizado', `${d.projecaoMes > 0 ? ((d.totalAtual.totalBRL / d.projecaoMes) * 100).toFixed(0) : 0}%`)}
        </div>
        <div class="insights-subtitle">Orçamento sugerido por categoria</div>
        <div class="insights-bar-list">${budgetTop.length ? barra(budgetTop.map(x => ({ k: x.cat, totalBRL: x.gasto, sub: `Orçamento ${Mc(x.orcamento)}`, cor: cor(x.cat) }))) : '<div class="vazio">Sem base para orçamento por categoria.</div>'}</div>
      </div>
      <div class="card">
        <div class="card-hd"><h3>Comparativos</h3><div class="dir mono" style="font-size:12px;color:var(--ink-2)">3 / 6 / 12 meses</div></div>
        <div class="insights-spark-card" style="margin:0 14px 10px">
          ${sparkline(comparativo12, '#2F4F9E')}
          <div class="insights-spark-legend">azul = evolução dos últimos 12 meses</div>
        </div>
        <div class="insights-blocos">
          ${linha('Últimos 3 meses', Mc(d.serie.slice(-3).reduce((a, b) => a + b.totalBRL, 0)))}
          ${linha('Últimos 6 meses', Mc(d.serie.slice(-6).reduce((a, b) => a + b.totalBRL, 0)))}
          ${linha('Últimos 12 meses', Mc(d.serie.slice(-12).reduce((a, b) => a + b.totalBRL, 0)))}
          ${linha('Ano anterior no mesmo recorte', Mc(d.acumuladoAnoAnterior))}
        </div>
        <div class="insights-subtitle">Top 3 meses do recorte</div>
        <div class="insights-lista">${comparativo3.map(x => `<div class="insight-alerta"><span class="pill pill-cat">${esc(x.k)}</span><b>${Mc(x.totalBRL)}</b><small>${esc(x.sub)}</small></div>`).join('')}</div>
      </div>
    </div>

    <div class="grid2 insights-grid">
      <div class="card">
        <div class="card-hd"><h3>Gastos por categoria</h3><div class="dir mono" style="font-size:12px;color:var(--ink-2)">mês selecionado</div></div>
        <div class="insights-subtitle">Categorias com maior peso no período</div>
        <div class="insights-bar-list">${barra(d.categorias.slice(0, 8).map(x => ({ k: x.k, totalBRL: x.totalBRL, sub: x.avg ? `Média anterior ${Mc(x.avg)}` : 'sem histórico', cor: cor(x.k) })))}</div>
      </div>
      <div class="card">
        <div class="card-hd"><h3>Viagens</h3><div class="dir mono" style="font-size:12px;color:var(--ink-2)">${viagensTop.length} viagem(ns) analisadas</div></div>
        <div class="insights-lista">
          ${viagensTop.length ? viagensTop.map(v => `<div class="insight-alerta"><span class="pill pill-cat">${esc(v.nome)}</span><b>${Mc(v.totalBRL)}</b><small>${esc(v.destino)} · ${v.dias} dia(s) · ${Mc(v.custoDiaBRL)}/dia${v.custoPessoaBRL == null ? '' : ` · ${Mc(v.custoPessoaBRL)}/pessoa`}</small></div>`).join('') : '<div class="vazio">Sem viagens cadastradas.</div>'}
        </div>
        <div class="insights-subtitle">Custo por categoria</div>
        <div class="insights-bar-list">${barra(viagensCategorias.slice(0, 5).map(x => ({ k: x.k, totalBRL: x.totalBRL, sub: x.sub, cor: '#0F6E5C' })))}</div>
        <div class="insights-subtitle">Custo por cidade</div>
        <div class="insights-bar-list">${barra(viagensCidades.slice(0, 5).map(x => ({ k: x.k, totalBRL: x.totalBRL, sub: x.sub, cor: '#00838F' })))}</div>
        <div class="insights-subtitle">Custo por país</div>
        <div class="insights-bar-list">${barra(viagensPaises.slice(0, 5).map(x => ({ k: x.k, totalBRL: x.totalBRL, sub: x.sub, cor: '#2F4F9E' })))}</div>
      </div>
    </div>

    <div class="grid2 insights-grid">
      <div class="card">
        <div class="card-hd"><h3>IA Financeira</h3><div class="dir mono" style="font-size:12px;color:var(--ink-2)">insights automáticos</div></div>
        <div class="insights-lista">
          ${recomendações.map(item => `<div class="insight-alerta"><span class="pill pill-cat">Insight</span><span>${esc(item)}</span></div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-hd"><h3>Exportações</h3><div class="dir mono" style="font-size:12px;color:var(--ink-2)">profissional</div></div>
        <div class="insights-exportacoes">
          <button class="btn btn-cofre" id="expInsightsXls">Excel</button>
          <button class="btn-2" id="expInsightsPdf">PDF</button>
          <button class="btn-2" id="expInsightsCsv">CSV</button>
          <button class="btn-2" id="expInsightsPrint">Impressão profissional</button>
        </div>
        <div class="insights-subtitle">Resumo rápido</div>
        <div class="insights-blocos">
          ${linha('Saldo por moeda dominante', moedaAtual)}
          ${linha('Maior gasto do mês', d.maiorLancamento ? `${esc(d.maiorLancamento.titulo || '')} · ${Mc(d.maiorLancamento.valorBRL)}` : 'Sem dados')}
          ${linha('Recorde diário', d.recordeDia ? `${d.recordeDia.data.slice(8,10)}/${d.recordeDia.data.slice(5,7)} · ${Mc(d.recordeDia.totalBRL)}` : 'Sem dados')}
          ${linha('Economia versus mês anterior', d.economiaPct == null ? '—' : `${Mc(d.economias)} (${d.economiaPct.toFixed(0)}%)`)}
        </div>
      </div>
    </div>
  </section>`;
}

export { exportarInsightsCsv, exportarInsightsXls, imprimirInsights };
