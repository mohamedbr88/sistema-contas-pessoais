// ============================================================================
//  Tela "Viagem": calendário diário, resumo lateral e conversão única.
// ============================================================================

import { CATD, PAGD, S, V, STATUS, MESES, cor, esc, hojeISO, viagemAtual } from '../estado.js?v=20260720-4';
import { M, MOEDAS, conv } from '../moeda.js?v=20260720-4';
import { viagemApi } from '../api.js?v=20260720-4';
import { formGen } from '../ui.js?v=20260720-4';

const MOEDAS_ORDEM = ['BRL', 'USD', 'EUR', 'PYG'];
const MOEDA_ICONE = { BRL: 'R$', USD: 'US$', EUR: '€', PYG: '₲' };
const MOEDA_COR = { BRL: 'var(--cofre)', USD: 'var(--azul)', EUR: '#7A3E9D', PYG: '#D97706' };
const moedaSelecionada = () => S.moeda || 'BRL';
const mostrarTodas = () => false;

function horaNormalizada(hora) {
  if (!hora) return '';
  const [h = '0', m = '0'] = String(hora).split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

function horaExibicao(item) {
  const hora = horaNormalizada(item.hora);
  if (hora) return hora;
  const origem = item.createdAt || item.created_at || '';
  return origem ? String(origem).slice(11, 16) : '—';
}

function horaOrdenacao(item) {
  return horaExibicao(item) === '—' ? '99:99' : horaExibicao(item);
}

function valorExibido(valor, origem, destino = moedaSelecionada()) {
  return M(valor, origem || 'BRL', { moeda: destino });
}

function valorAtual(valor, origem) {
  return valorExibido(valor, origem, moedaSelecionada());
}

function valorMoedaLocal(valor, moeda) {
  return M(valor, moeda, { moeda, converter: false });
}

function diaISO(base, deslocamento) {
  const data = new Date(`${base}T00:00:00`);
  data.setDate(data.getDate() + deslocamento);
  return data.toISOString().slice(0, 10);
}

function formatoCurto(iso) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function fimHospedagem(hosp) {
  return diaISO(hosp.data, Math.max(0, (hosp.noites || 1) - 1));
}

function intervaloDias(viagem) {
  const total = Math.round((new Date(viagem.fim) - new Date(viagem.inicio)) / 864e5) + 1;
  return Array.from({ length: total }, (_, i) => diaISO(viagem.inicio, i));
}

function hospedagemAtiva(viagem, iso) {
  return viagem.hosp.find(h => iso >= h.data && iso <= fimHospedagem(h)) || null;
}

function hospedagemInicio(viagem, iso) {
  return viagem.hosp.find(h => h.data === iso) || null;
}

function gastosDoDia(viagem, iso) {
  return viagem.gastos.filter(g => g.data === iso);
}

function categoriaFatura(cat) {
  if (cat === 'Restaurante' || cat === 'Mercado') return 'Alimentação';
  if (cat === 'Hospedagem' || cat === 'Transporte' || cat === 'Compras' || cat === 'Bar' || cat === 'Entretenimento') return cat;
  return 'Outros';
}

function indicacaoCategoria(dia) {
  const set = new Set(dia.categorias);
  return [
    ['Hospedagem', '🛏', 'var(--cofre)'],
    ['Transporte', '🚌', 'var(--azul)'],
    ['Alimentação', '🍽', '#7A3E9D'],
    ['Compras', '🛍', '#D97706']
  ].map(([cat, icone, corIcone]) => `<span class="viagem-indicador ${set.has(cat) ? 'is-on' : ''}" style="--c:${corIcone}" title="${cat}" aria-label="${cat}">${icone}</span>`).join('');
}

function compararMoedas(valor, origem) {
  const atual = moedaSelecionada();
  return MOEDAS_ORDEM.map(m => `<span class="viagem-moeda-linha moeda-${m.toLowerCase()}${m === atual ? ' is-selected' : ''}"><i>${MOEDA_ICONE[m]}</i><b>${valorExibido(valor, origem, m)}</b></span>`).join('');
}

function blocoValor(valor, origem, detalhe = '', comparar = false) {
  const principal = valorAtual(valor, origem);
  return `<div class="viagem-valor">
    <b>${principal}</b>
    ${detalhe ? `<small>${detalhe}</small>` : ''}
    ${comparar && mostrarTodas() ? `<div class="viagem-comparacao">${compararMoedas(valor, origem)}</div>` : ''}
  </div>`;
}

function resumoDia(viagem, iso) {
  const inicioHosp = hospedagemInicio(viagem, iso);
  const ativa = hospedagemAtiva(viagem, iso);
  const gastos = gastosDoDia(viagem, iso);
  const cidade = ativa?.cidade || inicioHosp?.cidade || 'Sem cidade';
  const hotel = ativa?.nome || inicioHosp?.nome || '';
  const lancamentos = [];
  const categorias = new Set();
  const pagamentos = new Map();

  if (inicioHosp) {
    categorias.add('Hospedagem');
    lancamentos.push({
      tipo: 'Hospedagem',
      cat: 'Hospedagem',
      desc: inicioHosp.nome || 'Hospedagem',
      pg: inicioHosp.pg || '—',
      valor: inicioHosp.valor || 0,
      moeda: inicioHosp.moeda || viagem.moeda || 'EUR',
      obs: inicioHosp.obs || '',
      hora: inicioHosp.hora || '00:00',
      ordem: '00:00'
    });
  }

  gastos.forEach(g => {
    categorias.add(categoriaFatura(g.cat));
    lancamentos.push({
      tipo: 'Gasto',
      cat: g.cat,
      desc: g.desc,
      pg: g.pg || '—',
      valor: g.valor || 0,
      moeda: g.moeda || viagem.moeda || 'EUR',
      obs: g.obs || '',
      hora: horaExibicao(g),
      ordem: horaOrdenacao(g)
    });
  });

  lancamentos.sort((a, b) => a.ordem.localeCompare(b.ordem) || a.desc.localeCompare(b.desc));
  lancamentos.forEach(item => {
    if (item.pg && item.pg !== '—') pagamentos.set(item.pg, (pagamentos.get(item.pg) || 0) + 1);
  });

  const emBRL = item => conv(item.valor || 0, item.moeda || viagem.moeda || 'EUR', 'BRL');
  const totalBRL = lancamentos.reduce((s, item) => s + emBRL(item), 0);
  const maior = lancamentos.reduce((maximo, item) => (emBRL(item) > emBRL(maximo) ? item : maximo), { valor: 0, moeda: viagem.moeda || 'EUR' });
  const menor = lancamentos.length ? lancamentos.reduce((minimo, item) => (emBRL(item) < emBRL(minimo) ? item : minimo), lancamentos[0]) : { valor: 0, moeda: viagem.moeda || 'EUR' };
  const observacoes = lancamentos.map(item => item.obs).filter(Boolean);

  return {
    iso,
    dataCurta: formatoCurto(iso),
    cidade,
    hotel,
    lancamentos,
    categorias: Array.from(categorias),
    totalBRL,
    mediaBRL: lancamentos.length ? totalBRL / lancamentos.length : 0,
    maior,
    menor,
    pagamentos: [...pagamentos.entries()].sort((a, b) => b[1] - a[1]),
    observacoes
  };
}

function formatoCompleto(iso) {
  const dia = Number(iso.slice(8, 10));
  const mes = Number(iso.slice(5, 7));
  const ano = iso.slice(0, 4);
  return `${dia} de ${MESES[mes - 1].toLowerCase()} de ${ano}`;
}

function resumoGrafico(viagem, exibir) {
  const dias = intervaloDias(viagem).map(iso => {
    const dia = resumoDia(viagem, iso);
    const lancamentos = dia.lancamentos.map(item => ({
      ...item,
      valorLocal: conv(item.valor || 0, item.moeda || viagem.moeda || 'EUR', exibir)
    }));
    const total = lancamentos.reduce((s, item) => s + item.valorLocal, 0);
    const maior = lancamentos.reduce((maximo, item) => (item.valorLocal > maximo.valorLocal ? item : maximo), { valorLocal: 0 });
    return { ...dia, lancamentos, totalLocal: total, maiorLocal: maior };
  });
  const max = Math.max(...dias.map(item => item.totalLocal), 1);
  const totalViagem = dias.reduce((s, item) => s + item.totalLocal, 0);
  const mediaDiaria = dias.length ? totalViagem / dias.length : 0;
  const diaMaior = dias.filter(item => item.totalLocal > 0).sort((a, b) => b.totalLocal - a.totalLocal || a.iso.localeCompare(b.iso))[0] || null;
  const diaMenor = dias.filter(item => item.totalLocal > 0).sort((a, b) => a.totalLocal - b.totalLocal || a.iso.localeCompare(b.iso))[0] || null;
  const diasComGastos = dias.filter(item => item.totalLocal > 0).length;
  const diasSemGastos = dias.filter(item => item.totalLocal === 0).length;
  return { dias, max, totalViagem, mediaDiaria, diaMaior, diaMenor, diasComGastos, diasSemGastos };
}

function estruturaFluxoViagem(itensDia, mediaDiaria) {
  const mobile = typeof window !== 'undefined' && window.innerWidth <= 720;
  const tablet = typeof window !== 'undefined' && window.innerWidth <= 1040;
  const w = mobile ? 760 : tablet ? 940 : 1080;
  const h = mobile ? 268 : 300;
  const padL = mobile ? 92 : 110;
  const padR = mobile ? 22 : 30;
  const padT = 28;
  const padB = mobile ? 58 : 50;
  const usableW = w - padL - padR;
  const usableH = h - padT - padB;
  const n = Math.max(1, itensDia.length);
  const step = usableW / n;
  const barW = Math.max(6, step * (mobile ? 0.5 : 0.56));
  const maxValor = Math.max(...itensDia.map(item => item.totalLocal), mediaDiaria || 0, 0);
  const maxEscala = maxValor || 1;
  const yPorValor = valor => padT + usableH - ((valor / maxEscala) * usableH);
  const ticksY = Array.from({ length: 5 }, (_, i) => {
    const ratio = i / 4;
    const valor = maxEscala * (1 - ratio);
    const y = padT + usableH * ratio;
    return { valor, y };
  });
  const passoTick = Math.max(1, Math.ceil(itensDia.length / (mobile ? 8 : 14)));
  const ticksX = itensDia.map((item, idx) => {
    const dia = Number(item.iso.slice(8, 10));
    const mostrar = idx === 0 || idx === itensDia.length - 1 || idx % passoTick === 0;
    return {
      dia: String(dia),
      completo: formatoCompleto(item.iso),
      x: padL + (idx * step) + (step / 2),
      mostrar
    };
  });
  const bars = itensDia.map((item, idx) => {
    const x = padL + (idx * step) + ((step - barW) / 2);
    const hBar = item.totalLocal ? Math.max((item.totalLocal / maxEscala) * usableH, 2.5) : 0;
    const y = padT + usableH - hBar;
    return { ...item, x, y, w: barW, h: hBar };
  });
  return {
    w, h, padL, padR, padT, padB, usableH, ticksY, ticksX,
    yMedia: yPorValor(mediaDiaria || 0),
    bars
  };
}

function tooltipGastoDiaViagem(item) {
  const linhas = [
    formatoCompleto(item.iso),
    item.cidade || 'Sem cidade',
    valorMoedaLocal(item.totalLocal, moedaSelecionada()),
    `${item.lancamentos.length} lançamento(s)`,
    `Maior gasto: ${item.maiorLocal?.valorLocal ? valorMoedaLocal(item.maiorLocal.valorLocal, moedaSelecionada()) : '—'}`,
    item.categorias.length ? `Categorias: ${item.categorias.join(', ')}` : 'Categorias: —'
  ];
  return linhas.join('\n');
}

function tooltipDia(dia, viagem) {
  const linhas = [
    `${dia.dataCurta} · ${dia.cidade}`,
    dia.hotel ? `Hotel: ${dia.hotel}` : 'Sem hospedagem',
    `Total: ${M(dia.totalBRL, 'BRL')}`,
    `Lançamentos: ${dia.lancamentos.length}`,
    dia.categorias.length ? `Categorias: ${dia.categorias.join(', ')}` : 'Categorias: —'
  ];
  dia.lancamentos.forEach(l => linhas.push(`${l.desc} · ${l.pg} · ${valorAtual(l.valor, l.moeda)}`));
  return linhas.join('\n');
}

function calendarioHtml(viagem, dias, selecionado) {
  return dias.map(iso => {
    const dia = resumoDia(viagem, iso);
    const ativo = iso === selecionado.iso;
    const hoje = iso === hojeISO;
    return `<button class="viagem-dia${ativo ? ' is-active' : ''}${hoje ? ' is-hoje' : ''}" data-vdia="${iso}" title="${esc(tooltipDia(dia, viagem))}">
      <div class="viagem-dia-data"><strong>${dia.dataCurta}</strong><span>${iso === viagem.inicio ? 'Início' : iso === viagem.fim ? 'Fim' : ''}</span></div>
      <div class="viagem-dia-lugar"><b>${esc(dia.cidade)}</b><small>${dia.hotel ? esc(dia.hotel) : 'Sem hospedagem'}</small></div>
      <div class="viagem-dia-total"><b>${M(dia.totalBRL, 'BRL')}</b><small>${dia.lancamentos.length} lançamentos</small></div>
      <div class="viagem-dia-indicadores">${indicacaoCategoria(dia)}</div>
    </button>`;
  }).join('');
}

function resumoLateral(dia, viagem, exibir) {
  const maiorValor = dia.maior?.valor || 0;
  const maiorMoeda = dia.maior?.moeda || viagem.moeda || 'EUR';
  const menorValor = dia.menor?.valor || 0;
  const menorMoeda = dia.menor?.moeda || viagem.moeda || 'EUR';
  const totalDiaLocal = conv(dia.totalBRL || 0, 'BRL', exibir);
  const mediaDiaLocal = conv(dia.mediaBRL || 0, 'BRL', exibir);
  const valorViagem = viagem.moeda || 'EUR';
  const pagamentos = dia.pagamentos.length ? dia.pagamentos.map(([pg, qtd]) => `${esc(pg)} · ${qtd}`).join(' · ') : '—';
  return `<div class="viagem-resumo-dia">
    <div class="viagem-resumo-top">
      <div>
        <h3>${dia.dataCurta}</h3>
        <p>${esc(dia.cidade)}${dia.hotel ? ` · ${esc(dia.hotel)}` : ''}</p>
      </div>
      <span class="pastilha" style="--c:var(--cofre)">${dia.lancamentos.length} lançamentos</span>
    </div>
    <div class="viagem-resumo-numeros">
      <div><span>Total gasto</span><b>${valorMoedaLocal(totalDiaLocal, exibir)}</b></div>
      <div><span>Média do dia</span><b>${valorMoedaLocal(mediaDiaLocal, exibir)}</b></div>
      <div><span>Maior gasto</span><b>${valorExibido(maiorValor, maiorMoeda, exibir)}</b></div>
      <div><span>Menor gasto</span><b>${valorExibido(menorValor, menorMoeda, exibir)}</b></div>
    </div>
    <div class="viagem-resumo-blocos">
      <div><span>Cidade</span><b>${esc(dia.cidade)}</b></div>
      <div><span>Hotel</span><b>${dia.hotel ? esc(dia.hotel) : '—'}</b></div>
      <div><span>Categorias</span><b>${dia.categorias.length ? dia.categorias.join(', ') : '—'}</b></div>
      <div><span>Pagamentos</span><b>${pagamentos}</b></div>
      <div class="viagem-bloco-observacoes"><span>Observações</span><b>${dia.observacoes.length ? esc(dia.observacoes.join(' · ')) : '—'}</b></div>
    </div>
    <div class="viagem-resumo-indicadores">${indicacaoCategoria(dia)}</div>
    <div class="viagem-resumo-lista">
      ${dia.lancamentos.length ? dia.lancamentos.map(item => `<div class="viagem-lancamento">
        <div>
          <b>${esc(item.desc)}</b>
          <small>${item.hora || '—'} · ${esc(item.cat)} · ${esc(item.pg)}</small>
          ${item.obs ? `<small class="viagem-lancamento-obs">${esc(item.obs)}</small>` : ''}
        </div>
        <span class="mono">${valorExibido(item.valor, item.moeda, exibir)}</span>
      </div>`).join('') : '<div class="vazio viagem-vazio-dia">Nenhum lançamento neste dia.</div>'}
    </div>
    ${mostrarTodas() ? `<div class="viagem-comparacao">${compararMoedas(totalDiaLocal, exibir)}</div>` : ''}
  </div>`;
}

function railMoedas() {
  return `<div class="viagem-grafico-moedas" aria-label="Escolha da moeda">
    <div class="viagem-grafico-moedas-botoes">
      ${Object.keys(MOEDAS).map(m => `<button class="${moedaSelecionada() === m ? 'on' : ''}" data-m="${m}" title="${MOEDAS[m].n}">${MOEDA_ICONE[m]}</button>`).join('')}
    </div>
  </div>`;
}

function resumoMini(viagem, titulo, valor, origem, detalhe = '') {
  return `<div class="kpi viagem-kpi"><span>${titulo}</span>${blocoValor(valor, origem, detalhe, true)}</div>`;
}

export function telaViagem(){
  const viagem = viagemAtual();
  if(!viagem) return `<div class="card"><div class="vazio">
      <b style="color:var(--ink);font-size:15px">Nenhuma viagem ainda</b>
      <p style="margin:6px 0 14px">Crie uma viagem para lançar hospedagem e gastos do dia.</p>
      <button class="btn btn-cofre" id="novaViagem">+ Nova viagem</button></div></div>`;

  const exibir = moedaSelecionada();
  const totalHospedagemLocal = viagem.hosp.reduce((s, h) => s + conv(h.valor || 0, h.moeda || viagem.moeda || 'EUR', exibir), 0);
  const totalGastosLocal = viagem.gastos.reduce((s, g) => s + conv(g.valor || 0, g.moeda || viagem.moeda || 'EUR', exibir), 0);
  const totalViagemLocal = totalHospedagemLocal + totalGastosLocal;
  const noites = viagem.hosp.reduce((s, h) => s + (h.noites || 1), 0);
  const totalDias = Math.round((new Date(viagem.fim) - new Date(viagem.inicio)) / 864e5) + 1;
  const moedaBase = viagem.moeda || 'EUR';
  const cambio = viagem.cambio || S.cambio || 1;
  const diasIntervalo = intervaloDias(viagem);
  const dias = diasIntervalo.map(iso => resumoDia(viagem, iso));
  const diaSelecionado = dias.find(d => d.iso === V.viagemDiaSel) || dias[0] || null;
  if (diaSelecionado && V.viagemDiaSel !== diaSelecionado.iso) V.viagemDiaSel = diaSelecionado.iso;
  const grafico = resumoGrafico(viagem, exibir);
  const fluxo = estruturaFluxoViagem(grafico.dias, grafico.mediaDiaria);
  const categorias = CATD.map(cat => ({
    cat,
    valor: viagem.gastos.filter(g => g.cat === cat).reduce((s, g) => s + conv(g.valor || 0, g.moeda || moedaBase, exibir), 0)
  })).filter(x => x.valor).sort((a, b) => b.valor - a.valor);
  const maxCategoria = Math.max(...categorias.map(x => x.valor), 1);
  const gastosPorDia = viagem.gastos.reduce((acc, g) => {
    acc[g.data] = (acc[g.data] || 0) + conv(g.valor || 0, g.moeda || moedaBase, exibir);
    return acc;
  }, {});
  const maxDia = Math.max(...Object.values(gastosPorDia), 1);
  const viagens = [...S.viagens].sort((a, b) => b.inicio.localeCompare(a.inicio));

  return `<div class="card">
    <div class="card-hd">
      <h3>${esc(viagem.destino || viagem.nome)} · ${formatoCurto(viagem.inicio)} a ${formatoCurto(viagem.fim)} · ${totalDias} dias</h3>
      <div class="dir">
        ${viagens.length > 1 ? `<select id="selViagem" title="Trocar de viagem">${viagens.map(x => `<option value="${x.id}" ${x.id === viagem.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select>` : ''}
        <button class="btn-2" id="novaViagem">+ Nova viagem</button>
      </div>
    </div>
    <div class="viagem-sub">
      <span class="pastilha" style="--c:${viagem.status === 'em_viagem' ? 'var(--cofre)' : viagem.status === 'planejamento' ? 'var(--azul)' : 'var(--ink-2)'}">${STATUS[viagem.status] || viagem.status}</span>
      <span class="mono">exibindo em ${MOEDAS[exibir].n} · base da viagem ${MOEDAS[moedaBase].n} · câmbio ${M(cambio, 'BRL', { moeda:'BRL', converter:false })} / ${MOEDAS[moedaBase].n}</span>
      ${viagem.orcamento ? `<span class="mono">orçamento ${valorExibido(viagem.orcamento, moedaBase, exibir)}</span>` : ''}
      <button class="lnk" id="editarViagem">editar viagem</button>
    </div>
    <div class="viagem-topo-grid">
      <div class="card viagem-calendario-card">
        <div class="card-hd"><h3>Calendário da viagem</h3></div>
        <div class="viagem-calendar-lista">${calendarioHtml(viagem, diasIntervalo, diaSelecionado || dias[0])}</div>
      </div>
      <div class="card viagem-resumo-card">
        <div class="card-hd"><h3>Resumo do dia</h3></div>
        ${diaSelecionado ? resumoLateral(diaSelecionado, viagem, exibir) : '<div class="vazio viagem-vazio-dia">Selecione um dia no calendário.</div>'}
      </div>
    </div>
    <div class="card viagem-grafico-card">
      <div class="card-hd viagem-grafico-hd">
        <div>
          <h3>GASTO POR DIA — ${esc(viagem.destino || viagem.nome)}</h3>
          <p>Veja quanto foi gasto em cada dia da viagem.</p>
        </div>
        <div class="dir">${railMoedas()}</div>
      </div>
      <div class="grafico-diario">
        <svg class="diario-evolucao" viewBox="0 0 ${fluxo.w} ${fluxo.h}" role="img" aria-label="Gasto por dia da viagem">
          <rect x="0" y="0" width="${fluxo.w}" height="${fluxo.h}" rx="10" fill="#F7FAF9"></rect>
          ${fluxo.ticksY.map(t => `<g><line x1="${fluxo.padL}" y1="${t.y.toFixed(1)}" x2="${fluxo.w - fluxo.padR}" y2="${t.y.toFixed(1)}" stroke="#D7E2E0" stroke-dasharray="3 5"></line><text x="${(fluxo.padL - 12).toFixed(1)}" y="${(t.y + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#5C7079">${esc(valorMoedaLocal(t.valor, exibir))}</text></g>`).join('')}
          ${fluxo.bars.map(item => {
            const destaque = grafico.diaMaior && grafico.diaMaior.iso === item.iso;
            const xCentro = item.x + (item.w / 2);
            const tip = tooltipGastoDiaViagem(item);
            return `<g class="fluxo-bar-group${destaque ? ' is-peak' : ''}" data-fluxo-tip="${esc(tip)}" style="cursor:pointer">
              <line class="fluxo-guide" x1="${xCentro.toFixed(1)}" y1="${fluxo.padT.toFixed(1)}" x2="${xCentro.toFixed(1)}" y2="${(fluxo.padT + fluxo.usableH).toFixed(1)}"></line>
              <rect class="fluxo-bar" x="${item.x.toFixed(1)}" y="${item.y.toFixed(1)}" width="${item.w.toFixed(1)}" height="${item.h.toFixed(1)}" rx="4" fill="${destaque ? '#0E6B5A' : '#D55D3A'}" opacity="${item.totalLocal ? (destaque ? '0.96' : '0.82') : '0.22'}"></rect>
              <title>${tip}</title>
            </g>`;
          }).join('')}
          <line x1="${fluxo.padL}" y1="${fluxo.yMedia.toFixed(1)}" x2="${fluxo.w - fluxo.padR}" y2="${fluxo.yMedia.toFixed(1)}" stroke="#4C6F67" stroke-width="1.4" stroke-dasharray="4 6" opacity=".85"></line>
          ${fluxo.ticksX.map(t => {
            if (!t.mostrar) return '';
            return `<text x="${t.x.toFixed(1)}" y="${(fluxo.h - 16).toFixed(1)}" text-anchor="middle" font-size="10.6" fill="#5C7079">${esc(t.dia)}<title>${esc(t.completo)}</title></text>`;
          }).join('')}
          <text x="${(fluxo.padL + 4).toFixed(1)}" y="16" font-size="11" font-weight="600" fill="#4B5E66">Valor por dia</text>
        </svg>
      </div>
      <div class="viagem-grafico-legenda">
        <span><i class="avg"></i>Média diária</span>
      </div>
      <div class="viagem-grafico-resumo">
        <div class="viagem-grafico-kpi"><span>Total da viagem</span><b>${valorMoedaLocal(totalViagemLocal, exibir)}</b></div>
        <div class="viagem-grafico-kpi"><span>Gastos da viagem</span><b>${valorMoedaLocal(totalGastosLocal, exibir)}</b></div>
        <div class="viagem-grafico-kpi"><span>Média diária</span><b>${valorMoedaLocal(grafico.mediaDiaria, exibir)}</b></div>
        <div class="viagem-grafico-kpi"><span>Maior dia</span><b>${grafico.diaMaior ? `${grafico.diaMaior.dataCurta} · ${valorMoedaLocal(grafico.diaMaior.totalLocal, exibir)}` : 'Sem dados'}</b></div>
      </div>
    </div>
    <div class="viagem-kpi-faixa">
      <div class="kpis viagem-kpis">
        ${resumoMini(viagem, 'Hospedagem', totalHospedagemLocal, exibir, `${noites} noites · ${valorMoedaLocal(totalHospedagemLocal / (noites || 1), exibir)}/noite`)}
        ${resumoMini(viagem, 'Gastos do dia', totalGastosLocal, exibir, `${viagem.gastos.length} lançamentos`)}
        ${resumoMini(viagem, 'Total da viagem', totalViagemLocal, exibir, `${totalDias} dias`)}
        ${resumoMini(viagem, 'Média diária', totalViagemLocal / totalDias, exibir, `hosp ${valorMoedaLocal(totalHospedagemLocal / (noites || 1), exibir)} + dia ${valorMoedaLocal(totalGastosLocal / totalDias, exibir)}`)}
      </div>
    </div>
    <div class="grid2 viagem-secundaria">
      <div class="card">
        <div class="card-hd"><h3>Onde foi o dinheiro</h3></div>
        <div style="padding:8px 0 12px">
          ${!categorias.length ? '<div class="vazio" style="padding:26px 16px">Nada gasto ainda.<br>As barras aparecem no primeiro lançamento.</div>' : ''}
          ${categorias.map(item => `<div class="barra viagem-barra-cat"><div class="lab"><b>${esc(item.cat)}</b><small>${valorAtual(item.valor, moedaBase)}</small></div><div class="trilho"><div class="fill" style="width:${item.valor / maxCategoria * 100}%;background:${cor(item.cat)}"></div></div><div class="v">${valorAtual(item.valor, moedaBase)}</div></div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-hd"><h3>Gasto por dia</h3><div class="dir" style="font-size:11px;color:var(--ink-2)">somente os lançamentos do dia</div></div>
        <div style="padding:12px 14px 8px;display:flex;gap:4px;align-items:flex-end;height:144px">
          ${!Object.keys(gastosPorDia).length ? '<div class="vazio" style="width:100%;padding:26px 16px">Sem gasto lançado.</div>' : ''}
          ${Object.keys(gastosPorDia).sort().map(iso => `<div class="viagem-dia-bar${gastosPorDia[iso] === maxDia ? ' is-max' : ''}" title="${tooltipDia(resumoDia(viagem, iso), viagem)}" style="flex:1;height:${gastosPorDia[iso] / maxDia * 100}%"></div>`).join('')}
        </div>
        <div style="padding:0 14px 10px;font-size:10px;color:var(--ink-2);display:flex;justify-content:space-between">
          <span class="mono">${formatoCurto(viagem.inicio)}</span><span class="mono">maior dia: ${valorMoedaLocal(maxDia, exibir)}</span><span class="mono">${formatoCurto(viagem.fim)}</span>
        </div>
      </div>
    </div>
    <div class="card viagem-tabela-card">
      <div class="card-hd"><h3>Hospedagem</h3><div class="dir"><span class="mono" style="font-size:12px;color:var(--ink-2)">${valorMoedaLocal(totalHospedagemLocal, exibir)}</span><button class="btn-2" id="addH">+ Estadia</button></div></div>
      <table class="tmes">
        <thead><tr><th>Entrada</th><th>Hotel</th><th>Cidade</th><th class="num">Noites</th><th class="num">Valor (${MOEDAS[exibir].n})</th><th class="num">Por noite</th><th></th><th></th></tr></thead>
        <tbody>${!viagem.hosp.length ? '<tr><td colspan="8" class="vazio" style="padding:22px">Nenhuma hospedagem ainda. Use <b style="color:var(--ink)">+ Estadia</b>.</td></tr>' : viagem.hosp.slice().sort((a, b) => a.data.localeCompare(b.data)).map(h => `<tr class="lin" style="--c:${cor('Hospedagem')}"><td class="mono" style="font-size:12px;color:var(--ink-2)">${formatoCurto(h.data)}</td><td>${esc(h.nome)}</td><td style="font-size:12px;color:var(--ink-2)">${esc(h.cidade)}</td><td class="num">${h.noites}</td><td class="num" style="font-weight:600">${valorAtual(h.valor, h.moeda || moedaBase)}</td><td class="num" style="font-size:12px;color:var(--ink-2)">${valorExibido(h.valor / (h.noites || 1), h.moeda || moedaBase, exibir)}</td><td></td><td style="text-align:right"><button class="acao" data-eh="${h.data}">editar</button></td></tr>`).join('')}</tbody>
        <tfoot><tr class="tot"><td colspan="3">${viagem.hosp.length} estadias</td><td class="num">${noites}</td><td class="num">${valorMoedaLocal(totalHospedagemLocal, exibir)}</td><td class="num">${valorMoedaLocal(totalHospedagemLocal / (noites || 1), exibir)}</td><td colspan="2"></td></tr></tfoot>
      </table>
    </div>
    <div class="card viagem-tabela-card">
      <div class="card-hd"><h3>Gastos do dia</h3><div class="dir"><span class="mono" style="font-size:12px;color:var(--ink-2)">${valorMoedaLocal(totalGastosLocal, exibir)}</span><button class="btn" id="addG">+ Gasto</button></div></div>
      <div style="max-height:520px;overflow:auto">
        <table class="tmes">
          <thead><tr><th>Dia</th><th>O quê</th><th>Categoria</th><th>Pgto</th><th class="num">Valor (${MOEDAS[exibir].n})</th><th class="num">Detalhe</th><th></th><th></th></tr></thead>
          <tbody>${!viagem.gastos.length ? '<tr><td colspan="8" class="vazio" style="padding:22px">Nenhum gasto ainda. Use <b style="color:var(--ink)">+ Gasto</b>.</td></tr>' : viagem.gastos.slice().sort((a, b) => a.data.localeCompare(b.data) || horaOrdenacao(a).localeCompare(horaOrdenacao(b))).map(g => `<tr class="lin" style="--c:${cor(g.cat)}"><td class="mono" style="font-size:12px;color:var(--ink-2)">${formatoCurto(g.data)}<div style="font-size:10px;opacity:.85;margin-top:2px">${horaExibicao(g)}</div></td><td>${esc(g.desc)}${g.obs ? `<div style="font-size:11px;color:var(--ink-2);margin-top:2px">${esc(g.obs)}</div>` : ''}</td><td><span class="pill" style="background:${cor(g.cat)}1A;color:${cor(g.cat)}">${esc(g.cat)}</span></td><td style="font-size:12px;color:var(--ink-2)">${esc(g.pg)}</td><td class="num" style="font-weight:600">${valorAtual(g.valor, g.moeda || moedaBase)}</td><td class="num" style="font-size:12px;color:var(--ink-2)">${valorMoedaLocal(g.valor, g.moeda || moedaBase)}</td><td></td><td style="text-align:right"><button class="acao" data-eg="${g.id}">editar</button></td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

export function formHosp(h){
  const viagem = viagemAtual();
  const novo = !h;
  if(!viagem) return;
  h = h || { data: viagem.inicio, nome:'', cidade:'', noites:1, valor:0 };
  formGen(novo ? 'Nova estadia' : 'Editar estadia', [
    {k:'nome',l:'Hotel / apartamento'}, {k:'cidade',l:'Cidade'}, {k:'data',l:'Entrada',tipo:'date'},
    {k:'noites',l:'Noites',tipo:'number'}, {k:'valor',l:`Valor em ${MOEDAS[viagem.moeda || 'EUR'].n} — a moeda desta viagem`,tipo:'number'},
  ], h, async o => {
    o.noites = Math.max(1, Math.round(o.noites));
    if (novo) await viagemApi.addHosp(viagem.id, o);
    else await viagemApi.editHosp(h.id, o);
  }, novo ? null : async () => { await viagemApi.delHosp(h.id); });
}

export function formGasto(id){
  const viagem = viagemAtual();
  const novo = id == null;
  if(!viagem) return;
  const gasto = novo ? { data: viagem.inicio, desc:'', cat:'Restaurante', pg:'Cartão', valor:0 } : viagem.gastos.find(x => x.id === id);
  const rot = m => `${MOEDAS[m].n}  ${m}`;
  formGen(novo ? 'Novo gasto da viagem' : 'Editar gasto', [
    {k:'desc',l:'O quê'}, {k:'data',l:'Dia',tipo:'date'}, {k:'valor',l:'Valor',tipo:'number'},
    {k:'moeda',l:'Moeda',tipo:'select',opts:Object.keys(MOEDAS).map(rot)},
    {k:'cat',l:'Categoria',tipo:'select',opts:CATD}, {k:'pg',l:'Pagamento',tipo:'select',opts:PAGD},
  ], {...gasto, moeda: rot(gasto.moeda || viagem.moeda || 'EUR')}, async o => {
    o.moeda = Object.keys(MOEDAS).find(m => rot(m) === o.moeda) || viagem.moeda;
    if (novo) await viagemApi.addGasto(viagem.id, o);
    else await viagemApi.editGasto(gasto.id, o);
  }, novo ? null : async () => { await viagemApi.delGasto(gasto.id); });
}
