-- Dados do empréstimo da ampliação da casa (conferidos com o Fred em 13/11/2026).
-- Rodar depois de 20261113_divida_sac_obra.sql.
--
-- Banco: Sicredi (conta PJ da escola de música), R$ 70.325,00 em 48x SAC,
-- Selic + 6% a.a. (1,5133% a.m. na simulação), sem seguro, 1ª parcela 10/12/2026.
-- IOF R$ 2.128,55 → líquido R$ 68.196,45 na Sicredi.
-- A Sicredi da escola não é cadastrada: a "Conta da obra" guarda só o dinheiro
-- do empréstimo. Material sai dela; mão de obra sai da conta do Fred.

do $$
declare
  fred uuid := (select id from auth.users where email = 'frd.cassel@gmail.com');
  moradia uuid;
  sub_obra uuid;
  sub_parcela uuid;
  conta uuid;
begin
  if fred is null then
    raise exception 'Usuário do Fred não encontrado';
  end if;

  select id into moradia from public.categorias
  where tipo = 'despesa' and nome ilike 'moradia%' order by nome limit 1;
  if moradia is null then
    insert into public.categorias (nome, tipo) values ('Moradia', 'despesa') returning id into moradia;
  end if;

  insert into public.subcategorias (categoria_id, nome, grupo_503020)
  values (moradia, 'Ampliação da casa (obra)', null) returning id into sub_obra;
  insert into public.subcategorias (categoria_id, nome, grupo_503020)
  values (moradia, 'Empréstimo da ampliação', 'necessidade') returning id into sub_parcela;

  insert into public.contas (nome, tipo, instituicao, saldo_inicial, cor, escopo, dono_id)
  values ('Conta da obra', 'outro', 'Sicredi (escola)', 0, '#d98324', 'familiar', fred)
  returning id into conta;

  insert into public.dividas (
    nome, tipo, credor, valor_total, saldo_devedor, valor_parcela, parcelas_total, parcelas_pagas,
    taxa_juros_am, data_inicio, data_fim, quitada, escopo, dono_id, observacoes,
    sistema, data_primeira_parcela, conta_id, subcategoria_obra_id, subcategoria_parcela_id
  ) values (
    'Ampliação da casa', 'emprestimo', 'Sicredi', 70325, 70325, 2529.33, 48, 0,
    1.5133, '2026-11-11', '2030-11-10', false, 'familiar', fred,
    'Selic + 6% a.a., 48x SAC, sem seguro. IOF R$ 2.128,55 (adicional 0,38% R$ 267,24 + diário R$ 1.861,31). '
      || 'A escola paga a amortização (~R$ 1.465,10) e o Fred paga os juros, transferindo para a Sicredi da escola.',
    'sac', '2026-12-10', conta, sub_obra, sub_parcela
  );

  -- Entrada do empréstimo e IOF: neutros (dinheiro emprestado não é renda; o
  -- IOF foi pago com o próprio empréstimo e volta nas parcelas)
  insert into public.transacoes (data, descricao, valor, tipo, status, neutro, escopo, conta_id, categoria_id, subcategoria_id, dono_id, lancado_por)
  values
    ('2026-11-11', 'Liberação do empréstimo da ampliação (bruto)', 70325, 'receita', 'pago', true, 'familiar', conta, null, null, fred, fred),
    ('2026-11-11', 'IOF do empréstimo da ampliação', 2128.55, 'despesa', 'pago', true, 'familiar', conta, moradia, sub_parcela, fred, fred);
end $$;

-- Conferir: deve mostrar a Conta da obra com R$ 68.196,45
select c.nome, sum(case when t.tipo = 'receita' then t.valor else -t.valor end) as saldo
from public.contas c join public.transacoes t on t.conta_id = c.id
where c.nome = 'Conta da obra' group by c.nome;
