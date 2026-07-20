// ============================================================================
//  Tela "Viagem": calendário diário, resumo lateral e conversão única.
// ============================================================================

import { CATD, PAGD, S, V, STATUS, cor, esc, hojeISO, viagemAtual } from '../estado.js?v=20260720-4';
import { M, MOEDAS } from '../moeda.js?v=20260720-4';
import { viagemApi } from '../api.js?v=20260720-4';
import { formGen } from '../ui.js?v=20260720-4';

const MOEDAS_ORDEM = ['BRL', 'USD', 'EUR', 'PYG'];
const MOEDA_ICONE = { BRL: 'R$', USD: 'US$', EUR: '€', PYG: '₲' };
const MOEDA_COR = { BRL: 'var(--cofre)', USD: 'var(--azul)', EUR: '#7A3E9D', PYG: '#D97706' };
const moedaSelecionada = () => S.moeda || 'BRL';
const mostrarTodas = () => V.viagemMoedas === 'todas';

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

  const total = lancamentos.reduce((s, item) => s + (item.valor || 0), 0);
  const maior = lancamentos.reduce((maximo, item) => (item.valor > maximo.valor ? item : maximo), { valor: 0 });
  const menor = lancamentos.length ? lancamentos.reduce((minimo, item) => (item.valor < minimo.valor ? item : minimo), lancamentos[0]) : { valor: 0 };
  const observacoes = lancamentos.map(item => item.obs).filter(Boolean);

  return {
    iso,
    dataCurta: formatoCurto(iso),
    cidade,
    hotel,
    lancamentos,
    categorias: Array.from(categorias),
    total,
    media: lancamentos.length ? total / lancamentos.length : 0,
    maior,
    menor,
    pagamentos: [...pagamentos.entries()].sort((a, b) => b[1] - a[1]),
    observacoes
  };
}

