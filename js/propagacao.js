// ============================================================================
//  A propagação: quando você mexe numa conta fixa, o que acontece com as
//  contas mensais que nasceram dela.
//
//  Isto NUNCA existiu no projeto. Era esse o buraco: a conta mensal era uma
//  fotocópia da fixa, sem referência de volta, então editar a fixa não tinha
//  como alcançar nada. Agora existe `contas.fixo_id` (migração 003) e este
//  arquivo usa ele.
//
//  ─── AS DUAS REGRAS QUE MANDAM ───────────────────────────────────────────
//
//  1. CONTA PAGA É HISTÓRICO. NÃO SE MEXE.
//     Se você pagou R$ 622 em maio, esse é um fato. Editar o cadastro para
//     R$ 800 não pode reescrever maio — senão o "já pago" de meses fechados
//     muda sozinho e o seu histórico vira ficção. Paga = intocável: valor,
//     data, status, comprovante, observação do pagamento.
//
//  2. PENDENTE E FUTURO ACOMPANHAM.
//     Essas ainda não aconteceram. São previsão, e previsão obedece ao
//     cadastro.
//
//  ─── O PERÍODO ───────────────────────────────────────────────────────────
//
//  fixo.inicio e fixo.fim decidem em quais meses a conta deve existir.
//  Mudar o início para agosto significa: sumir das pendentes de julho para
//  trás, aparecer de agosto em diante. As pagas de julho ficam onde estão —
//  regra 1.
// ============================================================================
import { S } from './estado.js?v=20260720-4';
import { contasApi, carregarTudo } from './api.js';

/** O mês 'AAAA-MM' de uma data 'AAAA-MM-DD'. */
const mesDe = data => data.slice(0, 7);

/** Último dia do mês, para não gerar 31 de fevereiro. */
const ultimoDia = (ano, mes) => new Date(ano, mes, 0).getDate();

