-- Complemento da 20260909_exigir_perfil_de_membro.sql
--
-- O REVOKE original só revogava de `anon`, o que não tem efeito: no Postgres
-- toda função nasce com EXECUTE concedido a PUBLIC, e é essa concessão que
-- deixa o anônimo chamar. Precisa revogar de PUBLIC e reconceder explicitamente.
--
-- Efeito prático é pequeno (as duas funções devolvem `false` para anônimo, e
-- desde a migração anterior o anônimo não lê nada), mas resolve o advisor
-- "Public Can Execute SECURITY DEFINER Function".

REVOKE EXECUTE ON FUNCTION public.is_admin()  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.eh_membro() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_admin()  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.eh_membro() TO authenticated;
