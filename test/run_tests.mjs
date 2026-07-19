import assert from 'assert';
import { S, V, hojeISO } from '../js/estado.js';
import * as prop from '../js/propagacao.js';
import * as api from '../js/api.js';
import * as calc from '../js/calculos.js';
import { MOEDAS, emBRL, conv } from '../js/moeda.js';

// Stub contasApi and fixosApi to operate on S directly (no network)
api.contasApi.inserir = async function(o) {
  const id = Math.floor(Math.random()*1e6);
  const t = { id, data: o.data, conta: o.conta, cat: o.cat, loc: o.loc, pg: o.pg, est: o.est || 0, pago: o.pago || 0, st: o.st, obs: o.obs||'', moeda: o.moeda||'BRL', fixoId: o.fixoId||null };
  S.tx.push(t); return t;
};
api.contasApi.inserirVarias = async function(lista){ const out=[]; for(const o of lista) out.push(await api.contasApi.inserir(o)); return out; };
api.contasApi.atualizar = async function(id,o){ const t=S.tx.find(x=>x.id===id); if(!t) throw new Error('notfound'); Object.assign(t, { data:o.data, conta:o.conta, cat:o.cat, loc:o.loc, pg:o.pg, est:o.est||0, pago:o.pago||0, st:o.st, obs:o.obs||'', moeda:o.moeda||'BRL' }); return t; };
api.contasApi.apagar = async function(id){ S.tx = S.tx.filter(t=>t.id!==id); };

api.fixosApi.inserir = async function(o){ const id = Math.floor(Math.random()*1e6); const f = { id, conta:o.conta, dia:o.dia||1, cat:o.cat, loc:o.loc, pg:o.pg, est:o.est||0, ativo:o.ativo!==false, moeda:o.moeda||'BRL', inicio:o.inicio||'', fim:o.fim||'' }; S.fixos.push(f); return f; };
api.fixosApi.atualizar = async function(id,o){ const f=S.fixos.find(x=>x.id===id); if(!f) throw new Error('notfound'); Object.assign(f, { conta:o.conta, dia:o.dia, cat:o.cat, loc:o.loc, pg:o.pg, est:o.est||0, ativo:o.ativo!==false, moeda:o.moeda||'BRL', inicio:o.inicio||'', fim:o.fim||'' }); return f; };
api.fixosApi.apagar = async function(id){ S.fixos = S.fixos.filter(f=>f.id!==id); };

// Prepare scenario
S.fixos.length = 0; S.tx.length = 0;
const fixo = { id: 111, conta: 'Internet', dia: 10, cat:'Internet', loc:'Apartamento', pg:'Boleto', est:100, ativo:true, moeda:'BRL', inicio:'2026-01-01', fim:'' };
S.fixos.push({ ...fixo });
// Create two monthly entries: one paid (should be preserved), one pending (should update)
S.tx.push({ id: 201, data: '2026-07-10', conta: 'Internet', cat:'Internet', loc:'Apartamento', pg:'Boleto', est:100, pago:100, st:'Pago', moeda:'BRL', fixoId:111 });
S.tx.push({ id: 202, data: '2026-08-10', conta: 'Internet', cat:'Internet', loc:'Apartamento', pg:'Boleto', est:100, pago:0, st:'Pendente', moeda:'BRL', fixoId:111 });

// Sanity checks
assert.strictEqual(S.tx.length, 2);

// Edit the fixa: change est and moeda
const novoFixo = { ...fixo, est: 150, moeda: 'USD' };
// Run planejar
const plano = prop.planejar(novoFixo);
console.log('Plano:', JSON.stringify({ criar: plano.criar.length, atualizar: plano.atualizar.length, remover: plano.remover.length, preservadas: plano.preservadas.length }));
// Expect: atualizar includes the pending (2026-08) and preservadas includes the paid (2026-07)
assert(plano.atualizar.some(t=>t.id===202), 'pending should be in atualizar');
assert(plano.preservadas.some(t=>t.id===201), 'paid should be preserved');

// Execute propagar (uses our stubbed contasApi)
await prop.propagar({ ...novoFixo, id:111 });
// After propagation, pending entry should have est updated to 150 and moeda USD
const pend = S.tx.find(t=>t.id===202);
assert(pend.est===150, 'pending est updated');
assert(pend.moeda==='USD', 'pending moeda updated');

// Totals via resumoMes for August should reflect est 150 converted to BRL
const resumo = calc.resumoMes(2026,8);
console.log('Resumo agosto:', resumo);
// somaEstimado returns BRL denominated; compute expected
const expectedBRL = conv(150, 'USD', 'BRL');
assert(Math.abs(resumo.estimado - expectedBRL) < 1e-6, 'estimado matches conversion');

// Ensure no duplicates created
const duplicados = S.tx.filter(t=>t.fixoId===111 && t.data.slice(0,7)==='2026-08');
assert(duplicados.length===1, 'no duplicates for Aug');

// Test currencies presence and conversion functions
assert(Object.keys(MOEDAS).includes('USD'));
assert(Object.keys(MOEDAS).includes('EUR'));
assert(Object.keys(MOEDAS).includes('BRL'));
assert(Object.keys(MOEDAS).includes('PYG'));
// Test conversion rounds
const c1 = conv(100,'USD','BRL');
const c2 = conv(100,'BRL','PYG');
console.log('Conversions:', c1, c2);

console.log('\nALL TESTS PASSED');
process.exit(0);
