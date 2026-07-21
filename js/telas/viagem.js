// ============================================================================
//  Tela "Viagem": calendário diário, resumo lateral e conversão única.
// ============================================================================

import { CATD, PAGD, S, V, STATUS, MESES, cor, esc, hojeISO, viagemAtual } from '../estado.js?v=20260720-7';
import { M, MOEDAS } from '../moeda.js?v=20260720-7';
import { viagemApi } from '../api.js?v=20260720-7';
import { formGen } from '../ui.js?v=20260720-7';

const MOEDAS_ORDEM = ['BRL', 'USD', 'EUR', 'PYG'];
const MOEDA_ICONE = { BRL: 'R$', USD: 'US$', EUR: '€', PYG: '₲' };
const MOEDA_COR = { BRL: 'var(--cofre)', USD: 'var(--azul)', EUR: '#7A3E9D', PYG: '#D97706' };
const moedaSelecionada = () => S.moeda || 'BRL';
const mostrarTodas = () => false;

const CATEGORIAS_ERP = [
  { key: 'hospedagem', nome: 'Hospedagem', icone: '🏨' },
  { key: 'transporte', nome: 'Transporte', icone: '✈️' },
  { key: 'alimentacao', nome: 'Alimentação', icone: '🍽️' },
  { key: 'passeios', nome: 'Passeios', icone: '🎟️' },
  { key: 'compras', nome: 'Compras', icone: '🛍️' },
  { key: 'seguro', nome: 'Seguro Viagem', icone: '🛡️' },
  { key: 'comunicacao', nome: 'Comunicação', icone: '📱' },
  { key: 'documentos', nome: 'Documentos', icone: '📄' },
  { key: 'taxas', nome: 'Taxas e impostos', icone: '💰' },
  { key: 'outros', nome: 'Outros', icone: '📦' }
];

const CATEGORIA_MAP = Object.fromEntries(CATEGORIAS_ERP.map(c => [c.key, c]));

function taxaParaBRL(moeda, viagem = viagemAtual()) {
  const m = String(moeda || 'BRL').toUpperCase();
  const pyg = Number(S.pyg) || 1;
  const mapa = {
    BRL: 1,
    EUR: Number(S.cambio) || 1,
    USD: Number(S.usd) || 1,
    PYG: pyg ? 1 / pyg : 1
  };

  const base = String(viagem?.moeda || '').toUpperCase();
  const cambioViagem = Number(viagem?.cambio) || 0;
  if (base && cambioViagem > 0) {
    mapa[base] = base === 'BRL' ? 1 : cambioViagem;
  }
  return mapa[m] || 1;
}

function convViagem(valor, origem, destino = moedaSelecionada(), viagem = viagemAtual()) {
  const bruto = Number(valor) || 0;
  const de = String(origem || viagem?.moeda || 'BRL').toUpperCase();
  const para = String(destino || 'BRL').toUpperCase();
  if (!bruto || de === para) return bruto;
  const deParaBRL = taxaParaBRL(de, viagem);
  const paraParaBRL = taxaParaBRL(para, viagem);
  const emBRL = bruto * deParaBRL;
  return paraParaBRL ? emBRL / paraParaBRL : emBRL;
}

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
  const viagem = viagemAtual();
  const convertido = convViagem(valor, origem || viagem?.moeda || 'BRL', destino, viagem);
  return M(convertido, destino, { moeda: destino, converter: false });
}

function valorAtual(valor, origem) {
  return valorExibido(valor, origem, moedaSelecionada());
}

function valorMoedaLocal(valor, moeda) {
  return M(valor, moeda, { moeda, converter: false });
}

