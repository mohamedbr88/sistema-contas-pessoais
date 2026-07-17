// ============================================================================
//  Estado da aplicação e constantes.
//
//  S  = os dados do usuário (espelho local do que está no Supabase)
//  V  = o estado da tela (mês visto, aba aberta, filtros)
//
//  Regra: NUNCA reatribuir S nem V (S = outra coisa). Imports de ES module são
//  só-leitura — use Object.assign(S, ...) ou S.tx = [...]. Se reatribuir, as
//  outras telas continuam vendo o objeto antigo.
// ============================================================================

export const VERSAO = 'v13-supabase';

export const INICIO = '2026-05-01';   // regra fixa: nada antes disso existe
export const A0 = 2026;   // ano em que o histórico começa
export const M0 = 5;      // mês  em que o histórico começa

export const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// categorias das contas
export const CATS = ['Aluguel','Assinaturas','Associações','Cartão/Banco','Compras','Condomínio',
                     'Contabilidade','Energia','Impostos','Internet','Saúde','Serviços',
                     'Telefone','Transporte','Outros'];

// categorias do dia a dia e da viagem
export const CATD = ['Bar','Compras','Entretenimento','Hospedagem','Mercado','Restaurante',
                     'Saúde','Transporte','Outros'];

export const LOCS = ['Apartamento','Chácara','Miro','Pessoal'];
export const PAGS = ['','Boleto','Bradesco','C6','Conta corrente','Dinheiro','Nubank','Picpay','Pix','Santander'];
export const PAGD = ['Cartão','Dinheiro','Pix'];
export const STATUS = {
  planejamento: 'Planejamento',
  em_viagem: 'Em viagem',
  concluida: 'Concluída'
};
export const CORES = {
  'Aluguel':'#2F4F9E','Assinaturas':'#7A3E9D','Associações':'#A85B00','Cartão/Banco':'#B4232A',
  'Compras':'#C2185B','Condomínio':'#00695C','Contabilidade':'#455A64','Energia':'#B98900',
  'Impostos':'#5D4037','Internet':'#0277BD','Saúde':'#0F6E5C','Serviços':'#827717',
  'Telefone':'#00838F','Transporte':'#E65100','Outros':'#78909C',
  'Bar':'#8E24AA','Entretenimento':'#00897B','Mercado':'#558B2F','Restaurante':'#D84315',
  'Hospedagem':'#3949AB'
};

export const ABAS = {
  mes:    { n:'Contas do mês', c:'#0F6E5C' },
  painel: { n:'Painel',        c:'#2F4F9E' },
  ano:    { n:'Ano',           c:'#7A3E9D' },
  diario: { n:'Dia a dia',     c:'#D84315' },
  viagem: { n:'Viagem',        c:'#00838F' },
  fixos:  { n:'Fixos',         c:'#B98900' },
  dados:  { n:'Dados',         c:'#5C7079' }
};

export const cor = c => CORES[c] || '#78909C';
export const cap = s => s ? s[0].toUpperCase() + s.slice(1) : 'Outros';

// ---------------------------------------------------------------------------
//  Dados do usuário. Preenchido por api.js → carregarTudo().
// ---------------------------------------------------------------------------
export const S = {
  tx: [],        // contas a pagar        → tabela public.contas
  fixos: [],     // recorrentes           → tabela public.fixos
  diario: [],    // dia a dia             → tabela public.despesas
  viagens: [],   // viagens + hosp + gastos
  cambio: 5.35,  // 1 EUR em BRL          → perfis.cambio_eur
  usd: 5.08,     // 1 USD em BRL          → perfis.cambio_usd
  pyg: 1385.72,  // 1 BRL em PYG          → perfis.cambio_pyg
  moeda: 'BRL',  // moeda exibida         → perfis.moeda_padrao
  perfil: null   // { id, nome, email }
};

// ---------------------------------------------------------------------------
//  Estado da tela.
// ---------------------------------------------------------------------------
export const V = {
  ano: 2026,
  mes: 7,
  aba: 'mes',
  diaSel: null,
  viagemId: null,
  filtro: { q:'', cat:'', loc:'', pg:'', st:'' },
  ord: { col:'data', dir:1 }
};

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
export const hojeISO = new Date().toISOString().slice(0, 10);

export const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const dia     = t => +t.data.slice(8, 10);
export const noMes   = (t, a, m) => t.data.slice(0, 7) === `${a}-${String(m).padStart(2,'0')}`;
export const vencido = t => t.st === 'Pendente' && t.data < hojeISO;
export const val     = t => t.st === 'Pago' ? (t.pago || 0) : (t.est || 0);

// os ids agora são uuid do banco; isto sobrou só para chaves locais de lista
export const novoId = () => crypto.randomUUID();

export function podar() {
  const antes = S.tx.length + S.diario.length;
  S.tx = S.tx.filter(t => t.data >= INICIO);
  S.diario = S.diario.filter(d => d.data >= INICIO);
  return antes - (S.tx.length + S.diario.length);
}

export function viagemAtual() {
  if (!S.viagens.length) return null;

  if (V.viagemId) {
    const encontrada = S.viagens.find(v => v.id === V.viagemId);
    if (encontrada) return encontrada;
  }

  return [...S.viagens].sort((a, b) =>
    String(b.inicio || '').localeCompare(String(a.inicio || ''))
  )[0];
}