/** A data de vencimento daquele fixo naquele mês, com o dia ajustado. */
export function vencimentoNoMes(fixo, ano, mes) {
  const dia = Math.min(fixo.dia || 1, ultimoDia(ano, mes));
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Esta fixa deve ser lançada neste mês? Decide pelo período dela. */
export function valeNoMes(fixo, ano, mes) {
  if (!fixo.ativo) return false;
  const chave = `${ano}-${String(mes).padStart(2, '0')}`;
  if (fixo.inicio && chave < mesDe(fixo.inicio)) return false;   // ainda não começou
  if (fixo.fim    && chave > mesDe(fixo.fim))    return false;   // já acabou
  return true;
}

/** As contas mensais geradas por esta fixa. */
export const contasDaFixa = fixoId => S.tx.filter(t => t.fixoId === fixoId);

/** Nunca mexer nestas. */
export const intocavel = t => t.st === 'Pago';

/**
 * Descobre o que precisa mudar quando uma fixa é criada ou editada.
 * Só planeja — não grava. Assim dá para mostrar o plano antes de executar.
 *
 * Olha TODOS os meses já existentes na base, mais os meses até o fim do ano
 * corrente, para que "começar em agosto" alcance agosto mesmo que agosto ainda
 * não tenha sido gerado.
 */
export function planejar(fixo) {
  const daFixa = contasDaFixa(fixo.id);

  // o intervalo de meses a considerar: o que já existe na base + o resto do ano
  const meses = new Set(S.tx.map(t => mesDe(t.data)));
  daFixa.forEach(t => meses.add(mesDe(t.data)));
  const hoje = new Date();
  for (let m = 1; m <= 12; m++) meses.add(`${hoje.getFullYear()}-${String(m).padStart(2, '0')}`);
  if (fixo.inicio) meses.add(mesDe(fixo.inicio));

  const criar = [], atualizar = [], remover = [], preservadas = [];

  for (const chave of [...meses].sort()) {
    const [ano, mes] = chave.split('-').map(Number);
    const deve = valeNoMes(fixo, ano, mes);
    const existentes = daFixa.filter(t => mesDe(t.data) === chave);

    if (deve) {
      if (!existentes.length) {
        // só cria para frente: não inventa passado que você nunca teve
        if (chave >= mesDe(new Date().toISOString().slice(0, 10)))
          criar.push({
            data: vencimentoNoMes(fixo, ano, mes), conta: fixo.conta, cat: fixo.cat,
            loc: fixo.loc, pg: fixo.pg, est: fixo.est, pago: 0, st: 'Pendente',
            obs: '', moeda: fixo.moeda || 'BRL', fixoId: fixo.id
          });
      } else {
        for (const t of existentes) {
          if (intocavel(t)) { preservadas.push(t); continue; }   // REGRA 1
          atualizar.push({ ...t,                                  // REGRA 2
            conta: fixo.conta, cat: fixo.cat, loc: fixo.loc, pg: fixo.pg,
            est: fixo.est, moeda: fixo.moeda || 'BRL',
            data: vencimentoNoMes(fixo, ano, mes)
          });
        }
      }
    } else {
      for (const t of existentes) {
        if (intocavel(t)) { preservadas.push(t); continue; }      // REGRA 1
        remover.push(t);                                          // fora do período
      }
    }
  }
  return { criar, atualizar, remover, preservadas };
}

/**
 * Tenta associar lançamentos antigos (sem `fixoId`) a esta fixa quando a
 * correspondência é unívoca por competência. Não faz alterações no banco,
 * apenas no estado local `S.tx` para que `planejar` os veja como existentes.
 * Retorna o número de lançamentos vinculados.
 */
export function associarAntigos(fixo) {
  if (!fixo || !fixo.conta) return 0;
  const nome = (fixo.conta || '').trim().toLowerCase();
  const inicio = fixo.inicio || null; const fim = fixo.fim || null;
  const candidatos = S.tx.filter(t => !t.fixoId && (t.conta||'').trim().toLowerCase() === nome && t.st !== 'Pago');
  let vinculados = 0;
  // Agrupa por competência (AAAA-MM) e vincula somente quando há exatamente
  // um candidato naquela competência e a data estiver dentro do período do fixo.
  const porMes = {};
  for (const t of candidatos) {
    const chave = t.data.slice(0,7);
    porMes[chave] = porMes[chave] || [];
    porMes[chave].push(t);
  }
  for (const chave of Object.keys(porMes)) {
    const lista = porMes[chave];
    if (lista.length !== 1) continue; // ambíguo — não arriscamos
    const t = lista[0];
    if (inicio && chave < (inicio.slice(0,7))) continue;
    if (fim && chave > (fim.slice(0,7))) continue;
    // vincula localmente; será persistido quando propagar fizer atualizar/apagar
    t.fixoId = fixo.id;
    vinculados++;
  }
  return vinculados;
}

/**
 * Executa o plano no Supabase e no estado local.
 * Devolve o que fez, para o app poder avisar em português.
 */
export async function propagar(fixo, opts = { reload: true }) {
  // primeiro, tente associar lançamentos antigos sem fixoId que batem
  const vinculados = associarAntigos(fixo);

  // recalcula o plano já com possíveis vínculos locais aplicados
  const p = planejar(fixo);

  for (const t of p.atualizar) await contasApi.atualizar(t.id, t);
  for (const t of p.remover)   await contasApi.apagar(t.id);
  if (p.criar.length)          await contasApi.inserirVarias(p.criar);

  // Recarrega tudo do banco para garantir que S reflita exatamente o estado
  // do Supabase (inclui quaisquer gatilhos/colunas default do lado do servidor).
  if (opts.reload !== false) {
    try { await carregarTudo(); } catch (e) { /* se falhar, não aborta — já aplicamos mudanças */ }
  }

  return {
    criadas: p.criar.length,
    atualizadas: p.atualizar.length,
    removidas: p.remover.length,
    preservadas: p.preservadas.length,
    vinculadas: vinculados
  };
}

/**
 * Varre todas as fixas e tenta associar lançamentos antigos não vinculados.
 * Persiste os vínculos no banco para as linhas que puderem ser associadas
 * unicamente. Devolve um resumo { porFixa: {id, nome, vinculados}, total }.
 */
export async function vincularTodasFixas() {
  const resumo = { porFixa: [], total: 0 };
  for (const f of S.fixos) {
    const n = associarAntigos(f);
    if (n) {
      // persiste os lançamentos vinculados localmente
      const ligados = S.tx.filter(t => t.fixoId === f.id);
      for (const t of ligados) {
        try { await contasApi.atualizar(t.id, t); } catch (e) { /* ignora erros individuais */ }
      }
    }
    resumo.porFixa.push({ id: f.id, conta: f.conta, vinculados: n });
    resumo.total += n;
  }
  // recarrega o estado após persistir
  try { await carregarTudo(); } catch (e) {}
  return resumo;
}

/**
 * Ao apagar uma fixa: as contas mensais NÃO são apagadas.
 * O banco põe fixo_id = NULL (on delete set null) e o histórico continua.
 * Apagamos só as PENDENTES futuras, que eram previsão de algo que não vai
 * mais acontecer. O que já foi pago, e o mês corrente, ficam.
 */
export async function limparAoApagar(fixoId) {
  const hoje = new Date().toISOString().slice(0, 10);
  const soltar = contasDaFixa(fixoId).filter(t => !intocavel(t) && t.data > hoje);
  for (const t of soltar) await contasApi.apagar(t.id);
  return { removidas: soltar.length };
}

/**
 * Atualiza lançamentos vinculados a uma fixa: meses atuais e futuros, pendentes apenas.
 * Persiste as alterações e retorna número de atualizações e ids afetados.
 */
export async function atualizarLancamentosVinculados(fixo) {
  if (!fixo || !fixo.id) return { atualizados: 0, ids: [] };
  const hoje = new Date().toISOString().slice(0,10);
  const hojeMes = hoje.slice(0,7);
  const alvo = S.tx.filter(t => t.fixoId === fixo.id && t.st !== 'Pago' && t.data.slice(0,7) >= hojeMes);
  const ids = [];
  for (const t of alvo) {
    const [ano, mes] = t.data.slice(0,7).split('-').map(Number);
    const novaData = vencimentoNoMes(fixo, ano, mes);
    const atualizado = { ...t,
      conta: fixo.conta, cat: fixo.cat, loc: fixo.loc, pg: fixo.pg,
      est: fixo.est, moeda: fixo.moeda || 'BRL', data: novaData
    };
    try {
      await contasApi.atualizar(t.id, atualizado);
      ids.push(t.id);
    } catch (e) {
      console.warn('falha ao atualizar lançamento vinculado', t.id, e && e.message);
    }
  }
  // não recarregamos aqui; quem chamou pode decidir
  return { atualizados: ids.length, ids };
}
