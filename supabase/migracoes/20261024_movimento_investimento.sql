-- Investimentos: dinheiro que nasce dentro do investimento (rendimento,
-- aporte da empresa) passa a ser marcado e neutro, para não contar como
-- renda do mês. Ver docs/superpowers/specs/2026-10-24-investimentos-design.md

alter table public.transacoes
  add column movimento_investimento text
    check (movimento_investimento in ('rendimento', 'aporte_empresa'));

-- Lançamento marcado nunca pode contar como renda do mês
alter table public.transacoes
  add constraint transacoes_movimento_investimento_neutro
    check (movimento_investimento is null or neutro);

comment on column public.transacoes.movimento_investimento is
  'Dinheiro que nasce dentro de um investimento: rendimento (ganho ou perda) ou aporte da empresa (patronal, FGTS). Sempre neutro: aumenta o saldo, não a renda do mês.';

alter table public.contas add column saldo_conferido_em date;

comment on column public.contas.saldo_conferido_em is
  'Última vez que o saldo desta conta foi conferido com o extrato pelo botão Atualizar saldo.';

-- Reclassifica os 6 lançamentos já existentes (conferidos com o Fred em 24/10/2026)
update public.transacoes
set movimento_investimento = 'aporte_empresa', neutro = true
where id in (
  'a4851c36-b1c7-44f8-81a6-99004aff70c3', -- 01/06 EQTPrev. Patronal 425,32
  '5b5407de-7bbe-440a-9a7b-06e32f31df12', -- 01/07 EQTPrev. Patronal 1.082,47
  'ee9b73c8-d4b2-41b1-b598-d5c2dc559bb8', -- 28/08 EQTPrev. Patronal 387,41
  '1a0acf24-81c9-4b30-8e8e-e50ee7ad6183'  -- 18/09 FGTS 996,42
);

update public.transacoes
set movimento_investimento = 'rendimento', neutro = true
where id in (
  '1f41945d-0677-41dc-8260-dda3ed4faa98', -- 01/09 EQTPREV Rentabilidade 50,63
  '9d93540c-0067-42e4-95ca-ca1ff42bf21d'  -- 18/09 FGTS Rendimentos 448,52
);
