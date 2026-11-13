-- Empréstimo em SAC com acompanhamento da obra (ampliação da casa).
-- - A dívida guarda o sistema (SAC), a 1ª parcela, a conta onde o dinheiro
--   entrou e as subcategorias das compras da obra e da parcela.
-- - Cada parcela paga vira uma linha em parcelas_divida, com o valor real
--   (a taxa é Selic + 6% a.a., então muda), a parte paga por terceiros (a
--   escola) e o lançamento da parte da família.
-- - Compras na subcategoria da obra são sempre neutras: quem pesa no mês é
--   a parcela, não o gasto feito com o dinheiro emprestado.

alter table public.dividas
  add column sistema text check (sistema in ('sac')),
  add column data_primeira_parcela date,
  add column conta_id uuid references public.contas(id) on delete set null,
  add column subcategoria_obra_id uuid references public.subcategorias(id) on delete set null,
  add column subcategoria_parcela_id uuid references public.subcategorias(id) on delete set null;
create index dividas_conta_id_idx on public.dividas (conta_id);
create index dividas_subcategoria_obra_id_idx on public.dividas (subcategoria_obra_id);
create index dividas_subcategoria_parcela_id_idx on public.dividas (subcategoria_parcela_id);

comment on column public.dividas.sistema is 'sac = amortização fixa, parcela calculada pelo app (tabela de parcelas). Vazio = valores digitados à mão.';
comment on column public.dividas.conta_id is 'Conta onde o dinheiro do empréstimo entrou (ex.: Conta da obra).';
comment on column public.dividas.subcategoria_obra_id is 'Subcategoria das compras feitas com o dinheiro do empréstimo; lançamentos nela são sempre neutros.';
comment on column public.dividas.subcategoria_parcela_id is 'Subcategoria do lançamento da parte da família em cada parcela.';

create table public.parcelas_divida (
  id uuid primary key default gen_random_uuid(),
  divida_id uuid not null references public.dividas(id) on delete cascade,
  numero integer not null check (numero > 0),
  pago_em date not null,
  amortizacao numeric not null check (amortizacao >= 0),
  juros numeric not null check (juros >= 0),
  pago_terceiros numeric not null default 0 check (pago_terceiros >= 0),
  transacao_id uuid references public.transacoes(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (divida_id, numero)
);
create index parcelas_divida_transacao_id_idx on public.parcelas_divida (transacao_id);
comment on table public.parcelas_divida is 'Parcelas já pagas de uma dívida, com o valor real dividido em amortização e juros.';
comment on column public.parcelas_divida.pago_terceiros is 'Parte paga fora das contas da família (ex.: a escola paga a amortização).';

-- Segue a dívida: quem vê a dívida vê as parcelas; quem edita a dívida edita as parcelas
alter table public.parcelas_divida enable row level security;
create policy parcelas_divida_select on public.parcelas_divida for select
  using (eh_membro() and exists (
    select 1 from public.dividas d where d.id = parcelas_divida.divida_id
      and (d.escopo = 'familiar' or d.dono_id = (select auth.uid()) or is_admin())
  ));
create policy parcelas_divida_escrita on public.parcelas_divida for all
  using (eh_membro() and exists (
    select 1 from public.dividas d where d.id = parcelas_divida.divida_id
      and (d.dono_id = (select auth.uid()) or is_admin())
  ))
  with check (eh_membro() and exists (
    select 1 from public.dividas d where d.id = parcelas_divida.divida_id
      and (d.dono_id = (select auth.uid()) or is_admin())
  ));
revoke all on public.parcelas_divida from anon;

-- Compra da obra sempre neutra, venha de onde vier (lançamento, importação, bancos)
create or replace function public.compra_obra_neutra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subcategoria_id is not null and exists (
    select 1 from public.dividas d where d.subcategoria_obra_id = new.subcategoria_id
  ) then
    new.neutro := true;
  end if;
  return new;
end;
$$;
revoke execute on function public.compra_obra_neutra() from public, anon, authenticated;

create trigger transacoes_compra_obra_neutra
  before insert or update on public.transacoes
  for each row execute function public.compra_obra_neutra();

-- Para desfazer:
--   drop trigger transacoes_compra_obra_neutra on public.transacoes;
--   drop function public.compra_obra_neutra();
--   drop table public.parcelas_divida;
--   alter table public.dividas drop column sistema, drop column data_primeira_parcela,
--     drop column conta_id, drop column subcategoria_obra_id, drop column subcategoria_parcela_id;
