// ============================================================================
//  Conversão e formatação das 4 moedas.
//  Os valores são SEMPRE guardados na moeda de origem (contas em BRL, viagem
//  em EUR). A conversão é só para exibir — assim o câmbio mudar não mexe no
//  que você lançou.
// ============================================================================
import { S } from './estado.js';

export const MOEDAS = {
  BRL: { c:'BRL', n:'R$',  d:2 },
  USD: { c:'USD', n:'US$', d:2 },
  EUR: { c:'EUR', n:'€',   d:2 },
  PYG: { c:'PYG', n:'₲',   d:0 }
};

/** quanto vale 1 unidade da moeda m, em BRL */
export const emBRL = m =>
  m === 'BRL' ? 1 :
  m === 'USD' ? (S.usd || 1) :
  m === 'EUR' ? (S.cambio || 1) :
                1 / (S.pyg || 1);

export const conv = (v, de, para) => (v || 0) * emBRL(de) / emBRL(para);

/** formata na moeda escolhida pelo usuário. de = moeda de origem do valor */
export function M(v, de, compactoOuOpcoes) {
  const opcoes = (compactoOuOpcoes && typeof compactoOuOpcoes === 'object') ? compactoOuOpcoes : {};
  const deOrigem = de || 'BRL';
  const moedaTela = S.moeda || 'BRL';
  const moedaAlvo = opcoes.moeda || moedaTela;
  const o = MOEDAS[moedaAlvo] || MOEDAS[moedaTela];
  const d = o.d;
  const converter = opcoes.converter !== false;
  const n = converter ? conv(v, deOrigem, moedaAlvo) : (v || 0);
  try {
    return n.toLocaleString('pt-BR', { style:'currency', currency:o.c,
      currencyDisplay:'narrowSymbol', minimumFractionDigits:d, maximumFractionDigits:d });
  } catch (e) {   // navegador velho sem narrowSymbol
    return o.n + ' ' + n.toLocaleString('pt-BR', { minimumFractionDigits:d, maximumFractionDigits:d });
  }
}

export const Mc = (v, de) => M(v, de, true);

// ---------------------------------------------------------------------------
//  VE / VC — para valores que têm moeda PRÓPRIA, como uma viagem.
//
//  A viagem da Espanha foi paga em euro. € 318 no Hotel 4 é o fato; o R$ é uma
//  estimativa que muda toda vez que a cotação mexe. Por isso VE() nunca
//  converte: mostra o número como ele foi pago, igual à planilha.
// ---------------------------------------------------------------------------

/** Valor na moeda em que foi pago. Nunca converte. */
export function VE(v, mo, compacto) {
  mo = mo || 'EUR';
  return M(v, mo, { moeda: mo, converter: false });
}

/**
 * A conversão, como apoio. Devolve '' se a moeda escolhida já for a de origem.
 *
 * cambioProprio = quanto vale 1 unidade de `mo` em BRL, travado NAQUELA viagem.
 * Quando vier, ele manda — é o que faz a cotação de uma viagem antiga não mudar
 * quando você atualizar o câmbio de uma viagem nova. Sem ele, cai no câmbio
 * global (comportamento de hoje; a etapa 2 passa a mandar o da viagem).
 */
export function VC(v, mo, cambioProprio) {
  mo = mo || 'EUR';
  const alvo = S.moeda || 'BRL';
  if (alvo === mo) return '';
  const taxa = cambioProprio || emBRL(mo);       // BRL por 1 unidade de `mo`
  const emReais = (v || 0) * taxa;
  const n = emReais / emBRL(alvo);
  return M(n, alvo, { moeda: alvo, converter: false });
}

/** mostra o valor na moeda de origem, quando ela é diferente da selecionada */
export function outra(v, de) {
  const m = S.moeda || 'BRL';
  if (m === de) return '';
  return M(v, de, { moeda: de, converter: false });
}
