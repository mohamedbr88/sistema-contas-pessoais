-- ============================================================================
--  002_multiviagem.sql  —  ETAPA 1
--
--  Prepara a tabela `viagens` para várias viagens, cada uma com a sua moeda e
--  o seu câmbio travado.
--
--  Onde rodar: Supabase → SQL Editor → New query → cole tudo → Run.
--  Rode DEPOIS do schema.sql. Pode rodar mais de uma vez: as etapas de
--  preenchimento só tocam linhas onde o campo ainda está NULL.
--
--  O QUE ESTE ARQUIVO NÃO FAZ:
--    · não apaga nada          (nenhum delete, nenhum drop de coluna/tabela)
--    · não insere nada         (nenhuma viagem, estadia ou gasto novo)
--    · não toca em valor, data, noites, descrição, categoria ou pagamento
--    · não mexe em viagem_hospedagem nem em viagem_gastos
--    · não altera política de RLS (as colunas novas herdam a da tabela)
--
--  A viagem da Espanha continua com as 10 estadias e os 221 gastos intactos.
--  Ela só ganha 4 campos novos que hoje não existem.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. AS 4 COLUNAS NOVAS
--     Todas nascem NULL de propósito: é o NULL que marca "esta linha ainda não
--     foi preenchida", e é isso que deixa a migração ser rodada de novo sem
--     estragar nada e sem sobrescrever escolha sua.
-- ----------------------------------------------------------------------------

alter table public.viagens add column if not exists destino   text;
alter table public.viagens add column if not exists cambio    numeric(12,4);
alter table public.viagens add column if not exists orcamento numeric(14,2);
alter table public.viagens add column if not exists status    text;

comment on column public.viagens.destino   is 'País ou cidade. Ex.: Espanha';
comment on column public.viagens.cambio    is 'Quanto vale 1 unidade de viagens.moeda em BRL, TRAVADO nesta viagem. Espanha 2026 = 5.35 para sempre, mesmo que o euro mude.';
comment on column public.viagens.orcamento is 'Opcional. Na moeda da viagem.';
comment on column public.viagens.status    is 'planejamento | em_viagem | concluida';


-- ----------------------------------------------------------------------------
--  2. DESTINO — herda o nome, que é o que você tem hoje
-- ----------------------------------------------------------------------------

update public.viagens
   set destino = nome
 where destino is null;


-- ----------------------------------------------------------------------------
--  3. CÂMBIO — trava, em cada viagem, a cotação que o app usava ATÉ AGORA
--
--  Não é chute: vem do câmbio que está no SEU perfil (perfis.cambio_eur = 5.35,
--  o mesmo da sua planilha). A partir daqui esse número é da viagem, e mudar o
--  câmbio global na aba Dados não mexe mais nela.
-- ----------------------------------------------------------------------------

update public.viagens v
   set cambio = case v.moeda
                  when 'BRL' then 1
                  when 'EUR' then p.cambio_eur
                  when 'USD' then p.cambio_usd
                  when 'PYG' then 1 / nullif(p.cambio_pyg, 0)
                end
  from public.perfis p
 where p.id = v.user_id
   and v.cambio is null;

-- rede de segurança: se algum perfil estiver sem câmbio, não deixa NULL passar
update public.viagens
   set cambio = 1
 where cambio is null;


-- ----------------------------------------------------------------------------
--  4. STATUS — calculado pelas datas que a viagem já tem
--     Espanha: 11/05/2026 a 09/06/2026, já passou → concluida
-- ----------------------------------------------------------------------------

update public.viagens
   set status = case
                  when current_date >  fim    then 'concluida'
                  when current_date >= inicio then 'em_viagem'
                  else 'planejamento'
                end
 where status is null;


-- ----------------------------------------------------------------------------
--  5. AGORA SIM: default, obrigatoriedade e as regras
--     Só depois de todas as linhas estarem preenchidas — senão o NOT NULL
--     falharia na Espanha.
-- ----------------------------------------------------------------------------

alter table public.viagens alter column status set default 'planejamento';
alter table public.viagens alter column status set not null;
alter table public.viagens alter column cambio set default 1;
alter table public.viagens alter column cambio set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'viagens_status_ok') then
    alter table public.viagens add constraint viagens_status_ok
      check (status in ('planejamento','em_viagem','concluida'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'viagens_cambio_positivo') then
    alter table public.viagens add constraint viagens_cambio_positivo
      check (cambio > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'viagens_orcamento_positivo') then
    alter table public.viagens add constraint viagens_orcamento_positivo
      check (orcamento is null or orcamento >= 0);
  end if;
end $$;


-- ----------------------------------------------------------------------------
--  6. ÍNDICE — a lista do seletor de viagens vai ordenar por data
-- ----------------------------------------------------------------------------

create index if not exists idx_viagens_user_inicio
  on public.viagens(user_id, inicio desc);


-- ----------------------------------------------------------------------------
--  7. CONFERÊNCIA — o resultado aparece na aba Results do SQL Editor.
--     Compare com a sua planilha: hospedagem € 2.886,77 e gastos € 6.905,98.
-- ----------------------------------------------------------------------------

select v.nome,
       v.destino,
       v.moeda,
       v.cambio,
       v.status,
       v.orcamento,
       v.inicio,
       v.fim,
       (select count(*)             from public.viagem_hospedagem h where h.viagem_id = v.id) as estadias,
       (select round(sum(h.valor),2) from public.viagem_hospedagem h where h.viagem_id = v.id) as total_hospedagem,
       (select count(*)             from public.viagem_gastos g where g.viagem_id = v.id) as gastos,
       (select round(sum(g.valor),2) from public.viagem_gastos g where g.viagem_id = v.id) as total_gastos
  from public.viagens v
 order by v.inicio desc;

-- ============================================================================
--  ESPERADO para a Espanha:
--    destino Espanha · moeda EUR · cambio 5.3500 · status concluida
--    estadias 10 · total_hospedagem 2886.77
--    gastos 221 · total_gastos 6905.98
--
--  Se os totais baterem, nada foi perdido.
-- ============================================================================
