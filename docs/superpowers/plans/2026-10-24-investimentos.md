# Investimentos a partir das contas de investimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a tela Investimentos (tabela vazia) por uma tela baseada nas contas do tipo investimento, com "Atualizar saldo", e marcar rendimento/aporte da empresa como neutros para não contarem como renda do mês.

**Architecture:** Uma coluna nova `transacoes.movimento_investimento` (sempre com `neutro = true`, garantido por CHECK) e `contas.saldo_conferido_em`. As contas puras de saldo, histórico e atualização ficam em `lib/investimentos.ts`, testadas com Vitest; a tela e a janela usam essas funções. As outras telas já ignoram os neutros e não mudam.

**Tech Stack:** Next.js 16 (App Router, client components), Supabase JS, Tailwind v4, Vitest (novo, só para `lib/`).

**Spec:** `docs/superpowers/specs/2026-10-24-investimentos-design.md`

## Global Constraints

- Banco único (produção): migração por `apply_migration` do Supabase e cópia em `supabase/migracoes/20261024_movimento_investimento.sql`, com a linha na tabela do README.
- Marcações válidas: `'rendimento'`, `'aporte_empresa'`. Lançamento marcado tem `neutro = true` (CHECK `transacoes_movimento_investimento_neutro`).
- "Desatualizado": mais de **35 dias** desde a última atualização, ou nunca atualizado.
- Mês = mês de competência (`chaveCompetencia`, dia de corte 26); "rendeu no ano" = ano do calendário pela `data`.
- Saldo da conta = `saldo_inicial` + lançamentos `status = 'pago'` (receita soma, despesa subtrai), igual ao Início.
- Textos da UI exatamente como no spec ("Atualizar saldo", "Saldo atualizado.", "O saldo já confere, nada a lançar", "Não foi possível atualizar o saldo. Tente novamente.", "Rendimento e aporte da empresa não contam como renda do mês.", "Nenhum investimento cadastrado. …").
- Nada é apagado: a tabela `investimentos` fica no banco, só sai do código.
- Cores só pelos tokens do tema (`text-receita`, `text-despesa`, `text-alerta`, `bg-primaria`, `text-sobre-cor`…), nunca hex fixo.

## Review Focus

- Centavos em ponto flutuante (ex.: 1000,10 − 999,90) — o rendimento sai arredondado a 2 casas, nunca 0,20000000000007. Teste em Task 2.
- Saldo do banco menor que o do app — gera desvalorização (`tipo = 'despesa'`, valor positivo). Teste em Task 2.
- Aporte maior que a diferença de saldo — rendimento negativo (desvalorização) mais o aporte. Teste em Task 2.
- Lançamento no dia 26 ou depois — entra no mês de competência seguinte no histórico. Teste em Task 2.
- Lançamento pendente na conta de investimento — fora do saldo e do histórico. Teste em Task 2.

---

### Task 1: Migração do banco e reclassificação

**Files:**
- Create: `supabase/migracoes/20261024_movimento_investimento.sql`
- Modify: `supabase/migracoes/README.md` (linha nova na tabela, status ✅ aplicada)

**Interfaces:**
- Produces: `transacoes.movimento_investimento text null`, `contas.saldo_conferido_em date null`.

- [ ] **Step 1:** Escrever o SQL do spec (seção "Banco de dados") mais a reclassificação por id:
  - `aporte_empresa`: `a4851c36-b1c7-44f8-81a6-99004aff70c3`, `5b5407de-7bbe-440a-9a7b-06e32f31df12`, `ee9b73c8-d4b2-41b1-b598-d5c2dc559bb8`, `1a0acf24-81c9-4b30-8e8e-e50ee7ad6183`
  - `rendimento`: `1f41945d-0677-41dc-8260-dda3ed4faa98`, `9d93540c-0067-42e4-95ca-ca1ff42bf21d`
  - Os 6 com `neutro = true` no mesmo `update`.
- [ ] **Step 2:** Antes de aplicar, guardar os saldos das 5 contas de investimento (consulta do Global Constraints).
- [ ] **Step 3:** Aplicar com `apply_migration` (nome `movimento_investimento`).
- [ ] **Step 4:** Verificar por SQL: 6 linhas marcadas e neutras; `insert` de teste marcado com `neutro = false` dentro de transação com rollback é recusado pelo CHECK; saldos das 5 contas iguais aos do Step 2; `get_advisors` de segurança sem achado novo.
- [ ] **Step 5:** Commit `Banco: marcação de rendimento/aporte da empresa e data de conferência`.

