// ============================================================================
//  verificar.mjs — roda ANTES de subir para o GitHub.
//
//      node verificar.mjs
//
//  Confere o que o `node --check` NÃO confere: se cada nome importado existe
//  mesmo no módulo de origem. É exatamente a classe de erro que deixa a tela
//  branca com "does not provide an export named X" — e leva 1 segundo para
//  pegar aqui, contra um deploy quebrado para descobrir lá.
//
//  Não precisa instalar nada. Sai com código 1 se achar problema.
// ============================================================================
import fs from 'fs';
import path from 'path';

const RAIZ = 'js';
const mods = {};

(function varrer(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) varrer(p);
    else if (f.name.endsWith('.js')) mods[p] = fs.readFileSync(p, 'utf8');
  }
})(RAIZ);

/** Tudo que um módulo exporta. */
function exportados(src) {
  const e = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) e.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)) e.add(m[1]);
  // export const A = 1, B = 2;
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([^;=]*?=[^;]*?);/g))
    for (const n of m[1].matchAll(/(\w+)\s*=/g)) e.add(n[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g))
    for (const x of m[1].split(',')) {
      const n = x.trim().split(/\s+as\s+/).pop().trim();
      if (n) e.add(n);
    }
  if (/export\s+default/.test(src)) e.add('default');
  return e;
}

const EXP = Object.fromEntries(Object.entries(mods).map(([p, s]) => [p, exportados(s)]));
const problemas = [];

for (const [p, s] of Object.entries(mods)) {
  for (const m of s.matchAll(/import\s*(?:\{([^}]*)\}|(\w+))\s*from\s*['"]([^'"]+)['"]/g)) {
    const alvo = m[3];
    if (alvo.startsWith('http')) continue;                    // CDN, não dá para checar aqui
    const cam = path.normalize(path.join(path.dirname(p), alvo));

    if (!mods[cam]) {
      problemas.push(`${p}\n    importa de '${alvo}' — esse arquivo não existe (procurei em ${cam})`);
      continue;
    }
    const nomes = m[1] ? m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
                       : ['default'];
    for (const n of nomes) {
      if (!EXP[cam].has(n)) {
        const onde = Object.entries(EXP).filter(([, e]) => e.has(n)).map(([f]) => f);
        problemas.push(
          `${p}\n    importa '${n}' de '${alvo}', mas ${cam} não exporta isso.` +
          (onde.length ? `\n    → quem exporta '${n}' é: ${onde.join(', ')}` : `\n    → ninguém exporta '${n}' neste projeto.`)
        );
      }
    }
  }
}

console.log(`${Object.keys(mods).length} módulos verificados.`);
if (problemas.length) {
  console.log(`\n✗ ${problemas.length} problema(s) — a tela ficaria branca:\n`);
  problemas.forEach(p => console.log('  ' + p + '\n'));
  process.exit(1);
}
console.log('✓ todos os imports resolvem.');
