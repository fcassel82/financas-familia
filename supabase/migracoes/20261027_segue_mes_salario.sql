-- Mês do salário só para a folha de pagamento: lançamentos destas categorias
-- a partir do dia 26 contam para o mês seguinte; o resto segue o calendário.
-- Ver docs/superpowers/specs/2026-10-27-mes-do-salario-design.md
alter table public.categorias add column segue_mes_salario boolean not null default false;

comment on column public.categorias.segue_mes_salario is
  'Lançamentos desta categoria a partir do dia 26 contam para o mês seguinte (folha de pagamento). As demais seguem o mês do calendário.';

update public.categorias set segue_mes_salario = true
where nome in ('Salário e Renda Principal', 'Impostos e Descontos em Folha', 'Benefícios');