### Task 2: Contas puras dos investimentos (`lib/investimentos.ts`)

**Files:**
- Create: `lib/investimentos.ts`, `lib/investimentos.test.ts`, `vitest.config.ts`
- Modify: `package.json` (devDependency `vitest`, script `"test": "vitest run"`)

**Interfaces:**
- Consumes: `chaveCompetencia`, `deslocarMes` de `./formato` (import relativo, para o Vitest resolver sem alias).
- Produces:
  - `type MovimentoInvestimento = 'rendimento' | 'aporte_empresa'`
  - `type LancamentoInvestimento = { conta_id: string; data: string; tipo: 'receita' | 'despesa'; valor: number; status: string; transferencia_id: string | null; movimento_investimento: MovimentoInvestimento | null }`
  - `calcularAtualizacao(saldoApp: number, saldoBanco: number, aporte: number): { aporte: number; rendimento: number }` — valores arredondados a centavos; `rendimento = saldoBanco − saldoApp − aporte`.
  - `saldoDaConta(saldoInicial: number, lancs: LancamentoInvestimento[]): number` — só `status = 'pago'`.
  - `resumoDoAno(lancs, ano: number): { rendeu: number; aporteEmpresa: number }` — rendimento líquido (receita − despesa marcadas `rendimento`) e soma de `aporte_empresa`, pagos, pela `data`.
  - `historicoPorMes(lancs, mesAtual: string, meses = 12): { chave: string; aplicado: number; resgatado: number; aporteEmpresa: number; rendimento: number }[]` — do mais recente para o mais antigo, por competência, só pagos, sem meses vazios; aplicado = transferência `receita`, resgatado = transferência `despesa`.
  - `dataUltimaAtualizacao(conferidoEm: string | null, lancs): string | null` — maior entre `conferidoEm` e a `data` do último lançamento marcado.
  - `estaDesatualizado(ultima: string | null, hoje: string, dias = 35): boolean` — `true` se nula ou se `hoje − ultima > dias`.

- [ ] **Step 1: Testes que falham** (`lib/investimentos.test.ts`):
  - `calcularAtualizacao(999.9, 1000.1, 0)` → `{ aporte: 0, rendimento: 0.2 }` (exatamente `0.2`).
  - `calcularAtualizacao(21505.48, 21817.88, 0).rendimento` → `312.4`.
  - `calcularAtualizacao(1000, 950, 0).rendimento` → `-50`.
  - `calcularAtualizacao(1000, 1300, 500)` → `{ aporte: 500, rendimento: -200 }`.
  - `saldoDaConta(100, [receita pago 50, despesa pago 20, receita pendente 999])` → `130`.
  - `resumoDoAno` com rendimento receita 2026-09-01 50.63, rendimento despesa 2026-10-01 10, aporte 2026-09-18 996.42, aporte 2025-12-01 100 (ano 2026) → `{ rendeu: 40.63, aporteEmpresa: 996.42 }`.
  - `historicoPorMes` com transferência receita 2026-07-30 20000 e rendimento 2026-09-26 5 (mesAtual `'2026-10'`) → contém `{ chave: '2026-08', aplicado: 20000, … }` e `{ chave: '2026-10', rendimento: 5, … }`; nenhuma chave sem movimento; pendente ignorado.
  - `dataUltimaAtualizacao('2026-10-01', [rendimento 2026-10-05])` → `'2026-10-05'`; `(null, [])` → `null`.
  - `estaDesatualizado('2026-09-05', '2026-10-24')` → `true`; `('2026-10-01', '2026-10-24')` → `false`; `(null, …)` → `true`.
- [ ] **Step 2:** `npm test` → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar as funções acima. Diferença de dias entre ISO sem fuso (como `diasAte` em `formato.ts`); arredondar com `Math.round(x * 100) / 100`.
- [ ] **Step 4:** `npm test` → PASS; `npx tsc --noEmit` sem erros.
- [ ] **Step 5:** Commit `Investimentos: contas de saldo, histórico e atualização`.

