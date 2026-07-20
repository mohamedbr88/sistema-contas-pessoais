// ============================================================================
//  Criar e editar uma conta fixa.
//
//  Esta tela NÃO EXISTIA. Antes só dava para ativar (caixinha) e apagar —
//  por isso "editar a fixa" nunca chegava nas contas do mês: não havia como
//  editar.
//
//  Ao salvar, propaga: veja js/propagacao.js para as regras.
// ============================================================================
import { S, CATS, LOCS, PAGS } from '../estado.js?v=20260720-4';
import { MOEDAS } from '../moeda.js';
import { formGen, toast } from '../ui.js';
import { fixosApi } from '../api.js';
import { propagar, limparAoApagar, atualizarLancamentosVinculados } from '../propagacao.js';
import { render } from '../bus.js';

const rotuloMoeda = m => `${MOEDAS[m].n}  ${m}`;
const valorMoeda  = r => Object.keys(MOEDAS).find(m => rotuloMoeda(m) === r) || 'BRL';

export function formFixo(f) {
  const novo = !f;
  const base = f || {
    conta: '', dia: 10, cat: 'Outros', loc: 'Pessoal', pg: '',
    est: 0, moeda: S.moeda || 'BRL', inicio: '', fim: '', obs: '', ativo: true
  };
  const dados = { ...base, moeda: rotuloMoeda(base.moeda || 'BRL') };

  formGen(novo ? 'Nova conta fixa' : `Editar "${base.conta.trim()}"`, [
    { k:'conta',  l:'Conta', ph:'Ex.: Luz chácara' },
    { k:'est',    l:'Valor por mês', tipo:'number' },
    { k:'moeda',  l:'Moeda', tipo:'select', opts: Object.keys(MOEDAS).map(rotuloMoeda) },
    { k:'dia',    l:'Dia do vencimento', tipo:'number' },
    { k:'cat',    l:'Categoria', tipo:'select', opts: CATS },
    { k:'loc',    l:'Local', tipo:'select', opts: LOCS },
    { k:'pg',     l:'Pagamento', tipo:'select', opts: PAGS },
    { k:'inicio', l:'Começa em (deixe vazio = desde sempre)', tipo:'date' },
    { k:'fim',    l:'Termina em (deixe vazio = sem fim)', tipo:'date' },
    { k:'obs',    l:'Observações (opcional)' },
  ], dados, async o => {
    o.moeda = valorMoeda(o.moeda);
    o.dia   = Math.min(31, Math.max(1, Math.round(o.dia) || 1));
    o.ativo = base.ativo !== false;
    if (o.inicio && o.fim && o.fim < o.inicio) throw new Error('O fim é antes do começo.');

    const fixo = novo ? await fixosApi.inserir(o) : await fixosApi.atualizar(f.id, o);

    // é AQUI que o buraco se fecha: o cadastro alcança as contas do mês
    const r = await propagar(fixo);
    // além do planejamento, atualiza explicitamente lançamentos vinculados
    const atualizados = await atualizarLancamentosVinculados(fixo);
    // garantir que a UI seja recalculada imediatamente após propagar e atualizar
    try{ render(); } catch(e) { /* render pode não estar disponível em alguns contextos */ }
    const partes = [];
    if (r.atualizadas) partes.push(`${r.atualizadas} conta(s) do mês atualizada(s)`);
    if (atualizados)   partes.push(`${atualizados} lançamento(s) vinculado(s) atualizado(s)`);
    if (r.criadas)     partes.push(`${r.criadas} criada(s)`);
    if (r.removidas)   partes.push(`${r.removidas} removida(s) do período`);
    if (r.preservadas) partes.push(`${r.preservadas} já paga(s) preservada(s)`);
    toast(partes.length ? partes.join(' · ') : 'Salvo');

  }, novo ? null : async () => {
    const r = await limparAoApagar(f.id);
    await fixosApi.apagar(f.id);
    try{ render(); } catch(e){}
    toast(r.removidas
      ? `Fixa apagada · ${r.removidas} pendente(s) futura(s) removida(s) · o histórico pago continua`
      : 'Fixa apagada · o histórico continua');
  });
}

/** Atualiza lançamentos vinculados a uma fixa: meses atuais e futuros, pendentes apenas. */
// using atualizarLancamentosVinculados from propagacao.js
