# Migrações do Supabase

Aplicar pelo **SQL Editor** do painel do Supabase (projeto `pzajapjmulcvgzgoqncb`):
cole o conteúdo do arquivo e rode. Não precisa de CLI.

| Arquivo | O que faz | Status |
|---|---|---|
| `20260909_exigir_perfil_de_membro.sql` | Exige linha em `perfis` para ler/escrever qualquer tabela. Fecha o achado crítico #1 da auditoria. | ⏳ pendente |
| `rollback-20260909-gate-membro.sql` | Desfaz a migração acima, voltando ao gate `auth.uid() IS NOT NULL`. | só em emergência |

## Como conferir que deu certo

Depois de rodar a migração, no SQL Editor:

```sql
-- deve devolver 3 linhas, todas com tem_perfil = true
select u.email, (p.id is not null) as tem_perfil, p.papel
from auth.users u left join public.perfis p on p.id = u.id;

-- nenhuma policy pode mais depender só de estar logado:
-- esta consulta tem que voltar VAZIA
select tablename, policyname, qual
from pg_policies
where schemaname = 'public'
  and qual like '%IS NOT NULL%'
  and qual not like '%eh_membro%';
```

E na aplicação: faça logout e login de novo com cada membro da família e confirme
que os lançamentos aparecem normalmente.

## Ainda falta fazer no painel (não dá para automatizar por SQL)

**Authentication → Sign In / Providers → Email → desligar "Allow new users to sign up".**
A migração acima já neutraliza o estrago de um auto-cadastro, mas fechar o cadastro
evita que estranhos sequer criem conta no projeto.

Enquanto estiver lá: **Authentication → Policies → ligar "Leaked password protection"**,
e trocar a senha do admin (hoje é `123456`).

Para criar um membro novo depois do cadastro fechado:
Authentication → Users → *Add user*, e então inserir a linha correspondente em `perfis`
(o `id` do perfil tem que ser igual ao `id` do usuário no Auth).
