-- Corrige os acentos gravados errados em 13/11/2026 (o texto foi copiado sem
-- UTF-8). Escrito so com ASCII (U&'\00e7') para nao depender da area de transferencia.

update public.dividas set nome = U&'Amplia\00e7\00e3o da casa', observacoes = U&'Selic + 6% a.a., 48x SAC, sem seguro. IOF R$ 2.128,55 (adicional 0,38% R$ 267,24 + di\00e1rio R$ 1.861,31). A escola paga a amortiza\00e7\00e3o (~R$ 1.465,10) e o Fred paga os juros, transferindo para a Sicredi da escola.'
where sistema = 'sac' and valor_total = 70325;

update public.subcategorias set nome = U&'Amplia\00e7\00e3o da casa (obra)'
where id in (select subcategoria_obra_id from public.dividas where sistema = 'sac' and valor_total = 70325);

update public.subcategorias set nome = U&'Empr\00e9stimo da amplia\00e7\00e3o'
where id in (select subcategoria_parcela_id from public.dividas where sistema = 'sac' and valor_total = 70325);

update public.transacoes set descricao = U&'Libera\00e7\00e3o do empr\00e9stimo da amplia\00e7\00e3o (bruto)'
where valor = 70325 and conta_id in (select conta_id from public.dividas where sistema = 'sac' and valor_total = 70325);

update public.transacoes set descricao = U&'IOF do empr\00e9stimo da amplia\00e7\00e3o'
where valor = 2128.55 and conta_id in (select conta_id from public.dividas where sistema = 'sac' and valor_total = 70325);

comment on column public.dividas.sistema is U&'sac = amortiza\00e7\00e3o fixa, parcela calculada pelo app (tabela de parcelas). Vazio = valores digitados \00e0 m\00e3o.';
comment on column public.dividas.conta_id is U&'Conta onde o dinheiro do empr\00e9stimo entrou (ex.: Conta da obra).';
comment on column public.dividas.subcategoria_obra_id is U&'Subcategoria das compras feitas com o dinheiro do empr\00e9stimo; lan\00e7amentos nela s\00e3o sempre neutros.';
comment on column public.dividas.subcategoria_parcela_id is U&'Subcategoria do lan\00e7amento da parte da fam\00edlia em cada parcela.';
comment on table public.parcelas_divida is U&'Parcelas j\00e1 pagas de uma d\00edvida, com o valor real dividido em amortiza\00e7\00e3o e juros.';
comment on column public.parcelas_divida.pago_terceiros is U&'Parte paga fora das contas da fam\00edlia (ex.: a escola paga a amortiza\00e7\00e3o).';

-- Conferir: nomes com acento certo e os campos da tabela SAC preenchidos
select d.nome, d.sistema, d.data_primeira_parcela, d.taxa_juros_am, d.parcelas_total,
  so.nome as subcategoria_obra, sp.nome as subcategoria_parcela, c.nome as conta
from public.dividas d
left join public.subcategorias so on so.id = d.subcategoria_obra_id
left join public.subcategorias sp on sp.id = d.subcategoria_parcela_id
left join public.contas c on c.id = d.conta_id
where d.valor_total = 70325;
