-- ============================================================================
--  CONTAS — esquema completo do banco
--  Onde rodar: Supabase → SQL Editor → New query → cole tudo → Run.
--  Pode rodar mais de uma vez sem quebrar nada (é idempotente).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
--  1. FUNÇÃO DE APOIO
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================================
--  2. PERFIS  (1 por usuário do Supabase Auth)
-- ============================================================================

create table if not exists public.perfis (
  id               uuid primary key references auth.users(id) on delete cascade,
  nome             text,
  email            text,
  moeda_padrao     text not null default 'BRL' check (moeda_padrao in ('BRL','USD','EUR','PYG')),
  cambio_eur       numeric(12,4) not null default 5.35,    -- quanto vale 1 EUR em BRL
  cambio_usd       numeric(12,4) not null default 5.08,    -- quanto vale 1 USD em BRL
  cambio_pyg       numeric(12,4) not null default 1385.72, -- quanto vale 1 BRL em PYG
  inicio_historico date not null default '2026-05-01',
  criado_em        timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================================
--  3. CADASTROS
-- ============================================================================

create table if not exists public.categorias (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  nome       text not null,
  tipo       text not null default 'despesa' check (tipo in ('despesa','receita','ambos')),
  cor        text not null default '#78909C',
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, nome)
);

create table if not exists public.locais (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  nome       text not null,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, nome)
);

create table if not exists public.contas_bancarias (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  nome          text not null,
  tipo          text not null default 'corrente' check (tipo in ('corrente','poupanca','digital','dinheiro','investimento')),
  banco         text,
  moeda         text not null default 'BRL' check (moeda in ('BRL','USD','EUR','PYG')),
  saldo_inicial numeric(14,2) not null default 0,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, nome)
);

create table if not exists public.cartoes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  nome           text not null,
  bandeira       text,
  limite         numeric(14,2),
  dia_fechamento smallint check (dia_fechamento between 1 and 31),
  dia_vencimento smallint check (dia_vencimento between 1 and 31),
  conta_id       uuid references public.contas_bancarias(id) on delete set null,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, nome)
);

-- ============================================================================
--  4. CONTAS A PAGAR  (o coração do app: 1 linha por conta do mês)
-- ============================================================================

