-- Abastecimentos e manutenções seguem o veículo: quem não vê o veículo
-- (pessoal de outra pessoa) também não vê os abastecimentos e manutenções dele.
-- Criar, editar e apagar continuam como antes (dono do registro ou administrador).
-- Gás e fornecedores ficam compartilhados de propósito (gás da casa; lista de nomes).

alter policy abastecimentos_select on public.abastecimentos
  using (
    eh_membro() and exists (
      select 1 from public.veiculos v
      where v.id = abastecimentos.veiculo_id
        and (v.escopo = 'familiar' or v.dono_id = (select auth.uid()) or is_admin())
    )
  );

alter policy manutencoes_select on public.manutencoes
  using (
    eh_membro() and exists (
      select 1 from public.veiculos v
      where v.id = manutencoes.veiculo_id
        and (v.escopo = 'familiar' or v.dono_id = (select auth.uid()) or is_admin())
    )
  );

-- Para desfazer: voltar as duas regras para "using (eh_membro())".
