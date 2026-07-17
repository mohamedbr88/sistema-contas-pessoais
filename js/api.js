// ============================================================================
//  Camada de dados. É o único arquivo que fala com o banco.
//
//  As telas continuam lendo S.tx / S.fixos / S.diario / S.viagens exatamente
//  como antes — por isso nenhuma tela precisou mudar de desenho. O que mudou é
//  que agora S é um espelho do Supabase, e toda alteração vai para o banco
//  antes de aparecer na tela.
//
//  Nunca mandamos user_id do frontend por confiança: mandamos porque a coluna
//  é obrigatória, e o RLS confere se bate com o auth.uid() do token. Se alguém
//  forjar outro id, o banco recusa (testado).
// ============================================================================
import { sb, usuarioId, erroLegivel } from './supabase.js';
import { S, V, INICIO } from './estado.js';

/** Erro do PostgREST → erro legível, e para tudo. */
function ops(erro) {
  if (erro) throw new Error(erroLegivel(erro));
}

// ---------------------------------------------------------------------------
//  Tradutores: linha do banco  <->  objeto que as telas já conhecem
//
//  d(): toda data vira 'AAAA-MM-DD', sempre. O PostgREST devolve `date` como
//  string limpa, mas um driver ou uma coluna timestamp devolveria
//  '2026-05-10T00:00:00Z' — e aí todo .slice(0,7) que compara mês quebraria
//  calado. Normalizar aqui custa nada e fecha essa porta.
// ---------------------------------------------------------------------------
const d = v => String(v ?? '').slice(0, 10);
const doBancoConta = r => ({
  id: r.id, data: d(r.vencimento), conta: r.descricao, cat: r.categoria, loc: r.local,
  pg: r.forma_pagamento || '', est: Number(r.valor_estimado) || 0,
  pago: Number(r.valor_pago) || 0, st: r.status, obs: r.obs || ''
});
const praBancoConta = (o, uid) => ({
  user_id: uid, descricao: o.conta, vencimento: o.data, categoria: o.cat, local: o.loc,
  forma_pagamento: o.pg || '', valor_estimado: o.est || 0, valor_pago: o.pago || 0,
  status: o.st, obs: o.obs || ''
});

const doBancoFixo = r => ({
  id: r.id, conta: r.descricao, dia: r.dia_vencimento, cat: r.categoria, loc: r.local,
  pg: r.forma_pagamento || '', est: Number(r.valor_estimado) || 0, ativo: r.ativo
});
const praBancoFixo = (o, uid) => ({
  user_id: uid, descricao: o.conta, dia_vencimento: o.dia, categoria: o.cat, local: o.loc,
  forma_pagamento: o.pg || '', valor_estimado: o.est || 0, ativo: o.ativo !== false
});

const doBancoDespesa = r => ({
  id: r.id, data: d(r.data), desc: r.descricao, cat: r.categoria,
  pg: r.forma_pagamento, valor: Number(r.valor) || 0
});
const praBancoDespesa = (o, uid) => ({
  user_id: uid, descricao: o.desc, data: o.data, categoria: o.cat,
  forma_pagamento: o.pg, valor: o.valor || 0, moeda: 'BRL'
});

const doBancoHosp = r => ({
  id: r.id, data: d(r.entrada), nome: r.nome, cidade: r.cidade || '',
  noites: r.noites, valor: Number(r.valor) || 0
});
const doBancoGasto = r => ({
  id: r.id, data: d(r.data), desc: r.descricao, cat: r.categoria,
  pg: r.forma_pagamento, valor: Number(r.valor) || 0
});

