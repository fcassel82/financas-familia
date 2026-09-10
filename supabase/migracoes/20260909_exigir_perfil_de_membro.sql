-- =====================================================================
-- Fecha o buraco onde QUALQUER usuário autenticado lia e escrevia os
-- dados da família (achado crítico #1 da auditoria de 09/09/2026).
--
-- Antes: o gate das policies era `auth.uid() IS NOT NULL` — bastava
--        estar logado. Como o cadastro público do Supabase está aberto,
--        um estranho criava conta e passava a ler 487 lançamentos
--        familiares, contas, veículos, bens e todos os perfis; e, pelas
--        policies de INSERT (`dono_id = auth.uid()`), podia até gravar
--        lançamentos com escopo='familiar' e sujar os relatórios.
--
-- Agora: é preciso ter uma linha em `perfis`. Só o admin cria perfis
--        (perfis_insert já exige is_admin()), então um auto-cadastrado
--        no Auth não enxerga nem grava absolutamente nada.
--
-- Conferido antes de aplicar: os 3 usuários reais (Frederico/admin,
-- Gisa/membro, luisa/membro) têm perfil — nenhum perde acesso.
--
-- Rollback: supabase/migracoes/rollback-20260909-gate-membro.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.eh_membro()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select exists (select 1 from perfis where id = auth.uid());
$$;

COMMENT ON FUNCTION public.eh_membro() IS
  'Verdadeiro quando o usuário logado tem perfil na família. SECURITY DEFINER para não recursar no RLS da própria tabela perfis.';

-- ---------- SELECT: só quem é da família ----------
ALTER POLICY abastecimentos_select ON public.abastecimentos USING (eh_membro());
ALTER POLICY categorias_select     ON public.categorias     USING (eh_membro());
ALTER POLICY fornecedores_select   ON public.fornecedores   USING (eh_membro());
ALTER POLICY manutencoes_select    ON public.manutencoes    USING (eh_membro());
ALTER POLICY perfis_select         ON public.perfis         USING (eh_membro());
ALTER POLICY subcategorias_select  ON public.subcategorias  USING (eh_membro());
ALTER POLICY trocas_gas_select     ON public.trocas_gas     USING (eh_membro());

ALTER POLICY bens_select       ON public.bens            USING (eh_membro() AND ((escopo = 'familiar') OR (dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY cartoes_select    ON public.cartoes_credito USING (eh_membro() AND ((escopo = 'familiar') OR (dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY contas_select     ON public.contas          USING (eh_membro() AND ((escopo = 'familiar') OR (dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY dividas_select    ON public.dividas         USING (eh_membro() AND ((escopo = 'familiar') OR (dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY imoveis_select    ON public.imoveis         USING (eh_membro() AND ((escopo = 'familiar') OR (dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY transacoes_select ON public.transacoes      USING (eh_membro() AND ((escopo = 'familiar') OR (dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY veiculos_select   ON public.veiculos        USING (eh_membro() AND ((escopo = 'familiar') OR (dono_id = (select auth.uid())) OR is_admin()));

-- ---------- INSERT: impede um estranho de injetar lançamentos ----------
ALTER POLICY abastecimentos_insert ON public.abastecimentos  WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY bens_insert           ON public.bens            WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY cartoes_insert        ON public.cartoes_credito WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY contas_insert         ON public.contas          WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY dividas_insert        ON public.dividas         WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY fornecedores_insert   ON public.fornecedores    WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY imoveis_insert        ON public.imoveis         WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY manutencoes_insert    ON public.manutencoes     WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY transacoes_insert     ON public.transacoes      WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY trocas_gas_insert     ON public.trocas_gas      WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY veiculos_insert       ON public.veiculos        WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));

-- ---------- UPDATE ----------
ALTER POLICY abastecimentos_update ON public.abastecimentos  USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin())) WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY bens_update           ON public.bens            USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin())) WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY cartoes_update        ON public.cartoes_credito USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin())) WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY contas_update         ON public.contas          USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin())) WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY dividas_update        ON public.dividas         USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin())) WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY fornecedores_update   ON public.fornecedores    USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin())) WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY imoveis_update        ON public.imoveis         USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin())) WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY manutencoes_update    ON public.manutencoes     USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin())) WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY transacoes_update     ON public.transacoes      USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin())) WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY trocas_gas_update     ON public.trocas_gas      USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin())) WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY veiculos_update       ON public.veiculos        USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin())) WITH CHECK (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));

-- ---------- DELETE ----------
ALTER POLICY abastecimentos_delete ON public.abastecimentos  USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY bens_delete           ON public.bens            USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY cartoes_delete        ON public.cartoes_credito USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY contas_delete         ON public.contas          USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY dividas_delete        ON public.dividas         USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY fornecedores_delete   ON public.fornecedores    USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY imoveis_delete        ON public.imoveis         USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY manutencoes_delete    ON public.manutencoes     USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY transacoes_delete     ON public.transacoes      USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY trocas_gas_delete     ON public.trocas_gas      USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));
ALTER POLICY veiculos_delete       ON public.veiculos        USING (eh_membro() AND ((dono_id = (select auth.uid())) OR is_admin()));

-- ---------- Tira as funções auxiliares do alcance de anônimos ----------
-- (resolve também o advisor "Public Can Execute SECURITY DEFINER Function")
-- ATENÇÃO: no Postgres, toda função nasce com EXECUTE concedido a PUBLIC.
-- Revogar só de `anon` NÃO adianta — a concessão a PUBLIC continua valendo.
-- É preciso revogar de PUBLIC e reconceder a quem deve usar.
REVOKE EXECUTE ON FUNCTION public.is_admin()  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.eh_membro() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_admin()  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.eh_membro() TO authenticated;
