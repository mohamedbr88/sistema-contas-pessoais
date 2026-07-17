// ============================================================================
//  Tela "Dados": conta do usuário, câmbios, backup, importação e base inicial.
// ============================================================================
import { S, V, VERSAO, MESES } from '../estado.js';
import { MOEDAS } from '../moeda.js';

export function telaDados(){
  const anos=[...new Set(S.tx.map(t=>t.data.slice(0,4)))].sort();
  const e=S.perfil?.email||'—';
  return `<div class="card"><div class="card-hd"><h3>Sua conta</h3></div>
    <div style="padding:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <b style="font-size:14px">${S.perfil?.nome||'Você'}</b>
        <div class="mono" style="font-size:12px;color:var(--ink-2)">${e}</div>
      </div>
      <button class="btn-2" id="trocarSenha">Trocar a senha</button>
      <button class="btn-2" id="sair">Sair</button>
    </div>
    <div style="padding:0 14px 14px;font-size:12px;color:var(--ink-2)">
      Seus dados ficam no Supabase, só na sua conta. O banco recusa qualquer leitura de outro usuário.
    </div></div>

    <div class="card"><div class="card-hd"><h3>Câmbio</h3></div>
    <div style="padding:14px">
      <div class="par" style="max-width:480px">
        <div class="campo"><label>1 US$ vale quanto em R$</label>
          <input type="number" step="0.01" id="usd" value="${S.usd}"></div>
        <div class="campo"><label>1 € vale quanto em R$</label>
          <input type="number" step="0.01" id="cambio" value="${S.cambio}"></div>
      </div>
      <div class="campo" style="max-width:235px;margin-top:10px"><label>1 R$ vale quanto em ₲</label>
        <input type="number" step="0.01" id="pyg" value="${S.pyg}"></div>
      <p style="font-size:12.5px;color:var(--ink-2);margin-top:10px">
        O botão <b style="color:var(--ink)">R$ · US$ · € · ₲</b> lá em cima converte o app inteiro.<br>
        Pelas taxas de agora: <b style="color:var(--ink)">1 € = R$ ${(S.cambio||0).toFixed(2)} = US$ ${((S.cambio||0)/(S.usd||1)).toFixed(2)} = ₲ ${((S.cambio||0)*(S.pyg||0)).toLocaleString('pt-BR',{maximumFractionDigits:0})}</b>
      </p>
      <p style="font-size:11.5px;color:var(--ink-2);margin-top:7px">
        O <b style="color:var(--ink)">euro</b> é o R$ 5,35 que você já usava. O <b style="color:var(--ink)">guarani</b>
        saiu da sua planilha da viagem (₲ 7.414 por €). O <b style="color:var(--ink)">dólar</b> veio do Xe (R$ 5,0763).
        Cotação muda todo dia — confira antes de usar para algo sério.
      </p>
    </div></div>

    <div class="card"><div class="card-hd"><h3>Importar fatura ou extrato</h3></div>
    <div style="padding:14px">
      <button class="btn btn-cofre" id="impExt">Escolher arquivo do banco</button>
      <input type="file" id="impExtFile" accept=".ofx,.qfx,.csv,.txt" hidden>
      <p style="font-size:12.5px;color:var(--ink-2);margin-top:9px">
        Baixe o <b style="color:var(--ink)">OFX</b> ou <b style="color:var(--ink)">CSV</b> da fatura no app do banco e solte aqui.
        Eu leio, adivinho a categoria e mostro tudo para você conferir. Nada entra sem você aprovar.
      </p>
    </div></div>

    <div class="card"><div class="card-hd"><h3>Backup</h3></div>
    <div style="padding:14px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn-2" id="expJson">Baixar backup (.json)</button>
      <button class="btn-2" id="expCsv">Baixar planilha (.csv)</button>
      <button class="btn-2" id="zerar" style="color:var(--carimbo)">Apagar tudo</button>
    </div>
    <div style="padding:0 14px 14px;font-size:12.5px;color:var(--ink-2)">
      O Supabase já guarda tudo — o backup é a sua garantia extra, caso queira levar embora.
<br>      Versão <b style="color:var(--ink)">${VERSAO}</b> · <b style="color:var(--ink)">${S.tx.length}</b> contas ·
      <b style="color:var(--ink)">${S.diario.length}</b> gastos do dia a dia ·
      <b style="color:var(--ink)">${S.fixos.length}</b> fixas · ${anos.join(', ')||'nada ainda'}
    </div></div>`;
}