// ---------------------------------------------------------------------------
//  CARREGAR TUDO — uma vez, no boot. 5 consultas em paralelo.
// ---------------------------------------------------------------------------
export async function carregarTudo() {
  const uid = await usuarioId();
  if (!uid) throw new Error('Ninguém logado.');

  const [perfil, contas, fixos, despesas, viagens] = await Promise.all([
    sb.from('perfis').select('*').eq('id', uid).maybeSingle(),
    sb.from('contas').select('*').gte('vencimento', INICIO).order('vencimento'),
    sb.from('fixos').select('*').order('ordem').order('descricao'),
    sb.from('despesas').select('*').gte('data', INICIO).order('data', { ascending:false }),
    sb.from('viagens').select('*, viagem_hospedagem(*), viagem_gastos(*)').order('inicio')
  ]);
  [perfil, contas, fixos, despesas, viagens].forEach(r => ops(r.error));

  if (perfil.data) {
    S.perfil = { id: perfil.data.id, nome: perfil.data.nome, email: perfil.data.email };
    S.moeda  = perfil.data.moeda_padrao;
    S.cambio = Number(perfil.data.cambio_eur);
    S.usd    = Number(perfil.data.cambio_usd);
    S.pyg    = Number(perfil.data.cambio_pyg);
  }
  S.tx      = (contas.data   || []).map(doBancoConta);
  S.fixos   = (fixos.data    || []).map(doBancoFixo);
  S.diario  = (despesas.data || []).map(doBancoDespesa);
  S.viagens = (viagens.data  || []).map(v => ({
    id: v.id, nome: v.nome, destino: v.destino || v.nome, moeda: v.moeda,
    cambio: Number(v.cambio) || 1, orcamento: Number(v.orcamento) || 0,
    status: v.status || statusPelasDatas(v.inicio, v.fim), obs: v.obs || '',
    inicio: d(v.inicio), fim: d(v.fim),
    hosp:   (v.viagem_hospedagem || []).map(doBancoHosp).sort((a,b)=>a.data.localeCompare(b.data)),
    gastos: (v.viagem_gastos     || []).map(doBancoGasto).sort((a,b)=>a.data.localeCompare(b.data))
  }));
  return { contas: S.tx.length, fixos: S.fixos.length, diario: S.diario.length, viagens: S.viagens.length };
}

// ---------------------------------------------------------------------------
//  PERFIL (câmbios e moeda escolhida)
// ---------------------------------------------------------------------------
export async function salvarPerfil(campos) {
  const uid = await usuarioId();
  const { error } = await sb.from('perfis').update(campos).eq('id', uid);
  ops(error);
}

// ---------------------------------------------------------------------------
//  CONTAS
// ---------------------------------------------------------------------------
export const contasApi = {
  async inserir(o) {
    const uid = await usuarioId();
    const { data, error } = await sb.from('contas').insert(praBancoConta(o, uid)).select().single();
    ops(error);
    const novo = doBancoConta(data); S.tx.push(novo); return novo;
  },
  async inserirVarias(lista) {
    const uid = await usuarioId();
    const linhas = lista.map(o => praBancoConta(o, uid));
    const criados = [];
    for (let i = 0; i < linhas.length; i += 500) {          // lotes: o PostgREST tem limite
      const { data, error } = await sb.from('contas').insert(linhas.slice(i, i+500)).select();
      ops(error);
      criados.push(...data.map(doBancoConta));
    }
    S.tx.push(...criados); return criados;
  },
  async atualizar(id, o) {
    const uid = await usuarioId();
    const { data, error } = await sb.from('contas').update(praBancoConta(o, uid)).eq('id', id).select().single();
    ops(error);
    Object.assign(S.tx.find(t => t.id === id), doBancoConta(data));
  },
  async apagar(id) {
    const { error } = await sb.from('contas').delete().eq('id', id);
    ops(error);
    S.tx = S.tx.filter(t => t.id !== id);
  }
};

