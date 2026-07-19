# Contas

Controle de contas a pagar, gastos do dia a dia e viagens.
HTML + CSS + JavaScript puro (ES modules). Sem build, sem framework, sem `npm install`.
Banco de dados e login: **Supabase**. Hospedagem: **Vercel**.

---

## ORDEM DE INSTALAÇÃO

### Primeiro — criar o banco

1. Abra o **Supabase** → seu projeto → **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/schema.sql` deste projeto, copie **tudo**, cole no editor.
3. Clique em **Run**. Deve terminar com `Success`.
4. Confira em **Table Editor**: têm que aparecer **17 tabelas**, todas com o cadeado **"RLS enabled"**.

O arquivo pode ser rodado quantas vezes quiser — ele não duplica nada.

### Segundo — pegar as duas chaves

1. Supabase → **Settings** (engrenagem) → **API**.
2. Copie **Project URL** — parece `https://abcdefgh.supabase.co`
3. Copie **Publishable key** (a `anon`) — um texto longo começando em `eyJ...` ou `sb_publishable_...`

> **Nunca** use a **Service role key** / **secret key** aqui. Ela ignora o RLS e daria acesso total ao seu banco para qualquer pessoa que abrisse o site. O arquivo `js/config.js` tem uma trava que bloqueia o app se você colar a chave errada.

### Terceiro — colar as chaves no projeto

Abra **`js/config.js`** e troque as duas linhas:

```js
export const SUPABASE_URL      = 'https://COLE_AQUI.supabase.co';   // ← linha 16
export const SUPABASE_ANON_KEY = 'COLE_AQUI_A_ANON_KEY';            // ← linha 18
```

É o **único** arquivo que você precisa editar. A anon key é pública de propósito e pode ir para o GitHub — quem protege seus dados é o RLS do banco, não o segredo da chave.

### Quarto — mandar para o GitHub

Substitua o conteúdo do repositório por estes arquivos e mande:

```bash
git add -A
git commit -m "Sistema com Supabase: banco, login e RLS"
git push
```

O Vercel publica sozinho em ~30 segundos. Como é site estático, não há build para configurar.

Depois que subir, volte ao Supabase → **Authentication** → **URL Configuration** e ponha a URL do Vercel em **Site URL** e em **Redirect URLs** (ex.: `https://seu-projeto.vercel.app`). Sem isso, o link de "esqueci a senha" não volta para o site certo.

### Quinto — criar sua conta e trazer seus dados

1. Abra o site. Vai aparecer a tela de entrada.
2. Clique em **"Não tenho conta"**, preencha nome, e-mail e senha, e crie.
3. Se pedir confirmação por e-mail, confirme e volte.
   *(Se você é o único usuário e quer pular isso: Supabase → Authentication → Providers → Email → desligue "Confirm email".)*
4. Já dentro do app, vá na aba **Dados** → botão **"Importar base inicial"**.
5. Espere. Ele grava **193 contas** (mai–dez/2026), **24 contas fixas** e a **viagem da Espanha** (10 estadias, 221 gastos) na sua conta.

Pronto. Clique nesse botão **uma vez só** — apertar de novo duplica tudo.

---

## Estrutura

```
index.html              a única página
css/estilo.css          todo o visual (o mesmo de antes — nada mudou de desenho)
assets/                 ícone e manifest (dá para instalar como app no celular)
supabase/schema.sql              o banco: tabelas, índices, RLS, triggers, storage
supabase/002_multiviagem.sql     colunas de múltiplas viagens
supabase/003_fixos_vinculo.sql   vínculo fixo→conta, período das fixas, data de pagamento
js/
  config.js             ⬅️ AS SUAS CHAVES VÃO AQUI
  supabase.js           o cliente, e a tradução dos erros para português
  auth.js               entrar, criar conta, esqueci a senha
  api.js                a ÚNICA porta de entrada do banco (CRUD + tradutores)
  estado.js             S (seus dados) e V (o que está na tela) + constantes
  calculos.js           TODOS os totais. Se um número está errado, é aqui.
  relogio.js            o relógio do topo (um setInterval, ligado no boot)
  moeda.js              conversão e formatação de R$ / US$ / € / ₲
  ui.js                 aviso, formulário genérico, download
  seed.js               a base inicial (apague depois de importar, se quiser)
  importar.js           leitor de OFX/CSV do banco
  fita.js               a fita de vencimentos
  app.js                junta tudo: render, eventos, início
  telas/
    mes.js  painel.js  ano.js  diario.js  viagem.js  fixos.js  dados.js
    form_conta.js
```

## Como os dados fluem

```
tela  →  api.js  →  Supabase  →  api.js atualiza S  →  render()
```

`api.js` é o único arquivo que fala com o banco. As telas continuam lendo
`S.tx`, `S.fixos`, `S.diario`, `S.viagens` do jeito que sempre leram — por isso
nenhuma tela precisou mudar de desenho na migração.

## Segurança

- **RLS em todas as 17 tabelas**, com `force row level security` (vale até para o dono da tabela).
- Regra única: `auth.uid() = user_id`. Quatro políticas por tabela (select/insert/update/delete).
- Testado com dois usuários: o segundo não conseguiu ler, alterar, apagar nem **inserir no nome do outro**.
- A view `v_resumo_mensal` usa `security_invoker` — sem isso, uma view vaza dados por cima do RLS.
- Anexos no Storage: bucket privado, cada usuário só enxerga a pasta com o próprio id.
- `js/config.js` bloqueia o app se detectar uma service role key.

## O que ficou de fora, honestamente

- **Receitas, transferências, parcelamentos, metas, cartões e contas bancárias**
  existem no banco (tabelas, RLS, índices), mas **ainda não têm tela**. Foram
  pedidos no schema; a interface deles é o próximo passo.
- **Anexos**: tabela e bucket prontos, sem botão de upload ainda.
- O app não sincroniza em tempo real entre dois aparelhos abertos ao mesmo tempo.
  Recarregar a página traz o que o outro gravou. (Supabase Realtime resolveria.)

## Antes de todo deploy: `node verificar.mjs`

```bash
node verificar.mjs
```

Leva 1 segundo, não instala nada. Ele confere se cada nome importado existe
mesmo no módulo de origem — que é o que o `node --check` **não** confere e o que
deixa a tela branca com *"does not provide an export named X"*.

Se sair `✓ todos os imports resolvem`, pode subir.

## Rodar na sua máquina

Não abra o `index.html` clicando duas vezes — ES modules exigem servidor.

```bash
npx serve .
# ou
python3 -m http.server 8080
```

## Se der errado

| Sintoma | Causa provável |
|---|---|
| Tela branca | Abra o console (F12). Quase sempre é `js/config.js` sem as chaves. |
| "Falha ao buscar" / "Failed to fetch" | URL errada em `config.js`, ou o projeto Supabase está pausado. |
| Entra mas não aparece nada | Normal no primeiro login. Vá em **Dados → Importar base inicial**. |
| "violates row-level security" | O `schema.sql` não rodou inteiro. Rode de novo. |
| Link de senha cai no lugar errado | Falta pôr a URL do Vercel em Authentication → URL Configuration. |
| Duplicou tudo | Você clicou em "Importar base inicial" duas vezes. Use **Apagar tudo** e importe uma vez. |
