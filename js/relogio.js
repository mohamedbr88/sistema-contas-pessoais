// ============================================================================
//  Relógio do cabeçalho.
//
//  Usa o fuso e o idioma do próprio aparelho — se você abrir o app em Madrid,
//  a hora é a de Madrid, sem configurar nada e sem cidade chumbada. Não chama
//  API nenhuma: a hora é a do seu aparelho, então funciona sem internet. Pela
//  mesma razão, se o relógio do aparelho estiver errado, o daqui também estará.
//
//  UM intervalo, e só um. iniciar() é chamado uma vez no boot (app.js), nunca
//  dentro do render() — senão cada redesenho da tela criaria mais um timer.
// ============================================================================

let timer = null;         // o único setInterval do app
let ultimo = '';          // para só mexer no DOM quando o texto muda

// IDIOMA e FUSO são coisas diferentes, e o pedido misturava as duas.
//
//   fuso   → do aparelho, sempre. É isto que faz a hora mudar sozinha quando
//            você está em Madrid. É o que você realmente quer.
//   idioma → do app, que é em português. Se eu obedecesse navigator.language
//            cegamente, um celular configurado em inglês mostraria
//            "Saturday, July 18" no meio de uma tela toda em português.
//
// Então: aceito o navigator.language quando ele for português (pt-BR, pt-PT),
// e caio em pt-BR em qualquer outro caso.
const idioma = () => {
  const n = navigator.language || '';
  return /^pt\b|^pt-/i.test(n) ? n : 'pt-BR';
};
export const fuso = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; }
  catch (e) { return ''; }
};

/** 'Sábado, 18 de julho de 2026' */
function textoData(d) {
  try {
    const s = new Intl.DateTimeFormat(idioma(), {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);   // pt-BR devolve 'sábado, ...'
  } catch (e) {
    return d.toLocaleDateString();
  }
}

/** '17:35' */
function textoHora(d) {
  try {
    // hourCycle h23: 17:35, nunca 5:35 PM — independente do que o aparelho prefira
    return new Intl.DateTimeFormat(idioma(), {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(d);
  } catch (e) {
    return d.toLocaleTimeString();
  }
}

function pintar() {
  const agora = new Date();
  const data = textoData(agora), hora = textoHora(agora);
  const marca = data + '|' + hora;
  if (marca === ultimo) return;                      // nada mudou: não toca no DOM
  ultimo = marca;

  const elD = document.getElementById('relogioData');
  const elH = document.getElementById('relogioHora');
  const elZ = document.getElementById('relogioTz');
  if (elD) elD.textContent = data;
  if (elH) elH.textContent = hora;
  if (elZ) elZ.textContent = fuso();
}

/**
 * Liga o relógio. Pode ser chamada quantas vezes for: o intervalo antigo é
 * derrubado antes de criar o novo, então nunca sobra mais de um rodando.
 */
export function iniciarRelogio() {
  parar();
  pintar();                       // pinta na hora, sem esperar 1 segundo
  timer = setInterval(pintar, 1000);
  // ao voltar de segundo plano no celular, o timer pode ter atrasado: repinta
  document.addEventListener('visibilitychange', aoVoltar);
  return timer;
}

function aoVoltar() { if (!document.hidden) pintar(); }

export function parar() {
  if (timer) { clearInterval(timer); timer = null; }
  document.removeEventListener('visibilitychange', aoVoltar);
}

/** Quantos intervalos estão vivos: 0 ou 1, nunca mais. Usado no teste. */
export const relogioAtivo = () => (timer ? 1 : 0);
