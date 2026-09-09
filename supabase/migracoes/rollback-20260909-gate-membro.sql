-- ROLLBACK da migração 20260909_exigir_perfil_de_membro
-- Restaura as policies exatamente como estavam antes (gate `auth.uid() IS NOT NULL`).
-- Rode isto se a mudança bloquear alguém indevidamente.
-- ATENÇÃO: voltar para este estado reabre o buraco — qualquer usuário autenticado
-- (inclusive um estranho auto-cadastrado) volta a ler e escrever dados da família.

ALTER POLICY abastecimentos_delete ON public.abastecimentos USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY abastecimentos_insert ON public.abastecimentos WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY abastecimentos_select ON public.abastecimentos USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY abastecimentos_update ON public.abastecimentos USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())) WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY bens_delete ON public.bens USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY bens_insert ON public.bens WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY bens_select ON public.bens USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND ((escopo = 'familiar'::text) OR (dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())));
ALTER POLICY bens_update ON public.bens USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())) WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY cartoes_delete ON public.cartoes_credito USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY cartoes_insert ON public.cartoes_credito WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY cartoes_select ON public.cartoes_credito USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND ((escopo = 'familiar'::text) OR (dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())));
ALTER POLICY cartoes_update ON public.cartoes_credito USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())) WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY categorias_select ON public.categorias USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY contas_delete ON public.contas USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY contas_insert ON public.contas WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY contas_select ON public.contas USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND ((escopo = 'familiar'::text) OR (dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())));
ALTER POLICY contas_update ON public.contas USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())) WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY dividas_delete ON public.dividas USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY dividas_insert ON public.dividas WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY dividas_select ON public.dividas USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND ((escopo = 'familiar'::text) OR (dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())));
ALTER POLICY dividas_update ON public.dividas USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())) WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY fornecedores_delete ON public.fornecedores USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY fornecedores_insert ON public.fornecedores WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY fornecedores_select ON public.fornecedores USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY fornecedores_update ON public.fornecedores USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())) WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY imoveis_delete ON public.imoveis USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY imoveis_insert ON public.imoveis WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY imoveis_select ON public.imoveis USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND ((escopo = 'familiar'::text) OR (dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())));
ALTER POLICY imoveis_update ON public.imoveis USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())) WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY manutencoes_delete ON public.manutencoes USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY manutencoes_insert ON public.manutencoes WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY manutencoes_select ON public.manutencoes USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY manutencoes_update ON public.manutencoes USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())) WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY perfis_select ON public.perfis USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY subcategorias_select ON public.subcategorias USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY transacoes_delete ON public.transacoes USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY transacoes_insert ON public.transacoes WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY transacoes_select ON public.transacoes USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND ((escopo = 'familiar'::text) OR (dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())));
ALTER POLICY transacoes_update ON public.transacoes USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())) WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY trocas_gas_delete ON public.trocas_gas USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY trocas_gas_insert ON public.trocas_gas WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY trocas_gas_select ON public.trocas_gas USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY trocas_gas_update ON public.trocas_gas USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())) WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY veiculos_delete ON public.veiculos USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY veiculos_insert ON public.veiculos WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
ALTER POLICY veiculos_select ON public.veiculos USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND ((escopo = 'familiar'::text) OR (dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())));
ALTER POLICY veiculos_update ON public.veiculos USING (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin())) WITH CHECK (((dono_id = ( SELECT auth.uid() AS uid)) OR is_admin()));

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
DROP FUNCTION IF EXISTS public.eh_membro();