function tooltipDia(dia, viagem) {
  const linhas = [
    `${dia.dataCurta} · ${dia.cidade}`,
    dia.hotel ? `Hotel: ${dia.hotel}` : 'Sem hospedagem',
    `Total: ${valorAtual(dia.total, viagem.moeda || 'EUR')}`,
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
      <div class="viagem-dia-total"><b>${valorAtual(dia.total, viagem.moeda || 'EUR')}</b><small>${dia.lancamentos.length} lançamentos</small></div>
      <div class="viagem-dia-indicadores">${indicacaoCategoria(dia)}</div>
    </button>`;
  }).join('');
}

function resumoLateral(dia, viagem, exibir) {
  const maiorValor = dia.maior?.valor || 0;
  const maiorMoeda = dia.maior?.moeda || viagem.moeda || 'EUR';
  const menorValor = dia.menor?.valor || 0;
  const menorMoeda = dia.menor?.moeda || viagem.moeda || 'EUR';
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
      <div><span>Total gasto</span><b>${valorExibido(dia.total, valorViagem, exibir)}</b></div>
      <div><span>Média do dia</span><b>${valorExibido(dia.media, valorViagem, exibir)}</b></div>
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
    ${mostrarTodas() ? `<div class="viagem-comparacao">${compararMoedas(dia.total, valorViagem)}</div>` : ''}
  </div>`;
}

function railMoedas() {
  return `<aside class="card viagem-moeda-rail">
    <span class="viagem-rail-titulo">Moeda</span>
    <div class="viagem-rail-moedas">
      ${Object.keys(MOEDAS).map(m => `<button class="${moedaSelecionada() === m ? 'on' : ''}" data-m="${m}" title="${MOEDAS[m].n}">${MOEDA_ICONE[m]}</button>`).join('')}
    </div>
    <label class="viagem-compare-toggle"><input type="checkbox" id="viagemMostrarTodas" ${mostrarTodas() ? 'checked' : ''}> Mostrar todas as moedas</label>
  </aside>`;
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

  const totalHospedagem = viagem.hosp.reduce((s, h) => s + (h.valor || 0), 0);
  const totalGastos = viagem.gastos.reduce((s, g) => s + (g.valor || 0), 0);
  const noites = viagem.hosp.reduce((s, h) => s + (h.noites || 1), 0);
  const totalDias = Math.round((new Date(viagem.fim) - new Date(viagem.inicio)) / 864e5) + 1;
  const moedaBase = viagem.moeda || 'EUR';
  const cambio = viagem.cambio || S.cambio || 1;
  const exibir = moedaSelecionada();
  const dias = intervaloDias(viagem).map(iso => resumoDia(viagem, iso));
  const selecionado = dias.find(d => d.iso === V.viagemDiaSel) || dias[0];
  if (selecionado && V.viagemDiaSel !== selecionado.iso) V.viagemDiaSel = selecionado.iso;
  const categorias = CATD.map(cat => ({
    cat,
    valor: viagem.gastos.filter(g => g.cat === cat).reduce((s, g) => s + (g.valor || 0), 0)
  })).filter(x => x.valor).sort((a, b) => b.valor - a.valor);
  const maxCategoria = Math.max(...categorias.map(x => x.valor), 1);
  const gastosPorDia = viagem.gastos.reduce((acc, g) => {
    acc[g.data] = (acc[g.data] || 0) + (g.valor || 0);
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
        <div class="card-hd"><h3>Calendário Diário da Viagem</h3><div class="dir"><span class="mono">${dias.length} dias</span></div></div>
        <div class="viagem-calendar-lista">
          ${calendarioHtml(viagem, dias.map(d => d.iso), selecionado)}
        </div>
      </div>
      <div class="card viagem-resumo-card">
        <div class="card-hd"><h3>Resumo lateral</h3><div class="dir"><span class="mono">${selecionado?.dataCurta || ''}</span></div></div>
        ${selecionado ? resumoLateral(selecionado, viagem, exibir) : '<div class="vazio viagem-vazio-dia">Selecione um dia no calendário.</div>'}
      </div>
    </div>
    <div class="viagem-kpi-faixa">
      <div class="kpis viagem-kpis">
        ${resumoMini(viagem, 'Hospedagem', totalHospedagem, moedaBase, `${noites} noites · ${valorExibido(totalHospedagem / (noites || 1), moedaBase, exibir)}/noite`)}
        ${resumoMini(viagem, 'Gastos do dia', totalGastos, moedaBase, `${viagem.gastos.length} lançamentos`)}
        ${resumoMini(viagem, 'Total da viagem', totalHospedagem + totalGastos, moedaBase, `${totalDias} dias`)}
        ${resumoMini(viagem, 'Média diária', (totalHospedagem + totalGastos) / totalDias, moedaBase, `hosp ${valorExibido(totalHospedagem / (noites || 1), moedaBase, exibir)} + dia ${valorExibido(totalGastos / totalDias, moedaBase, exibir)}`)}
      </div>
      ${railMoedas()}
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
          <span class="mono">${formatoCurto(viagem.inicio)}</span><span class="mono">maior dia: ${valorAtual(maxDia, moedaBase)}</span><span class="mono">${formatoCurto(viagem.fim)}</span>
        </div>
      </div>
    </div>
    <div class="card viagem-tabela-card">
      <div class="card-hd"><h3>Hospedagem</h3><div class="dir"><span class="mono" style="font-size:12px;color:var(--ink-2)">${valorExibido(totalHospedagem, moedaBase, exibir)}</span><button class="btn-2" id="addH">+ Estadia</button></div></div>
      <table class="tmes">
        <thead><tr><th>Entrada</th><th>Hotel</th><th>Cidade</th><th class="num">Noites</th><th class="num">Valor (${MOEDAS[exibir].n})</th><th class="num">Por noite</th><th></th><th></th></tr></thead>
        <tbody>${!viagem.hosp.length ? '<tr><td colspan="8" class="vazio" style="padding:22px">Nenhuma hospedagem ainda. Use <b style="color:var(--ink)">+ Estadia</b>.</td></tr>' : viagem.hosp.slice().sort((a, b) => a.data.localeCompare(b.data)).map(h => `<tr class="lin" style="--c:${cor('Hospedagem')}"><td class="mono" style="font-size:12px;color:var(--ink-2)">${formatoCurto(h.data)}</td><td>${esc(h.nome)}</td><td style="font-size:12px;color:var(--ink-2)">${esc(h.cidade)}</td><td class="num">${h.noites}</td><td class="num" style="font-weight:600">${valorAtual(h.valor, h.moeda || moedaBase)}</td><td class="num" style="font-size:12px;color:var(--ink-2)">${valorExibido(h.valor / (h.noites || 1), h.moeda || moedaBase, exibir)}</td><td></td><td style="text-align:right"><button class="acao" data-eh="${h.data}">editar</button></td></tr>`).join('')}</tbody>
        <tfoot><tr class="tot"><td colspan="3">${viagem.hosp.length} estadias</td><td class="num">${noites}</td><td class="num">${valorExibido(totalHospedagem, moedaBase, exibir)}</td><td class="num">${valorExibido(totalHospedagem / (noites || 1), moedaBase, exibir)}</td><td colspan="2"></td></tr></tfoot>
      </table>
    </div>
    <div class="card viagem-tabela-card">
      <div class="card-hd"><h3>Gastos do dia</h3><div class="dir"><span class="mono" style="font-size:12px;color:var(--ink-2)">${valorExibido(totalGastos, moedaBase, exibir)}</span><button class="btn" id="addG">+ Gasto</button></div></div>
      <div style="max-height:520px;overflow:auto">
        <table class="tmes">
          <thead><tr><th>Dia</th><th>O quê</th><th>Categoria</th><th>Pgto</th><th class="num">Valor (${MOEDAS[exibir].n})</th><th class="num">Detalhe</th><th></th><th></th></tr></thead>
          <tbody>${!viagem.gastos.length ? '<tr><td colspan="8" class="vazio" style="padding:22px">Nenhum gasto ainda. Use <b style="color:var(--ink)">+ Gasto</b>.</td></tr>' : viagem.gastos.slice().sort((a, b) => a.data.localeCompare(b.data) || horaOrdenacao(a).localeCompare(horaOrdenacao(b))).map(g => `<tr class="lin" style="--c:${cor(g.cat)}"><td class="mono" style="font-size:12px;color:var(--ink-2)">${formatoCurto(g.data)}<div style="font-size:10px;opacity:.85;margin-top:2px">${horaExibicao(g)}</div></td><td>${esc(g.desc)}${g.obs ? `<div style="font-size:11px;color:var(--ink-2);margin-top:2px">${esc(g.obs)}</div>` : ''}</td><td><span class="pill" style="background:${cor(g.cat)}1A;color:${cor(g.cat)}">${esc(g.cat)}</span></td><td style="font-size:12px;color:var(--ink-2)">${esc(g.pg)}</td><td class="num" style="font-weight:600">${valorAtual(g.valor, g.moeda || moedaBase)}</td><td class="num" style="font-size:12px;color:var(--ink-2)">${mostrarTodas() ? compararMoedas(g.valor, g.moeda || moedaBase) : '—'}</td><td></td><td style="text-align:right"><button class="acao" data-eg="${g.id}">editar</button></td></tr>`).join('')}</tbody>
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
