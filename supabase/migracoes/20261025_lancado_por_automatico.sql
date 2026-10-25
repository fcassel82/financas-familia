-- "Lançado por" sempre preenchido e verdadeiro.
-- 1) Os 110 lançamentos sem autor (importações de 09 a 22/09/2026, feitas fora
--    do app) recebem o dono como autor, como acontece em todos os outros.
-- 2) Daqui para frente o banco define o autor: quem está logado ao criar; nas
--    rotinas de importação (sem login), o que veio ou o dono. Na edição, o
--    autor não muda.
-- 3) O campo passa a ser obrigatório.

-- Antes do gatilho: com ele ativo, o update manteria o autor antigo (vazio)
update public.transacoes set lancado_por = dono_id where lancado_por is null;

create or replace function public.definir_lancado_por()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.lancado_por := coalesce((select auth.uid()), new.lancado_por, new.dono_id);
  else
    new.lancado_por := old.lancado_por;
  end if;
  return new;
end;
$$;

create trigger transacoes_lancado_por
  before insert or update on public.transacoes
  for each row execute function public.definir_lancado_por();

alter table public.transacoes alter column lancado_por set not null;

-- Para desfazer: drop trigger transacoes_lancado_por on public.transacoes;
--                alter table public.transacoes alter column lancado_por drop not null;
