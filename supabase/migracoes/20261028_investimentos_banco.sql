-- Investimentos que chegam pelo Meu Pluggy (saldo bruto). Só o administrador.
-- A busca atualiza nome, saldo e situação; a ligação com a conta de
-- investimento do app (conta_id) e o "Não acompanhar" ficam como o Fred deixou.
create table public.investimentos_banco (
  id text primary key,
  item_id text not null,
  nome text not null,
  tipo text,
  subtipo text,
  saldo numeric not null default 0,
  data_saldo date not null,
  situacao text,
  conta_id uuid references public.contas(id) on delete set null,
  acompanhar boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index investimentos_banco_conta_id_idx on public.investimentos_banco (conta_id);
alter table public.investimentos_banco enable row level security;
create policy investimentos_banco_admin on public.investimentos_banco for all
  using (eh_membro() and is_admin()) with check (eh_membro() and is_admin());
revoke all on public.investimentos_banco from anon;