function valorComMoedaDaViagem(viagem, valor, origem, destino = moedaSelecionada()) {
  const convertido = convViagem(valor, origem || viagem?.moeda || 'BRL', destino, viagem);
  return M(convertido, destino, { moeda: destino, converter: false });
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

function periodoViagem(viagem) {
  return `${formatoCurto(viagem.inicio)} a ${formatoCurto(viagem.fim)}`;
}

function diasDaViagem(viagem) {
  return Math.round((new Date(viagem.fim) - new Date(viagem.inicio)) / 864e5) + 1;
}

function chaveItem(prefixo, item, idx = 0) {
  if (item?.id) return `${prefixo}:${item.id}`;
  const data = item?.data || 'sem-data';
  const valor = Number(item?.valor) || 0;
  const nome = item?.desc || item?.nome || 'item';
  return `${prefixo}:${data}:${nome}:${valor}:${idx}`;
}

function itemPago(item) {
  if (item?.pago === true) return true;
  const st = String(item?.st || item?.status || '').toLowerCase();
  if (st === 'pago' || st === 'paid') return true;
  return false;
}

function parseMetaLivre(texto = '') {
  const src = String(texto || '');
  const out = {};
  const campos = ['origem', 'destino', 'cidade', 'loja', 'produto', 'status', 'quantidade'];
  campos.forEach(campo => {
    const m = src.match(new RegExp(`${campo}\\s*[:=-]\\s*([^;|,\\n]+)`, 'i'));
    if (m && m[1]) out[campo] = m[1].trim();
  });
  return out;
}

function categoriaProfissional(item) {
  if (item.tipoBase === 'hospedagem') return 'hospedagem';
  const cat = String(item.cat || '').toLowerCase();
  const txt = `${String(item.desc || '')} ${String(item.obs || '')}`.toLowerCase();

  if (/taxa|impost|iva|vat|city tax|fee|tarifa/.test(txt)) return 'taxas';
  if (/seguro|insurance/.test(txt)) return 'seguro';
  if (/chip|sim|internet|wifi|telefone|roaming|dados/.test(txt)) return 'comunicacao';
  if (/passaporte|visto|document|certid|autoriz/.test(txt)) return 'documentos';
  if (cat === 'transporte' || /uber|taxi|t[áa]xi|ônibus|onibus|bus|trem|train|metrô|metro|voo|flight|carro/.test(txt)) return 'transporte';
  if (cat === 'restaurante' || cat === 'mercado' || /refei|cafe|jantar|almo[cç]o|mercado/.test(txt)) return 'alimentacao';
  if (cat === 'compras' || /compra|loja|souvenir|presente/.test(txt)) return 'compras';
  if (cat === 'entretenimento' || cat === 'bar' || /passeio|tour|ingresso|museu|show|parque/.test(txt)) return 'passeios';
  return 'outros';
}

function itensNormalizadosViagem(viagem, moedaDestino) {
  const itens = [];
  const vistos = new Set();

  (viagem.hosp || []).forEach((h, idx) => {
    const id = chaveItem('hosp', h, idx);
    if (vistos.has(id)) return;
    vistos.add(id);
    const meta = parseMetaLivre(h.obs || '');
    const checkOut = diaISO(h.data, Math.max(0, (h.noites || 1) - 1));
    itens.push({
      id,
      tipoBase: 'hospedagem',
      categoria: 'hospedagem',
      data: h.data,
      desc: h.nome || 'Hospedagem',
      cidade: h.cidade || meta.cidade || '',
      origem: meta.origem || '',
      destino: meta.destino || '',
      loja: meta.loja || '',
      produto: meta.produto || '',
      quantidade: Number(meta.quantidade) || 1,
      status: meta.status || (viagem.status === 'concluida' ? 'Concluída' : 'Reservada'),
      pago: itemPago(h),
      temMarcacaoPagamento: possuiMarcacaoPagamento(h),
      reserva: true,
      noites: Number(h.noites) || 1,
      checkIn: h.data,
      checkOut,
      moeda: h.moeda || viagem.moeda || 'EUR',
      valorOriginal: Number(h.valor) || 0,
      valor: convViagem(Number(h.valor) || 0, h.moeda || viagem.moeda || 'EUR', moedaDestino, viagem),
      pg: h.pg || '—',
      obs: h.obs || ''
    });
  });

  (viagem.gastos || []).forEach((g, idx) => {
    const id = chaveItem('gasto', g, idx);
    if (vistos.has(id)) return;
    vistos.add(id);
    const meta = parseMetaLivre(g.obs || g.desc || '');
    const base = {
      id,
      tipoBase: 'gasto',
      data: g.data,
      desc: g.desc || 'Lançamento',
      cidade: meta.cidade || '',
      origem: meta.origem || '',
      destino: meta.destino || '',
      loja: meta.loja || '',
      produto: meta.produto || g.desc || '',
      quantidade: Number(meta.quantidade) || 1,
      status: meta.status || '',
      pago: itemPago(g),
      temMarcacaoPagamento: possuiMarcacaoPagamento(g),
      reserva: false,
      noites: 0,
      checkIn: '',
      checkOut: '',
      moeda: g.moeda || viagem.moeda || 'EUR',
      valorOriginal: Number(g.valor) || 0,
      valor: convViagem(Number(g.valor) || 0, g.moeda || viagem.moeda || 'EUR', moedaDestino, viagem),
      pg: g.pg || '—',
      cat: g.cat || 'Outros',
      obs: g.obs || ''
    };
    base.categoria = categoriaProfissional(base);
    itens.push(base);
  });

  return itens.sort((a, b) => (a.data || '').localeCompare(b.data || '') || a.id.localeCompare(b.id));
}

function painelCategorias(itens, totalGeral) {
  const agrupado = CATEGORIAS_ERP.map(cat => {
    const lista = itens.filter(i => i.categoria === cat.key);
    const valor = lista.reduce((s, i) => s + i.valor, 0);
    return {
      ...cat,
      valor,
      percentual: totalGeral > 0 ? (valor / totalGeral) * 100 : 0,
      lancamentos: lista.length,
      reservas: lista.filter(i => i.reserva).length,
      itens: lista
    };
  });
  return agrupado;
}

function resumoLateralExecutivo(viagem, itens) {
  const dias = diasDaViagem(viagem);
  const hoje = hojeISO;
  let restantes = 0;
  if (hoje < viagem.inicio) restantes = dias;
  else if (hoje <= viagem.fim) restantes = Math.round((new Date(viagem.fim) - new Date(hoje)) / 864e5) + 1;

  const cidades = new Set();
  (viagem.hosp || []).forEach(h => { if (h.cidade) cidades.add(h.cidade); });
  itens.forEach(i => { if (i.cidade) cidades.add(i.cidade); });

  const paises = new Set();
  if (viagem.destino) paises.add(viagem.destino);

  return {
    dias,
    restantes,
    paises: paises.size,
    cidades: cidades.size,
    reservas: (viagem.hosp || []).length,
    lancamentos: itens.length,
    moedaBase: viagem.moeda || 'EUR',
    cambio: Number(viagem.cambio) || 1,
    atualizadoEm: new Date().toLocaleString('pt-BR')
  };
}

function possuiMarcacaoPagamento(item) {
  if (Object.prototype.hasOwnProperty.call(item || {}, 'pago')) return true;
  if (Object.prototype.hasOwnProperty.call(item || {}, 'st')) return true;
  if (Object.prototype.hasOwnProperty.call(item || {}, 'status')) return true;
  return false;
}

function itensResumoViagem(viagem) {
  const unicos = new Map();

  (viagem.hosp || []).forEach((h, idx) => {
    const key = chaveItem('hosp', h, idx);
    unicos.set(key, {
      key,
      tipo: 'hospedagem',
      valor: Number(h.valor) || 0,
      moeda: h.moeda || viagem.moeda || 'EUR',
      pago: itemPago(h),
      temMarcacaoPagamento: possuiMarcacaoPagamento(h)
    });
  });

  (viagem.gastos || []).forEach((g, idx) => {
    const key = chaveItem('gasto', g, idx);
    unicos.set(key, {
      key,
      tipo: 'gasto',
      valor: Number(g.valor) || 0,
      moeda: g.moeda || viagem.moeda || 'EUR',
      pago: itemPago(g),
      temMarcacaoPagamento: possuiMarcacaoPagamento(g)
    });
  });

  return [...unicos.values()];
}

export function calcularResumoViagem(viagemId = V.viagemId, moedaDestino = moedaSelecionada()) {
  const viagem = S.viagens.find(v => v.id === viagemId) || viagemAtual();
  if (!viagem) return null;

  const itens = itensResumoViagem(viagem);
  const totalPlanejado = itens.reduce((soma, item) => soma + convViagem(item.valor, item.moeda, moedaDestino, viagem), 0);
  const totalGastoDurante = (viagem.gastos || []).reduce((soma, item) => soma + convViagem(item.valor || 0, item.moeda || viagem.moeda || 'EUR', moedaDestino, viagem), 0);
  const temMarcacao = itens.some(item => item.temMarcacaoPagamento);
  const totalPagoMarcado = itens.filter(item => item.pago).reduce((soma, item) => soma + convViagem(item.valor, item.moeda, moedaDestino, viagem), 0);
  const totalPago = temMarcacao ? totalPagoMarcado : totalPlanejado;
  const totalPendente = Math.max(0, totalPlanejado - totalPago);
  const totalGeral = totalPlanejado;

  return {
    viagem,
    moedaDestino,
    totalPlanejado,
    totalPago,
    totalPendente,
    totalGastoDurante,
    totalGeral,
    dias: diasDaViagem(viagem),
    periodo: periodoViagem(viagem),
    status: STATUS[viagem.status] || viagem.status || 'Planejamento'
  };
}

export function renderCabecalhoViagem(viagemId = V.viagemId, moedaDestino = moedaSelecionada()) {
  const resumo = calcularResumoViagem(viagemId, moedaDestino);
  if (!resumo) return null;

  const nome = (resumo.viagem.destino || resumo.viagem.nome || 'Viagem').toUpperCase();
  const html = `
    <div class="hd-stat viagem-total-geral">
      <b>${valorMoedaLocal(resumo.totalGeral, resumo.moedaDestino)}</b>
      <span>Total geral da viagem</span>
    </div>
    <div class="hd-stat">
      <b>${valorMoedaLocal(resumo.totalPlanejado, resumo.moedaDestino)}</b>
      <span>Total planejado da viagem</span>
    </div>
    <div class="hd-stat">
      <b>${valorMoedaLocal(resumo.totalPago, resumo.moedaDestino)}</b>
      <span>Total já pago da viagem</span>
    </div>
    <div class="hd-stat">
      <b>${valorMoedaLocal(resumo.totalPendente, resumo.moedaDestino)}</b>
      <span>Total pendente da viagem</span>
    </div>
    <div class="hd-stat">
      <b>${valorMoedaLocal(resumo.totalGastoDurante, resumo.moedaDestino)}</b>
      <span>Total gasto durante a viagem</span>
    </div>`;

  return {
    ...resumo,
    nome,
    subtitulo: `${resumo.periodo} · ${resumo.dias} dias · Status: ${resumo.status}`,
    html
  };
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

  const emBRL = item => convViagem(item.valor || 0, item.moeda || viagem.moeda || 'EUR', 'BRL', viagem);
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
      valorLocal: convViagem(item.valor || 0, item.moeda || viagem.moeda || 'EUR', exibir, viagem)
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
  const totalDiaLocal = convViagem(dia.totalBRL || 0, 'BRL', exibir, viagem);
  const mediaDiaLocal = convViagem(dia.mediaBRL || 0, 'BRL', exibir, viagem);
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

function cardIndicador(titulo, valor, detalhe = '') {
  return `<div class="kpi viagem-kpi viagem-kpi-plus"><span>${titulo}</span><div class="viagem-valor"><b>${valor}</b>${detalhe ? `<small>${detalhe}</small>` : ''}</div></div>`;
}

function renderResumoExecutivo(resumoTopo, viagem, exibir) {
  const economizado = resumoTopo.totalPlanejado - resumoTopo.totalGastoDurante;
  const executada = resumoTopo.totalPlanejado > 0 ? (resumoTopo.totalGastoDurante / resumoTopo.totalPlanejado) * 100 : 0;
  let diasRestantes = 0;
  if (hojeISO < viagem.inicio) diasRestantes = resumoTopo.dias;
  else if (hojeISO <= viagem.fim) diasRestantes = Math.round((new Date(viagem.fim) - new Date(hojeISO)) / 864e5) + 1;

  return `<div class="kpis viagem-kpis viagem-kpis-executivo">
    ${cardIndicador('Total da viagem', valorMoedaLocal(resumoTopo.totalGeral, exibir), `${resumoTopo.periodo} · ${resumoTopo.dias} dias`)}
    ${cardIndicador('Total planejado', valorMoedaLocal(resumoTopo.totalPlanejado, exibir), 'Planejamento total da viagem')}
    ${cardIndicador('Total já pago', valorMoedaLocal(resumoTopo.totalPago, exibir), 'Lançamentos marcados como pagos')}
    ${cardIndicador('Total pendente', valorMoedaLocal(resumoTopo.totalPendente, exibir), 'Planejado menos já pago')}
    ${cardIndicador('Total gasto durante a viagem', valorMoedaLocal(resumoTopo.totalGastoDurante, exibir), `${viagem.gastos.length} lançamento(s) de gasto`)}
    ${cardIndicador('Economizado', valorMoedaLocal(economizado, exibir), economizado >= 0 ? 'Abaixo do planejado' : 'Acima do planejado')}
    ${cardIndicador('% executada da viagem', `${executada.toFixed(1).replace('.', ',')}%`, 'Gasto realizado / planejado')}
    ${cardIndicador('Dias restantes', String(Math.max(0, diasRestantes)), 'Contagem automática pelo período')}
  </div>`;
}

function renderCardsCategoria(categorias, totalGeral, moeda) {
  return `<div class="viagem-categorias-grid">${categorias.map(cat => {
    return `<article class="viagem-categoria-card">
      <div class="viagem-cat-top"><span class="viagem-cat-icone">${cat.icone}</span><h4>${cat.nome}</h4></div>
      <b>${valorMoedaLocal(cat.valor, moeda)}</b>
      <small>${cat.percentual.toFixed(1).replace('.', ',')}% da viagem</small>
      <div class="viagem-cat-meta">
        <span>${cat.lancamentos} lançamentos</span>
        <span>${cat.reservas} reservas</span>
      </div>
    </article>`;
  }).join('')}</div>`;
}

function renderResumoLateralCard(dados) {
  return `<div class="card viagem-lateral-card">
    <div class="card-hd"><h3>Resumo lateral</h3></div>
    <div class="viagem-lateral-grid">
      <div><span>Dias da viagem</span><b>${dados.dias}</b></div>
      <div><span>Dias restantes</span><b>${dados.restantes}</b></div>
      <div><span>Países</span><b>${dados.paises}</b></div>
      <div><span>Cidades</span><b>${dados.cidades}</b></div>
      <div><span>Reservas</span><b>${dados.reservas}</b></div>
      <div><span>Lançamentos</span><b>${dados.lancamentos}</b></div>
      <div><span>Moeda base</span><b>${MOEDAS[dados.moedaBase]?.n || dados.moedaBase}</b></div>
      <div><span>Câmbio utilizado</span><b>${valorMoedaLocal(dados.cambio, 'BRL')} / ${MOEDAS[dados.moedaBase]?.n || dados.moedaBase}</b></div>
      <div class="full"><span>Última atualização</span><b>${dados.atualizadoEm}</b></div>
    </div>
  </div>`;
}

function renderSecaoHospedagem(viagem, moedaExibir) {
  const linhas = [...(viagem.hosp || [])].sort((a, b) => a.data.localeCompare(b.data));
  const totalNoites = linhas.reduce((s, h) => s + (Number(h.noites) || 1), 0);
  const total = linhas.reduce((s, h) => s + convViagem(h.valor || 0, h.moeda || viagem.moeda || 'EUR', moedaExibir, viagem), 0);
  const pagos = linhas.filter(itemPago).reduce((s, h) => s + convViagem(h.valor || 0, h.moeda || viagem.moeda || 'EUR', moedaExibir, viagem), 0);
  return `<div class="card viagem-tabela-card">
    <div class="card-hd"><h3>Hospedagem</h3><div class="dir"><span class="mono" style="font-size:12px;color:var(--ink-2)">${valorMoedaLocal(total, moedaExibir)}</span><button class="btn-2" id="addH">+ Estadia</button></div></div>
    <table class="tmes">
      <thead><tr><th>Cidade</th><th>Hotel</th><th>Check-in</th><th>Check-out</th><th class="num">Noites</th><th>Status</th><th class="num">Valor</th><th class="num">Pago</th><th></th></tr></thead>
      <tbody>${!linhas.length ? '<tr><td colspan="9" class="vazio" style="padding:22px">Nenhuma hospedagem cadastrada.</td></tr>' : linhas.map(h => {
        const checkOut = diaISO(h.data, Math.max(0, (h.noites || 1) - 1));
        const valor = convViagem(h.valor || 0, h.moeda || viagem.moeda || 'EUR', moedaExibir, viagem);
        const pago = itemPago(h) ? valor : 0;
        return `<tr class="lin" style="--c:${cor('Hospedagem')}"><td>${esc(h.cidade || '—')}</td><td>${esc(h.nome || 'Hospedagem')}</td><td class="mono">${formatoCurto(h.data)}</td><td class="mono">${formatoCurto(checkOut)}</td><td class="num">${h.noites || 1}</td><td>${itemPago(h) ? 'Pago' : 'Reservada'}</td><td class="num">${valorMoedaLocal(valor, moedaExibir)}</td><td class="num">${valorMoedaLocal(pago, moedaExibir)}</td><td style="text-align:right"><button class="acao" data-eh="${h.id}">editar</button></td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr class="tot"><td colspan="4">${linhas.length} hospedagens</td><td class="num">${totalNoites}</td><td></td><td class="num">${valorMoedaLocal(total, moedaExibir)}</td><td class="num">${valorMoedaLocal(pagos, moedaExibir)}</td><td></td></tr></tfoot>
    </table>
  </div>`;
}

function renderSecaoTransporte(itens, moedaExibir) {
  const lista = itens.filter(i => i.categoria === 'transporte');
  return `<div class="card viagem-tabela-card"><div class="card-hd"><h3>Transporte</h3></div>
    <table class="tmes"><thead><tr><th>Origem</th><th>Destino</th><th>Data</th><th>Modal</th><th class="num">Valor</th><th>Pago</th></tr></thead>
    <tbody>${!lista.length ? '<tr><td colspan="6" class="vazio" style="padding:20px">Sem lançamentos de transporte.</td></tr>' : lista.map(i => `<tr><td>${esc(i.origem || '—')}</td><td>${esc(i.destino || i.cidade || '—')}</td><td class="mono">${i.data ? formatoCurto(i.data) : '—'}</td><td>${esc(i.desc || '—')}</td><td class="num">${valorMoedaLocal(i.valor, moedaExibir)}</td><td>${i.pago ? 'Pago' : 'Pendente'}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderSecaoAlimentacao(itens, moedaExibir) {
  const lista = itens.filter(i => i.categoria === 'alimentacao');
  const total = lista.reduce((s, i) => s + i.valor, 0);
  const refeicoes = lista.length;
  const mercados = lista.filter(i => /mercado/i.test(`${i.cat || ''} ${i.desc || ''}`)).length;
  const restaurantes = Math.max(0, refeicoes - mercados);
  const ticket = refeicoes ? total / refeicoes : 0;
  return `<div class="card viagem-resumo-operacional"><div class="card-hd"><h3>Alimentação</h3></div>
    <div class="viagem-op-grid"><div><span>Quantidade de refeições</span><b>${refeicoes}</b></div><div><span>Restaurantes</span><b>${restaurantes}</b></div><div><span>Mercados</span><b>${mercados}</b></div><div><span>Total gasto</span><b>${valorMoedaLocal(total, moedaExibir)}</b></div><div class="full"><span>Ticket médio</span><b>${valorMoedaLocal(ticket, moedaExibir)}</b></div></div></div>`;
}

function renderTabelaSimples(titulo, itens, moedaExibir, colunas) {
  const header = colunas.map(c => `<th${c.num ? ' class="num"' : ''}>${c.titulo}</th>`).join('');
  const body = !itens.length
    ? `<tr><td colspan="${colunas.length}" class="vazio" style="padding:20px">Sem lançamentos desta seção.</td></tr>`
    : itens.map(item => `<tr>${colunas.map(c => `<td${c.num ? ' class="num"' : ''}>${c.valor(item, moedaExibir)}</td>`).join('')}</tr>`).join('');
  return `<div class="card viagem-tabela-card"><div class="card-hd"><h3>${titulo}</h3></div><table class="tmes"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderGraficoPizza(categorias, total, moeda) {
  const ativo = categorias.filter(c => c.valor > 0);
  const circ = 2 * Math.PI * 54;
  let acc = 0;
  const colors = ['#0F6E5C', '#2F4F9E', '#7A3E9D', '#D97706', '#00838F', '#B98900', '#6E4A9E', '#AA5B2A', '#B4232A', '#6E7B82'];
  const arcs = ativo.map((c, i) => {
    const frac = total > 0 ? c.valor / total : 0;
    const dash = frac * circ;
    const start = acc;
    acc += dash;
    return `<circle cx="70" cy="70" r="54" fill="none" stroke="${colors[i % colors.length]}" stroke-width="20" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-start}" transform="rotate(-90 70 70)"></circle>`;
  }).join('');
  return `<div class="card viagem-chart-card"><div class="card-hd"><h3>Composição por categoria</h3></div>
    <div class="viagem-chart-body"><svg viewBox="0 0 140 140" class="viagem-pizza"><circle cx="70" cy="70" r="54" fill="none" stroke="#E4ECEC" stroke-width="20"></circle>${arcs}<text x="70" y="66" text-anchor="middle" font-size="10" fill="#5C7079">Total</text><text x="70" y="82" text-anchor="middle" font-size="12" font-weight="700" fill="#16262C">${valorMoedaLocal(total, moeda)}</text></svg>
    <div class="viagem-chart-legend">${ativo.map((c, i) => `<div><i style="background:${colors[i % colors.length]}"></i><span>${c.nome}</span><b>${c.percentual.toFixed(1).replace('.', ',')}%</b></div>`).join('')}</div></div></div>`;
}

function renderGraficoAcumulado(itens, moeda) {
  const porDia = new Map();
  itens.forEach(i => {
    const d = i.data || '';
    porDia.set(d, (porDia.get(d) || 0) + i.valor);
  });
  const dias = [...porDia.keys()].filter(Boolean).sort();
  const pontos = [];
  let acc = 0;
  dias.forEach(d => {
    acc += porDia.get(d) || 0;
    pontos.push({ d, v: acc });
  });
  const w = 780;
  const h = 240;
  const p = 28;
  const max = Math.max(...pontos.map(x => x.v), 1);
  const step = pontos.length > 1 ? (w - p * 2) / (pontos.length - 1) : 0;
  const coords = pontos.map((pt, i) => {
    const x = p + i * step;
    const y = h - p - ((pt.v / max) * (h - p * 2));
    return { ...pt, x, y };
  });
  const poly = coords.map(c => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
  return `<div class="card viagem-chart-card"><div class="card-hd"><h3>Evolução acumulada da viagem</h3></div>
    <div class="viagem-line-wrap"><svg viewBox="0 0 ${w} ${h}" class="viagem-line"><rect x="0" y="0" width="${w}" height="${h}" fill="#F8FBFA" rx="10"></rect><polyline points="${poly}" fill="none" stroke="#0F6E5C" stroke-width="3"></polyline>${coords.map(c => `<circle cx="${c.x}" cy="${c.y}" r="3" fill="#0F6E5C"><title>${formatoCurto(c.d)} · ${valorMoedaLocal(c.v, moeda)}</title></circle>`).join('')}</svg></div></div>`;
}

export function telaViagem(){
  const viagem = viagemAtual();
  if(!viagem) return `<div class="card"><div class="vazio">
      <b style="color:var(--ink);font-size:15px">Nenhuma viagem ainda</b>
      <p style="margin:6px 0 14px">Crie uma viagem para lançar hospedagem e gastos do dia.</p>
      <button class="btn btn-cofre" id="novaViagem">+ Nova viagem</button></div></div>`;

  const exibir = moedaSelecionada();
  const resumoTopo = calcularResumoViagem(viagem.id, exibir) || {
    totalGeral: 0,
    totalPlanejado: 0,
    totalPago: 0,
    totalPendente: 0,
    totalGastoDurante: 0,
    periodo: periodoViagem(viagem),
    dias: diasDaViagem(viagem)
  };
  const totalDias = Math.round((new Date(viagem.fim) - new Date(viagem.inicio)) / 864e5) + 1;
  const moedaBase = viagem.moeda || 'EUR';
  const cambio = viagem.cambio || S.cambio || 1;
  const itens = itensNormalizadosViagem(viagem, exibir);
  const categoriasProf = painelCategorias(itens, resumoTopo.totalGeral);
  const totalCategorias = categoriasProf.reduce((s, c) => s + c.valor, 0);
  const difCategorias = Math.abs(totalCategorias - resumoTopo.totalGeral);
  const lateralExec = resumoLateralExecutivo(viagem, itens);

  const diasIntervalo = intervaloDias(viagem);
  const dias = diasIntervalo.map(iso => resumoDia(viagem, iso));
  const diaSelecionado = dias.find(d => d.iso === V.viagemDiaSel) || dias[0] || null;
  if (diaSelecionado && V.viagemDiaSel !== diaSelecionado.iso) V.viagemDiaSel = diaSelecionado.iso;

  const grafico = resumoGrafico(viagem, exibir);
  const fluxo = estruturaFluxoViagem(grafico.dias, grafico.mediaDiaria);

  const passeios = itens.filter(i => i.categoria === 'passeios');
  const compras = itens.filter(i => i.categoria === 'compras');
  const transporte = itens.filter(i => i.categoria === 'transporte');
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

    <div class="viagem-kpi-faixa viagem-kpi-faixa-pro">
      ${renderResumoExecutivo(resumoTopo, viagem, exibir)}
    </div>

    <div class="card viagem-categorias-card">
      <div class="card-hd"><h3>Detalhamento por categoria</h3><div class="dir"><span class="mono" style="font-size:11px;color:var(--ink-2)">${difCategorias <= 0.01 ? 'conferido com total geral' : 'diferença detectada no total'}</span></div></div>
      <div style="padding:12px 14px 14px">${renderCardsCategoria(categoriasProf, resumoTopo.totalGeral, exibir)}</div>
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

    <div class="viagem-analitico-grid">
      ${renderGraficoPizza(categoriasProf, resumoTopo.totalGeral, exibir)}
      ${renderGraficoAcumulado(itens, exibir)}
      ${renderResumoLateralCard(lateralExec)}
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
        <div class="viagem-grafico-kpi"><span>Total da viagem</span><b>${valorMoedaLocal(resumoTopo.totalGeral, exibir)}</b></div>
        <div class="viagem-grafico-kpi"><span>Gastos da viagem</span><b>${valorMoedaLocal(resumoTopo.totalGastoDurante, exibir)}</b></div>
        <div class="viagem-grafico-kpi"><span>Média diária</span><b>${valorMoedaLocal(grafico.mediaDiaria, exibir)}</b></div>
        <div class="viagem-grafico-kpi"><span>Maior dia</span><b>${grafico.diaMaior ? `${grafico.diaMaior.dataCurta} · ${valorMoedaLocal(grafico.diaMaior.totalLocal, exibir)}` : 'Sem dados'}</b></div>
      </div>
    </div>

    ${renderSecaoHospedagem(viagem, exibir)}
    ${renderSecaoTransporte(transporte, exibir)}
    ${renderSecaoAlimentacao(itens, exibir)}
    ${renderTabelaSimples('Passeios', passeios, exibir, [
      { titulo: 'Nome', valor: i => esc(i.desc || '—') },
      { titulo: 'Cidade', valor: i => esc(i.cidade || '—') },
      { titulo: 'Data', valor: i => i.data ? `<span class="mono">${formatoCurto(i.data)}</span>` : '—' },
      { titulo: 'Valor', num: true, valor: i => valorMoedaLocal(i.valor, exibir) },
      { titulo: 'Status', value: '', valor: i => esc(i.status || (i.pago ? 'Pago' : 'Planejado')) }
    ])}
    ${renderTabelaSimples('Compras', compras, exibir, [
      { titulo: 'Produto', valor: i => esc(i.produto || i.desc || '—') },
      { titulo: 'Loja', valor: i => esc(i.loja || '—') },
      { titulo: 'Cidade', valor: i => esc(i.cidade || '—') },
      { titulo: 'Valor', num: true, valor: i => valorMoedaLocal(i.valor, exibir) },
      { titulo: 'Quantidade', num: true, valor: i => String(i.quantidade || 1) }
    ])}

    <div class="card viagem-tabela-card">
      <div class="card-hd"><h3>Lançamentos da viagem</h3><div class="dir"><span class="mono" style="font-size:12px;color:var(--ink-2)">${valorMoedaLocal(resumoTopo.totalGastoDurante, exibir)}</span><button class="btn" id="addG">+ Gasto</button></div></div>
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