### Task 3: Tela Investimentos e janela Atualizar saldo

**Files:**
- Modify (reescrever): `app/investimentos/page.tsx`
- Create: `app/investimentos/AtualizarSaldo.tsx`

**Interfaces:**
- Consumes: Task 2 (todas as funções), `buscarTudo`, `Modal`, `InputMoeda`, `BotaoPrimario`, `BotaoSecundario`, `CabecalhoPagina`, `EstadoVazio`, `Pagina`, `moeda`, `hojeISO`, `chaveCompetencia`, `rotuloMesCurto`, `dataBR`.
- Produces: `AtualizarSaldo({ conta: { id: string; nome: string; escopo: string }, saldoApp: number, aberto: boolean, onFechar: () => void, onSalvo: (mensagem: string) => void })`.

- [ ] **Step 1:** Página: carrega `contas` (`id, nome, instituicao, escopo, saldo_inicial, saldo_conferido_em, ativo`, `tipo = 'investimento'`, `ativo = true`) e, com `buscarTudo`, os lançamentos dessas contas (campos de `LancamentoInvestimento`). Monta resumo, cartões (saldo, "Atualizado em dd/mm" ou "Nunca atualizado", etiqueta "desatualizado", rendeu no ano, botão), histórico expansível por cartão (12 meses), linha "Neste mês vocês aplicaram … e resgataram …" com link `/calculadora-50-30-20`, botão "Novo investimento" → `/contas?novo=investimento`, estado vazio do spec. Sem checagem de admin: a regra de acesso das contas decide.
- [ ] **Step 2:** `AtualizarSaldo`: campos do spec, prévia ao digitar usando `calcularAtualizacao`, botão desativado com saldo vazio, inserts conforme o spec (descrição "Aporte da empresa" / "Rendimento" / "Desvalorização", `neutro: true`, `status: 'pago'`, `escopo` da conta, `dono_id` do usuário), depois `update contas set saldo_conferido_em` (ignorar quando 0 linhas ou erro de permissão), `onSalvo` com "Saldo atualizado." + o que foi lançado; erro de insert mantém a janela aberta com a mensagem do spec.
- [ ] **Step 3:** `npm run build` e `npm run lint` sem erros.
- [ ] **Step 4:** Commit `Investimentos: tela a partir das contas e botão Atualizar saldo`.

### Task 4: Marcação no formulário, etiqueta na lista, Patrimônio e Contas

**Files:**
- Modify: `app/lancamentos/page.tsx` (contas com `tipo`; escolha "Este lançamento é:"; neutro travado; salvar/editar `movimento_investimento`)
- Modify: `app/transacoes/page.tsx` (selecionar `movimento_investimento`; etiqueta "rendimento"/"aporte da empresa" no lugar de "neutro")
- Modify: `app/patrimonio/page.tsx` (remover busca/soma de `investimentos`; tirar "ainda com rendimento junto" e a nota do aporte patronal)
- Modify: `app/contas/page.tsx` (ler `?novo=investimento` e abrir o formulário com `tipo: 'investimento'`)

**Interfaces:**
- Consumes: `MovimentoInvestimento` de Task 2.

- [ ] **Step 1:** Implementar as quatro mudanças conforme o spec ("Marcação no formulário" e "Outras telas"). Trocar para conta não-investimento zera a marcação; gravar `movimento_investimento: null` nesse caso.
- [ ] **Step 2:** `npm test`, `npm run build`, `npm run lint` sem erros.
- [ ] **Step 3:** Commit `Lançamentos: marcação de rendimento e aporte da empresa; Patrimônio sem a tabela antiga`.

### Task 5: Verificação visual e versão de teste

- [ ] **Step 1:** Alteração temporária (não commitada) com dados de exemplo em `/investimentos` e bypass de sessão no `AppShell`; capturar celular claro/escuro e computador, incluindo a janela com rendimento, desvalorização e "já confere". Corrigir o que aparecer; desfazer a alteração temporária (`git status` limpo).
- [ ] **Step 2:** `git push -u origin investimentos`; aguardar o status da Vercel no GitHub; avisar o Fred com o link de teste (`financas-familia-git-investimentos-frd-0b2a.vercel.app`).
- [ ] **Step 3:** Publicar em `main` só depois da aprovação do Fred.
