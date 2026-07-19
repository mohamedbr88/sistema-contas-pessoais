-- RPC: vincular_contas_antigas
--
-- Executar esta função no SQL Editor do Supabase para vincular, de
-- forma conservadora, lançamentos em `contas` (com fixo_id IS NULL)
-- às suas `fixos` correspondentes quando houver exatamente um
-- candidato por competência (AAAA-MM).
--
-- A função retorna um resumo com (fixo_id, fixo_nome, mes, vinculados).
-- Use com cautela (recomendada revisão antes de rodar em bases grandes).

create or replace function public.rpc_vincular_contas_antigas()
returns table(fixo_id int, fixo_nome text, mes text, vinculados int)
language plpgsql security definer as $$
declare
  rec record;
  mes_txt text;
begin
  -- Seleciona aglomerados (fixo x competência) onde há exatamente 1 candidato
  for rec in
    select f.id as fixo_id, f.descricao as fixo_nome, to_char(c.vencimento,'YYYY-MM') as mes,
           min(c.id) as exemplo_id, count(*) as candidatos, f.inicio as inicio, f.fim as fim
    from public.fixos f
    join public.contas c on lower(trim(c.descricao)) = lower(trim(f.descricao))
    where c.fixo_id is null and coalesce(c.status,'') <> 'Pago'
    group by f.id, f.descricao, to_char(c.vencimento,'YYYY-MM'), f.inicio, f.fim
  loop
    -- verifica se a competência cai dentro do período do fixo
    mes_txt := rec.mes;
    if (rec.inicio is not null and mes_txt < to_char(rec.inicio,'YYYY-MM')) then
      continue;
    end if;
    if (rec.fim is not null and mes_txt > to_char(rec.fim,'YYYY-MM')) then
      continue;
    end if;

    if rec.candidatos = 1 then
      -- Atualiza o único registro daquela competência
      update public.contas
      set fixo_id = rec.fixo_id
      where id = rec.exemplo_id and fixo_id is null and coalesce(status,'') <> 'Pago';

      if found then
        fixo_id := rec.fixo_id;
        fixo_nome := rec.fixo_nome;
        mes := rec.mes;
        vinculados := 1;
        return next;
      end if;
    end if;
  end loop;
  return;
end; $$;

-- Exemplo de uso (no SQL Editor do Supabase):
-- select * from public.rpc_vincular_contas_antigas();
-- A função pode ser chamada via REST/RPC do Supabase como: rpc/vincular_contas_antigas
