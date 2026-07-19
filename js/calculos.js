// ============================================================================
//  O motor de cálculo. Um lugar só.
//
//  Antes, os totais eram recalculados em 8 pontos espalhados (app.js, painel,
//  mes, ano, diario) — cada um com o seu reduce. Isso significa 8 chances de
//  divergirem, e 8 lugares para mexer a cada regra nova.
//
//  Nada aqui inventa regra. É exatamente o que as telas já faziam, movido para
//  cá sem mudar uma vírgula do resultado.
//
//  REGRAS, escritas uma vez:
//    · "falta pagar" sai dos LANÇAMENTOS REAIS do mês, nunca do cadastro fixo
//    · pendente usa a estimativa; pago usa o valor pago
//    · vencida = pendente com vencimento anterior a hoje
// ============================================================================
import { S, V, noMes, vencido } from './estado.js';
import { conv } from './moeda.js';

// ---------------------------------------------------------------------------
//  A regra das moedas.
//
//  Somar 100 USD com 100 BRL e dizer 200 é mentira. Então NADA aqui soma valor
//  cru: cada item é convertido pela SUA moeda para BRL, e só então entra na
//  soma. O BRL é só o denominador comum interno — a tela mostra o total na
//  moeda que você escolheu no topo.
//
//  O valor original nunca é tocado: a conversão acontece na hora de somar,
//  não na hora de gravar.
// ---------------------------------------------------------------------------

/** A moeda de um lançamento. Sem moeda gravada = BRL, que era o que o app assumia. */
export const moedaDe = t => t.moeda || 'BRL';

/** Valor de um lançamento em BRL, seja qual for a moeda dele. */
const emReais = (v, t) => conv(v || 0, moedaDe(t), 'BRL');

/** As moedas presentes numa lista. Serve para avisar quando há mistura. */
export const moedasEm = ts => [...new Set(ts.map(moedaDe))];
export const temMistura = ts => moedasEm(ts).length > 1;

// ---------------------------------------------------------------------------
//  Seleção
// ---------------------------------------------------------------------------

/** As contas de um mês. Sem argumento, o mês que está na tela. */
export const contasDoMes = (ano = V.ano, mes = V.mes) => S.tx.filter(t => noMes(t, ano, mes));

/** Os gastos do dia a dia de um mês. */
export const diarioDoMes = (ano = V.ano, mes = V.mes) => S.diario.filter(d => noMes(d, ano, mes));

export const pendentes = ts => ts.filter(t => t.st === 'Pendente');
export const pagas     = ts => ts.filter(t => t.st === 'Pago');
export const vencidas  = ts => ts.filter(vencido);

// ---------------------------------------------------------------------------
//  Somas
// ---------------------------------------------------------------------------

export const somaEstimado = ts => ts.reduce((s, t) => s + emReais(t.est,   t), 0);
export const somaPago     = ts => ts.reduce((s, t) => s + emReais(t.pago,  t), 0);
export const somaValor    = ds => ds.reduce((s, d) => s + emReais(d.valor, d), 0);

/** O que ainda falta pagar: a estimativa das pendentes. */
export const somaPendente = ts => somaEstimado(pendentes(ts));

// ---------------------------------------------------------------------------
//  Agrupamentos
// ---------------------------------------------------------------------------

/**
 * Soma estimado e pago por chave (categoria, local...).
 * Devolve [{k, e, p}] só com as chaves que têm algum valor, da maior para a menor.
 */
export function agrupar(ts, campo, chaves) {
  return chaves.map(k => {
    const g = ts.filter(t => t[campo] === k);
    return { k, e: somaEstimado(g), p: somaPago(g) };
  }).filter(g => g.e || g.p).sort((a, b) => (b.p + b.e) - (a.p + a.e));
}

/** Soma dos gastos do dia a dia por categoria. Devolve [{k, v}]. */
export function agruparDiario(ds, chaves) {
  return chaves.map(k => ({ k, v: somaValor(ds.filter(d => d.cat === k)) }))
               .filter(x => x.v).sort((a, b) => b.v - a.v);
}

// ---------------------------------------------------------------------------
//  Ano
// ---------------------------------------------------------------------------

/** Total pago num mês do ano. cat = null soma todas as categorias. */
export const pagoNoMes = (ano, mes, cat = null) =>
  somaPago(S.tx.filter(t => +t.data.slice(0, 4) === ano &&
                            +t.data.slice(5, 7) === mes &&
                            (!cat || t.cat === cat)));

/** Total estimado num mês do ano. */
export const estimadoNoMes = (ano, mes) =>
  somaEstimado(S.tx.filter(t => +t.data.slice(0, 4) === ano && +t.data.slice(5, 7) === mes));

// ---------------------------------------------------------------------------
//  O resumo do mês — o que o cabeçalho e o painel mostram.
//  Uma chamada, os mesmos números em todas as telas. É isto que garante que o
//  cabeçalho nunca discorde do painel.
// ---------------------------------------------------------------------------

export function resumoMes(ano = V.ano, mes = V.mes) {
  const ts = contasDoMes(ano, mes);
  // os totais saem em BRL (denominador comum) e a tela converte para a moeda escolhida
  const est = somaEstimado(ts), pago = somaPago(ts);
  return {
    ts,
    estimado:  est,
    pago,
    pendente:  somaPendente(ts),
    diferenca: pago - est,
    nContas:   ts.length,
    nPagas:    pagas(ts).length,
    nPendentes: pendentes(ts).length,
    vencidas:  vencidas(ts),
    moedas:    moedasEm(ts),        // quais moedas apareceram neste mês
    mistura:   temMistura(ts)       // true = há mais de uma; os totais foram convertidos
  };
}