// ---------------------------------------------------------------------------
//  FIXOS
// ---------------------------------------------------------------------------
export const fixosApi = {
  async inserir(o) {
    const uid = await usuarioId();
    const { data, error } = await sb.from('fixos').insert(praBancoFixo(o, uid)).select().single();
    ops(error); const novo = doBancoFixo(data); S.fixos.push(novo); return novo;
  },
  async inserirVarias(lista) {
    const uid = await usuarioId();
    const { data, error } = await sb.from('fixos')
      .insert(lista.map((o,i) => ({ ...praBancoFixo(o, uid), ordem: i }))).select();
    ops(error); const novos = data.map(doBancoFixo); S.fixos.push(...novos); return novos;
  },
  async atualizar(id, o) {
    const uid = await usuarioId();
    const { data, error } = await sb.from('fixos').update(praBancoFixo(o, uid)).eq('id', id).select().single();
    ops(error); Object.assign(S.fixos.find(f => f.id === id), doBancoFixo(data));
  },
  async ativar(id, ativo) {
    const { error } = await sb.from('fixos').update({ ativo }).eq('id', id);
    ops(error); S.fixos.find(f => f.id === id).ativo = ativo;
  },
  async apagar(id) {
    const { error } = await sb.from('fixos').delete().eq('id', id);
    ops(error); S.fixos = S.fixos.filter(f => f.id !== id);
  }
};

// ---------------------------------------------------------------------------
//  DIA A DIA  (tabela despesas)
// ---------------------------------------------------------------------------
export const despesasApi = {
  async inserir(o) {
    const uid = await usuarioId();
    const { data, error } = await sb.from('despesas').insert(praBancoDespesa(o, uid)).select().single();
    ops(error); const novo = doBancoDespesa(data); S.diario.push(novo); return novo;
  },
  async atualizar(id, o) {
    const uid = await usuarioId();
    const { data, error } = await sb.from('despesas').update(praBancoDespesa(o, uid)).eq('id', id).select().single();
    ops(error); Object.assign(S.diario.find(d => d.id === id), doBancoDespesa(data));
  },
  async apagar(id) {
    const { error } = await sb.from('despesas').delete().eq('id', id);
    ops(error); S.diario = S.diario.filter(d => d.id !== id);
  }
};

// ---------------------------------------------------------------------------
//  VIAGEM
// ---------------------------------------------------------------------------
export function statusPelasDatas(inicio, fim) {
  const hoje = new Date().toISOString().slice(0, 10);
  if (hoje > String(fim).slice(0,10)) return 'concluida';
  if (hoje >= String(inicio).slice(0,10)) return 'em_viagem';
  return 'planejamento';
}

const praBancoViagem = (v, uid) => ({
  user_id: uid, nome: v.nome, destino: v.destino || v.nome, moeda: v.moeda || 'EUR',
  cambio: v.cambio || 1, orcamento: v.orcamento || null,
  status: v.status || statusPelasDatas(v.inicio, v.fim),
  inicio: v.inicio, fim: v.fim
});

