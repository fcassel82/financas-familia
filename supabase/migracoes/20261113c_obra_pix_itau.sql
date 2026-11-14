-- Dois Pix do Itaú (novembro/2026) eram da obra: passam para a subcategoria da
-- obra (o gatilho marca neutro). Fossa + filtro + cisterna (Plastifibra) serão
-- reembolsados pela Sicredi da escola; Jairo é mão de obra.
do $$
declare
  n integer;
begin
  update public.transacoes t
  set categoria_id = s.categoria_id, subcategoria_id = s.id
  from public.subcategorias s
  where s.nome = 'Ampliação da casa (obra)'
    and t.tipo = 'despesa'
    and t.data >= '2026-11-01'
    and ((t.valor = 1735.00 and t.descricao ilike '%jairo%')
      or (t.valor = 8996.18 and t.descricao ilike '%plastifibra%'));
  get diagnostics n = row_count;
  if n <> 2 then
    raise exception 'Esperava 2 lançamentos, achei %. Nada foi alterado.', n;
  end if;
end $$;

-- Conferir: os 2 Pix, com neutro = true
select t.data, t.descricao, t.valor, t.neutro, c.nome as conta
from public.transacoes t
left join public.contas c on c.id = t.conta_id
where t.subcategoria_id = (select id from public.subcategorias where nome = 'Ampliação da casa (obra)')
order by t.data;
