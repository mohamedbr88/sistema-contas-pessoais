-- ============================================================================
--  003_fixos_vinculo.sql
--
--  Cria o que NÃO EXISTE no projeto e sem o qual editar uma conta fixa não tem
--  como alcançar as contas mensais dela.
--
--  Hoje o vínculo é feito comparando o TEXTO do nome, em minúsculas
--  (js/telas/fixos.js, linha 13). Isso quebra ao renomear e confunde duas
--  contas homônimas ("Luz" da chácara e do apartamento). Aqui ele vira uma
--  chave estrangeira de verdade.
--
--  Onde rodar: Supabase → SQL Editor → New query → cole tudo → Run.
--  Rode DEPOIS de schema.sql e 002_multiviagem.sql.
--  Pode rodar mais de uma vez: só toca linhas onde o campo ainda está NULL.
--
--  NÃO apaga nada. NÃO insere nada. NÃO altera valor, data ou status.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. O VÍNCULO QUE FALTAVA
--
--  on delete set null: apagar a conta fixa NÃO apaga o histórico já lançado.
--  As contas de maio continuam lá, apenas soltas — que é o certo. O histórico
--  financeiro não pode sumir porque você tirou uma recorrência do cadastro.
-- ----------------------------------------------------------------------------

alter table public.contas
  add column if not exists fixo_id uuid references public.fixos(id) on delete set null;

create index if not exists idx_contas_fixo on public.contas(user_id, fixo_id);

comment on column public.contas.fixo_id is
  'De qual conta fixa esta linha foi gerada. NULL = lançamento avulso, criado à mão ou importado do banco.';


-- ----------------------------------------------------------------------------
--  2. QUANDO A FIXA VALE  —  o que permite "começar só em agosto"
--
--  inicio NULL = vale desde sempre.  fim NULL = sem prazo para acabar.
--  Nenhuma das duas existe hoje, e é por isso que hoje é impossível dizer
--  "esta conta começa em agosto".
-- ----------------------------------------------------------------------------

alter table public.fixos add column if not exists inicio date;
alter table public.fixos add column if not exists fim    date;
alter table public.fixos add column if not exists moeda  text;
alter table public.fixos add column if not exists obs    text;

comment on column public.fixos.inicio is 'Primeiro mês em que deve ser lançada. NULL = desde sempre.';
comment on column public.fixos.fim    is 'Último mês em que deve ser lançada. NULL = sem fim.';

update public.fixos set moeda = 'BRL' where moeda is null;   -- era o que o app assumia
update public.fixos set obs   = ''    where obs   is null;

alter table public.fixos alter column moeda set default 'BRL';
alter table public.fixos alter column moeda set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fixos_moeda_ok') then
    alter table public.fixos add constraint fixos_moeda_ok
      check (moeda in ('BRL','USD','EUR','PYG'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fixos_periodo_ok') then
    alter table public.fixos add constraint fixos_periodo_ok
      check (fim is null or inicio is null or fim >= inicio);
  end if;
end $$;


-- ----------------------------------------------------------------------------
--  3. DATA DO PAGAMENTO
--
--  Fica NULL de propósito, inclusive nas contas já pagas. Eu NÃO invento a data
--  em que você pagou — chutar 'vencimento' viraria dado falso que ninguém mais
--  saberia distinguir do verdadeiro. Daqui para frente o app grava a data real
--  no momento em que você marca como paga.
-- ----------------------------------------------------------------------------

alter table public.contas add column if not exists data_pagamento date;

comment on column public.contas.data_pagamento is
  'Quando foi efetivamente paga. NULL nas contas anteriores a esta migração: a data não era registrada e não seria honesto inventá-la.';


-- ----------------------------------------------------------------------------
--  4. BACKFILL DO VÍNCULO
--
--  Casa pelo nome, porque é a ÚNICA pista que existe — é assim que o app vem
--  se virando. Casa só dentro do mesmo usuário e só onde o nome é idêntico
--  ignorando maiúsculas e espaços nas pontas.
--
--  Se duas fixas do mesmo usuário tiverem nome igual, nenhuma das duas é
--  vinculada (o `having count = 1`): melhor ficar sem vínculo do que apontar
--  para a errada.
-- ----------------------------------------------------------------------------

with unicos as (
  -- (array_agg(id))[1] e não min(id): o PostgreSQL não tem min() para uuid.
  -- Como o having garante count = 1, o array tem exatamente um elemento.
  select user_id, lower(btrim(descricao)) as chave, (array_agg(id))[1] as fixo_id
    from public.fixos
   group by user_id, lower(btrim(descricao))
  having count(*) = 1
)
update public.contas c
   set fixo_id = u.fixo_id
  from unicos u
 where u.user_id = c.user_id
   and u.chave   = lower(btrim(c.descricao))
   and c.fixo_id is null;


-- ----------------------------------------------------------------------------
--  5. RELATÓRIO — leia antes de seguir
-- ----------------------------------------------------------------------------

select 'contas vinculadas a uma fixa'  as situacao, count(*) as qtd from public.contas where fixo_id is not null
union all
select 'contas avulsas (sem fixa)',                 count(*)        from public.contas where fixo_id is null
union all
select 'fixas com nome repetido (não vinculadas)',  count(*) from (
  select 1 from public.fixos group by user_id, lower(btrim(descricao)) having count(*) > 1) x;

-- as que não casaram: confira se alguma deveria ter casado
select distinct c.descricao as conta_sem_vinculo, count(*) as lancamentos
  from public.contas c
 where c.fixo_id is null
 group by c.descricao
 order by 2 desc;

-- ============================================================================
--  ESPERADO com a base de fábrica:
--    · 193 contas, todas geradas a partir das 24 fixas com nome idêntico
--    · "contas vinculadas" deve dar 193 e "avulsas" 0
--    · se aparecer alguma avulsa, é conta que você criou à mão ou importou do
--      banco — e aí ficar sem vínculo está CORRETO.
-- ============================================================================