export const viagemApi = {
  async criar(v) {
    const uid = await usuarioId();
    const { data, error } = await sb.from('viagens')
      .insert(praBancoViagem(v, uid))
      .select().single();
    ops(error);
    const nova = { ...data, cambio:Number(data.cambio)||1, orcamento:Number(data.orcamento)||0, hosp: [], gastos: [] }; S.viagens.push(nova); return nova;
  },
  async editar(id, v) {
    const uid = await usuarioId();
    const { data, error } = await sb.from('viagens').update(praBancoViagem(v, uid)).eq('id', id).select().single();
    ops(error);
    const atual = S.viagens.find(x => x.id === id);
    Object.assign(atual, data, { cambio:Number(data.cambio)||1, orcamento:Number(data.orcamento)||0 });
    return atual;
  },
  async apagar(id) {
    const { error } = await sb.from('viagens').delete().eq('id', id);
    ops(error); S.viagens = S.viagens.filter(v => v.id !== id);
  },
  async addHosp(viagemId, h) {
    const uid = await usuarioId();
    const { data, error } = await sb.from('viagem_hospedagem').insert({
      user_id: uid, viagem_id: viagemId, nome: h.nome, cidade: h.cidade || '',
      entrada: h.data, noites: h.noites || 1, valor: h.valor || 0
    }).select().single();
    ops(error);
    const v = S.viagens.find(x => x.id === viagemId); v.hosp.push(doBancoHosp(data)); return data;
  },
  async addHospVarias(viagemId, lista) {
    const uid = await usuarioId();
    const { data, error } = await sb.from('viagem_hospedagem').insert(lista.map(h => ({
      user_id: uid, viagem_id: viagemId, nome: h.nome, cidade: h.cidade || '',
      entrada: h.data, noites: h.noites || 1, valor: h.valor || 0
    }))).select();
    ops(error);
    const v = S.viagens.find(x => x.id === viagemId); v.hosp.push(...data.map(doBancoHosp)); return data;
  },
  async editHosp(id, h) {
    const { data, error } = await sb.from('viagem_hospedagem').update({
      nome: h.nome, cidade: h.cidade, entrada: h.data, noites: h.noites, valor: h.valor
    }).eq('id', id).select().single();
    ops(error);
    for (const v of S.viagens) { const i = v.hosp.findIndex(x => x.id === id); if (i > -1) v.hosp[i] = doBancoHosp(data); }
  },
  async delHosp(id) {
    const { error } = await sb.from('viagem_hospedagem').delete().eq('id', id);
    ops(error); S.viagens.forEach(v => v.hosp = v.hosp.filter(x => x.id !== id));
  },
  async addGasto(viagemId, g) {
    const uid = await usuarioId();
    const { data, error } = await sb.from('viagem_gastos').insert({
      user_id: uid, viagem_id: viagemId, data: g.data, descricao: g.desc,
      categoria: g.cat, forma_pagamento: g.pg, valor: g.valor || 0
    }).select().single();
    ops(error);
    const v = S.viagens.find(x => x.id === viagemId); v.gastos.push(doBancoGasto(data)); return data;
  },
  async addGastosVarios(viagemId, lista) {
    const uid = await usuarioId();
    const linhas = lista.map(g => ({
      user_id: uid, viagem_id: viagemId, data: g.data, descricao: g.desc,
      categoria: g.cat, forma_pagamento: g.pg, valor: g.valor || 0
    }));
    const criados = [];
    for (let i = 0; i < linhas.length; i += 500) {
      const { data, error } = await sb.from('viagem_gastos').insert(linhas.slice(i, i+500)).select();
      ops(error); criados.push(...data.map(doBancoGasto));
    }
    const v = S.viagens.find(x => x.id === viagemId); v.gastos.push(...criados); return criados;
  },
  async editGasto(id, g) {
    const { data, error } = await sb.from('viagem_gastos').update({
      data: g.data, descricao: g.desc, categoria: g.cat, forma_pagamento: g.pg, valor: g.valor
    }).eq('id', id).select().single();
    ops(error);
    for (const v of S.viagens) { const i = v.gastos.findIndex(x => x.id === id); if (i > -1) v.gastos[i] = doBancoGasto(data); }
  },
  async delGasto(id) {
    const { error } = await sb.from('viagem_gastos').delete().eq('id', id);
    ops(error); S.viagens.forEach(v => v.gastos = v.gastos.filter(x => x.id !== id));
  }
};

// ---------------------------------------------------------------------------
//  Apagar tudo do usuário (usado antes de reimportar a base)
// ---------------------------------------------------------------------------
export async function apagarTudo() {
  const uid = await usuarioId();
  for (const t of ['viagem_gastos','viagem_hospedagem','viagens','contas','fixos','despesas']) {
    const { error } = await sb.from(t).delete().eq('user_id', uid);
    ops(error);
  }
  S.tx = []; S.fixos = []; S.diario = []; S.viagens = [];
}