create table if not exists public.contas (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  descricao       text not null,
  vencimento      date not null,
  categoria       text not null default 'Outros',
  local           text not null default 'Pessoal',
  forma_pagamento text default '',
  cartao_id       uuid references public.cartoes(id) on delete set null,
  conta_id        uuid references public.contas_bancarias(id) on delete set null,
  valor_estimado  numeric(14,2) not null default 0,
  valor_pago      numeric(14,2) not null default 0,
  moeda           text not null default 'BRL' check (moeda in ('BRL','USD','EUR','PYG')),
  status          text not null default 'Pendente' check (status in ('Pago','Pendente')),
  obs             text default '',
  parcelamento_id uuid,
  criado_em       timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.fixos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  descricao       text not null,
  dia_vencimento  smallint not null default 1 check (dia_vencimento between 1 and 31),
  categoria       text not null default 'Outros',
  local           text not null default 'Pessoal',
  forma_pagamento text default '',
  valor_estimado  numeric(14,2) not null default 0,
  ativo           boolean not null default true,
  ordem           int not null default 0,
  criado_em       timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================================
--  5. MOVIMENTO: receitas, despesas do dia a dia, transferências
-- ============================================================================

create table if not exists public.receitas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  descricao  text not null,
  data       date not null,
  valor      numeric(14,2) not null default 0,
  moeda      text not null default 'BRL' check (moeda in ('BRL','USD','EUR','PYG')),
  categoria  text not null default 'Outros',
  conta_id   uuid references public.contas_bancarias(id) on delete set null,
  recebido   boolean not null default true,
  recorrente boolean not null default false,
  obs        text default '',
  criado_em  timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.despesas (          -- o "dia a dia" do app
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  descricao       text not null,
  data            date not null,
  valor           numeric(14,2) not null default 0,
  moeda           text not null default 'BRL' check (moeda in ('BRL','USD','EUR','PYG')),
  categoria       text not null default 'Outros',
  local           text default 'Pessoal',
  forma_pagamento text not null default 'Cartão',
  cartao_id       uuid references public.cartoes(id) on delete set null,
  conta_id        uuid references public.contas_bancarias(id) on delete set null,
  parcelamento_id uuid,
  obs             text default '',
  criado_em       timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.transferencias (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  data             date not null,
  valor            numeric(14,2) not null default 0,
  moeda            text not null default 'BRL' check (moeda in ('BRL','USD','EUR','PYG')),
  conta_origem_id  uuid references public.contas_bancarias(id) on delete set null,
  conta_destino_id uuid references public.contas_bancarias(id) on delete set null,
  obs              text default '',
  criado_em        timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint contas_diferentes check (conta_origem_id is distinct from conta_destino_id)
);

-- ============================================================================
--  6. PARCELAMENTOS
-- ============================================================================

create table if not exists public.parcelamentos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  descricao     text not null,
  valor_total   numeric(14,2) not null default 0,
  parcelas      smallint not null default 1 check (parcelas between 1 and 120),
  primeira_data date not null,
  categoria     text not null default 'Compras',
  moeda         text not null default 'BRL' check (moeda in ('BRL','USD','EUR','PYG')),
  cartao_id     uuid references public.cartoes(id) on delete set null,
  obs           text default '',
  criado_em     timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.parcelas (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  parcelamento_id uuid not null references public.parcelamentos(id) on delete cascade,
  numero          smallint not null,
  vencimento      date not null,
  valor           numeric(14,2) not null default 0,
  pago            boolean not null default false,
  criado_em       timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (parcelamento_id, numero)
);

-- ============================================================================
--  7. METAS FINANCEIRAS
-- ============================================================================

create table if not exists public.metas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nome        text not null,
  valor_alvo  numeric(14,2) not null default 0,
  valor_atual numeric(14,2) not null default 0,
  moeda       text not null default 'BRL' check (moeda in ('BRL','USD','EUR','PYG')),
  prazo       date,
  cor         text not null default '#0F6E5C',
  concluida   boolean not null default false,
  criado_em   timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================================
--  8. VIAGENS
-- ============================================================================

create table if not exists public.viagens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  nome       text not null,
  moeda      text not null default 'EUR' check (moeda in ('BRL','USD','EUR','PYG')),
  inicio     date not null,
  fim        date not null,
  obs        text default '',
  criado_em  timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint datas_ok check (fim >= inicio)
);

create table if not exists public.viagem_hospedagem (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  viagem_id  uuid not null references public.viagens(id) on delete cascade,
  nome       text not null,
  cidade     text default '',
  entrada    date not null,
  noites     smallint not null default 1 check (noites > 0),
  valor      numeric(14,2) not null default 0,
  criado_em  timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.viagem_gastos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  viagem_id       uuid not null references public.viagens(id) on delete cascade,
  data            date not null,
  descricao       text not null,
  categoria       text not null default 'Outros',
  forma_pagamento text not null default 'Cartão',
  valor           numeric(14,2) not null default 0,
  criado_em       timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================================
--  9. ANEXOS  (metadados; o arquivo em si mora no Storage)
-- ============================================================================

create table if not exists public.anexos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tabela      text not null check (tabela in ('contas','despesas','receitas','viagem_gastos','viagem_hospedagem','parcelamentos','metas')),
  registro_id uuid not null,
  nome        text not null,
  caminho     text not null,          -- ex.: {user_id}/comprovantes/nota.pdf
  mime        text,
  tamanho     bigint,
  criado_em   timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================================
--  10. ÍNDICES
-- ============================================================================

create index if not exists idx_contas_user_venc   on public.contas(user_id, vencimento);
create index if not exists idx_contas_user_status on public.contas(user_id, status);
create index if not exists idx_fixos_user         on public.fixos(user_id, ativo);
create index if not exists idx_despesas_user_data on public.despesas(user_id, data);
create index if not exists idx_receitas_user_data on public.receitas(user_id, data);
create index if not exists idx_transf_user_data   on public.transferencias(user_id, data);
create index if not exists idx_parcelas_user_venc on public.parcelas(user_id, vencimento);
create index if not exists idx_vg_viagem_data     on public.viagem_gastos(viagem_id, data);
create index if not exists idx_vh_viagem          on public.viagem_hospedagem(viagem_id, entrada);
create index if not exists idx_anexos_reg         on public.anexos(user_id, tabela, registro_id);
create index if not exists idx_categorias_user    on public.categorias(user_id, ativo);

-- ============================================================================
--  11. updated_at automático em todas as tabelas
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array['perfis','categorias','locais','contas_bancarias','cartoes','contas','fixos',
                           'receitas','despesas','transferencias','parcelamentos','parcelas',
                           'metas','viagens','viagem_hospedagem','viagem_gastos','anexos']
  loop
    execute format('drop trigger if exists trg_updated_at on public.%I', t);
    execute format('create trigger trg_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ============================================================================
--  12. ROW LEVEL SECURITY
--      Regra única: você só enxerga e só mexe nas linhas onde user_id = você.
--      force row level security: vale até para o dono da tabela.
-- ============================================================================

alter table public.perfis enable row level security;
alter table public.perfis force row level security;
drop policy if exists perfis_select on public.perfis;
drop policy if exists perfis_insert on public.perfis;
drop policy if exists perfis_update on public.perfis;
create policy perfis_select on public.perfis for select using (auth.uid() = id);
create policy perfis_insert on public.perfis for insert with check (auth.uid() = id);
create policy perfis_update on public.perfis for update using (auth.uid() = id) with check (auth.uid() = id);
-- de propósito, sem policy de delete: o perfil morre junto com o usuário (cascade)

do $$
declare t text;
begin
  foreach t in array array['categorias','locais','contas_bancarias','cartoes','contas','fixos',
                           'receitas','despesas','transferencias','parcelamentos','parcelas',
                           'metas','viagens','viagem_hospedagem','viagem_gastos','anexos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t||'_select', t);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t||'_insert', t);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t||'_update', t);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t||'_delete', t);
  end loop;
end $$;

-- ============================================================================
--  13. NOVO USUÁRIO: cria o perfil e semeia categorias e locais
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email)
  on conflict (id) do nothing;

  insert into public.categorias (user_id, nome, cor) values
    (new.id,'Aluguel','#2F4F9E'), (new.id,'Assinaturas','#7A3E9D'), (new.id,'Associações','#A85B00'),
    (new.id,'Bar','#8E24AA'), (new.id,'Cartão/Banco','#B4232A'), (new.id,'Compras','#C2185B'),
    (new.id,'Condomínio','#00695C'), (new.id,'Contabilidade','#455A64'), (new.id,'Energia','#B98900'),
    (new.id,'Entretenimento','#00897B'), (new.id,'Hospedagem','#3949AB'), (new.id,'Impostos','#5D4037'),
    (new.id,'Internet','#0277BD'), (new.id,'Mercado','#558B2F'), (new.id,'Restaurante','#D84315'),
    (new.id,'Saúde','#0F6E5C'), (new.id,'Serviços','#827717'), (new.id,'Telefone','#00838F'),
    (new.id,'Transporte','#E65100'), (new.id,'Outros','#78909C')
  on conflict (user_id, nome) do nothing;

  insert into public.locais (user_id, nome) values
    (new.id,'Apartamento'), (new.id,'Chácara'), (new.id,'Miro'), (new.id,'Pessoal')
  on conflict (user_id, nome) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
--  14. STORAGE dos anexos (bucket privado; cada usuário só na pasta dele)
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('anexos','anexos', false)
on conflict (id) do nothing;

drop policy if exists anexos_ler    on storage.objects;
drop policy if exists anexos_subir  on storage.objects;
drop policy if exists anexos_trocar on storage.objects;
drop policy if exists anexos_apagar on storage.objects;

create policy anexos_ler on storage.objects for select
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy anexos_subir on storage.objects for insert
  with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy anexos_trocar on storage.objects for update
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy anexos_apagar on storage.objects for delete
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
--  15. VISÃO DE CONFERÊNCIA — total por mês, somando tudo
--      security_invoker: a view respeita o RLS de quem consulta.
-- ============================================================================

create or replace view public.v_resumo_mensal
with (security_invoker = true) as
select user_id,
       date_trunc('month', vencimento)::date as mes,
       'contas'::text as origem,
       sum(valor_estimado) as estimado,
       sum(valor_pago)     as pago,
       count(*)            as itens
from public.contas group by 1, 2
union all
select user_id, date_trunc('month', data)::date, 'dia a dia', sum(valor), sum(valor), count(*)
from public.despesas group by 1, 2
union all
select user_id, date_trunc('month', data)::date, 'receitas', sum(valor), sum(valor), count(*)
from public.receitas group by 1, 2;

-- ============================================================================
--  FIM.
--  Confira em Table Editor: 18 tabelas, todas com o cadeado "RLS enabled".
--  Se alguma aparecer sem cadeado, rode este arquivo de novo.
-- ============================================================================
