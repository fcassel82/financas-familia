-- Importar dos bancos (Meu Pluggy) com caixa de entrada, e notas fiscais
-- como registro próprio. Ver docs/superpowers/specs/2026-10-26-bancos-pluggy-design.md

-- Notas fiscais: os itens (lançamentos) apontam para a nota
create table public.notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  loja text,
  cnpj text,
  data date not null,
  valor_pago numeric not null check (valor_pago >= 0),
  desconto numeric not null default 0,
  quantidade_itens integer not null default 0,
  conta_id uuid references public.contas(id) on delete set null,
  cartao_id uuid references public.cartoes_credito(id) on delete set null,
  escopo text not null default 'familiar' check (escopo in ('familiar', 'pessoal')),
  dono_id uuid not null references auth.users(id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create index notas_fiscais_data_idx on public.notas_fiscais (data);
create index notas_fiscais_dono_id_idx on public.notas_fiscais (dono_id);
create index notas_fiscais_conta_id_idx on public.notas_fiscais (conta_id);
create index notas_fiscais_cartao_id_idx on public.notas_fiscais (cartao_id);
alter table public.notas_fiscais enable row level security;
create policy notas_fiscais_select on public.notas_fiscais for select
  using (eh_membro() and (escopo = 'familiar' or dono_id = (select auth.uid()) or is_admin()));
create policy notas_fiscais_insert on public.notas_fiscais for insert
  with check (eh_membro() and (dono_id = (select auth.uid()) or is_admin()));
create policy notas_fiscais_update on public.notas_fiscais for update
  using (eh_membro() and (dono_id = (select auth.uid()) or is_admin()))
  with check (eh_membro() and (dono_id = (select auth.uid()) or is_admin()));
create policy notas_fiscais_delete on public.notas_fiscais for delete
  using (eh_membro() and (dono_id = (select auth.uid()) or is_admin()));

alter table public.transacoes
  add column nota_fiscal_id uuid references public.notas_fiscais(id) on delete set null;
create index transacoes_nota_fiscal_id_idx on public.transacoes (nota_fiscal_id);

-- Contas e cartões que a Pluggy encontrou, e a ligação com o app (só administrador)
create table public.contas_banco (
  id text primary key,
  item_id text not null,
  nome text not null,
  tipo text not null,
  subtipo text,
  numero text,
  saldo numeric,
  conta_id uuid references public.contas(id) on delete set null,
  cartao_id uuid references public.cartoes_credito(id) on delete set null,
  ultima_busca timestamptz,
  criado_em timestamptz not null default now(),
  check (conta_id is null or cartao_id is null)
);
create index contas_banco_conta_id_idx on public.contas_banco (conta_id);
create index contas_banco_cartao_id_idx on public.contas_banco (cartao_id);
alter table public.contas_banco enable row level security;
create policy contas_banco_admin on public.contas_banco for all
  using (eh_membro() and is_admin()) with check (eh_membro() and is_admin());

-- Caixa de entrada: cada transação do banco entra uma vez (id da Pluggy)
create table public.transacoes_banco (
  id text primary key,
  conta_banco_id text not null references public.contas_banco(id) on delete cascade,
  data date not null,
  descricao text not null,
  valor numeric not null check (valor > 0),
  tipo text not null check (tipo in ('receita', 'despesa')),
  pagamento_cartao boolean not null default false,
  categoria_banco text,
  comerciante text,
  parcela integer,
  parcelas integer,
  situacao text not null default 'revisar' check (situacao in ('revisar', 'lancada', 'ligada', 'ignorada')),
  lancamentos uuid[] not null default '{}',
  motivo text,
  criado_em timestamptz not null default now(),
  revisado_em timestamptz
);
create index transacoes_banco_conta_banco_id_idx on public.transacoes_banco (conta_banco_id);
create index transacoes_banco_situacao_idx on public.transacoes_banco (situacao);
alter table public.transacoes_banco enable row level security;
create policy transacoes_banco_admin on public.transacoes_banco for all
  using (eh_membro() and is_admin()) with check (eh_membro() and is_admin());

-- O papel anônimo não precisa de nada nas tabelas novas
revoke all on public.notas_fiscais, public.contas_banco, public.transacoes_banco from anon;
