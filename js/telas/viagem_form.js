// ============================================================================
//  Criar e editar viagem.
//
//  Usa o mesmo formGen() de todo o resto do app — nenhuma tela nova, nenhum
//  componente novo. A viagem criada aqui abre no MESMO painel da Espanha,
//  vazia, com os mesmos botões.
// ============================================================================
import { S, V, STATUS, esc } from '../estado.js';
import { MOEDAS } from '../moeda.js';
import { formGen, toast } from '../ui.js';
import { viagemApi, statusPelasDatas } from '../api.js';

// o formGen mostra o texto da opção; estes mapas traduzem para o que o banco guarda
const rotuloStatus = v => STATUS[v] || STATUS.planejamento;
const valorStatus  = r => Object.keys(STATUS).find(k => STATUS[k] === r) || 'planejamento';

const rotuloMoeda = m => `${MOEDAS[m].n}  ${m}`;
const valorMoeda  = r => Object.keys(MOEDAS).find(m => rotuloMoeda(m) === r) || 'EUR';

/** Câmbio sugerido: o que o app já usa hoje para aquela moeda. */
function cambioSugerido(moeda) {
  if (moeda === 'BRL') return 1;
  if (moeda === 'EUR') return S.cambio || 1;
  if (moeda === 'USD') return S.usd || 1;
  if (moeda === 'PYG') return 1 / (S.pyg || 1);
  return 1;
}

const hoje = () => new Date().toISOString().slice(0, 10);
const daquiADias = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/**
 * @param {object|null} v  null = criar; objeto = editar
 */
export function formViagem(v) {
  const novo = !v;
  const base = v || {
    nome: '', destino: '', inicio: hoje(), fim: daquiADias(7),
    moeda: 'EUR', cambio: S.cambio || 1, orcamento: '', obs: '',
    status: 'planejamento'
  };

  // o formGen trabalha com texto nos selects; entra traduzido, sai traduzido
  const dados = { ...base, moeda: rotuloMoeda(base.moeda), status: rotuloStatus(base.status) };

  formGen(novo ? 'Nova viagem' : 'Editar viagem', [
    { k:'nome',      l:'Nome da viagem', ph:'Ex.: Portugal 2027' },
    { k:'destino',   l:'País ou destino', ph:'Ex.: Portugal' },
    { k:'inicio',    l:'Data inicial', tipo:'date' },
    { k:'fim',       l:'Data final',   tipo:'date' },
    { k:'moeda',     l:'Moeda da viagem', tipo:'select', opts: Object.keys(MOEDAS).map(rotuloMoeda) },
    { k:'cambio',    l:'Câmbio — quanto vale 1 unidade dessa moeda em R$', tipo:'number' },
    { k:'orcamento', l:'Orçamento (opcional)', tipo:'number' },
    { k:'status',    l:'Status', tipo:'select', opts: Object.values(STATUS) },
    { k:'obs',       l:'Observações (opcional)' },
  ], dados, async o => {

    o.moeda  = valorMoeda(o.moeda);
    o.status = valorStatus(o.status);
    if (!o.destino) o.destino = o.nome;
    if (!o.cambio || o.cambio <= 0) o.cambio = cambioSugerido(o.moeda);
    if (o.fim < o.inicio) throw new Error('A data final é antes da inicial.');

    if (novo) {
      const nova = await viagemApi.criar(o);
      V.viagemId = nova.id;            // já abre na viagem que você acabou de criar
      toast(`"${nova.nome}" criada. Comece por + Estadia.`);
    } else {
      await viagemApi.editar(v.id, o);
    }

  }, novo ? null : async () => {
    const n = v.hosp.length + v.gastos.length;
    if (n && !confirm(
      `"${v.nome}" tem ${v.hosp.length} hospedagem(ns) e ${v.gastos.length} gasto(s).\n\n` +
      `Apagar a viagem apaga TUDO isso junto, e não tem volta.\n\nTem certeza?`)) {
      throw new Error('cancelado');
    }
    await viagemApi.apagar(v.id);
    V.viagemId = null;                 // volta para a viagem padrão
  });
}
