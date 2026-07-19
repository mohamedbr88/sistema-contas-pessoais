-- ============================================================================
--  004_moeda_por_item.sql
--
--  Última peça de banco para as 4 moedas em todo lugar.
--
--  Já tinham coluna `moeda`: contas, despesas, viagens (schema.sql) e
--  fixos (003). Faltavam os itens da viagem.
--
--  NULL = "a moeda da viagem". É de propósito: a estadia em Madrid é em euro
--  porque a viagem é em euro, e não faz sentido repetir isso em 231 linhas.
--  Mas se você pagar um táxi em dólar no meio da viagem à Espanha, agora dá.
--
--  Onde rodar: Supabase → SQL Editor → New query → Run.
--  Rode depois de schema.sql, 002 e 003. Pode rodar mais de uma vez.
--
--  NÃO apaga nada. NÃO insere nada. NÃO altera valor algum.
-- ============================================================================

alter table public.viagem_gastos      add column if not exists moeda text;
alter table public.viagem_hospedagem  add column if not exists moeda text;

comment on column public.viagem_gastos.moeda is
  'Moeda deste gasto. NULL = usa a moeda da viagem (o caso normal).';
comment on column public.viagem_hospedagem.moeda is
  'Moeda desta estadia. NULL = usa a moeda da viagem (o caso normal).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vg_moeda_ok') then
    alter table public.viagem_gastos add constraint vg_moeda_ok
      check (moeda is null or moeda in ('BRL','USD','EUR','PYG'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vh_moeda_ok') then
    alter table public.viagem_hospedagem add constraint vh_moeda_ok
      check (moeda is null or moeda in ('BRL','USD','EUR','PYG'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
--  Conferência
-- ----------------------------------------------------------------------------

select 'contas'            as tabela, count(*) total, count(moeda) com_moeda from public.contas
union all select 'despesas',          count(*), count(moeda) from public.despesas
union all select 'fixos',             count(*), count(moeda) from public.fixos
union all select 'viagem_gastos',     count(*), count(moeda) from public.viagem_gastos
union all select 'viagem_hospedagem', count(*), count(moeda) from public.viagem_hospedagem;

-- ============================================================================
--  ESPERADO: viagem_gastos e viagem_hospedagem com com_moeda = 0.
--  Isso está CERTO: NULL quer dizer "herda o euro da viagem da Espanha".
-- ============================================================================
