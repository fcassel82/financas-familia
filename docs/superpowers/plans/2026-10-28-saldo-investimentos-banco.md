# Saldo dos investimentos pelo banco — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A busca do Meu Pluggy traz o saldo bruto dos investimentos e a tela /bancos sugere o rendimento (diferença banco − app) para o Fred confirmar.

**Architecture:** A rota `/api/pluggy/sincronizar` grava `investimentos_banco` (só admin). `lib/saldoInvestimentos.ts` (puro) calcula as sugestões a partir das contas, dos investimentos ligados e dos lançamentos. `/bancos` liga investimentos às contas, mostra as sugestões e lança como o "Atualizar saldo".

**Tech Stack:** Next.js 16, Supabase (RLS), Vitest, Pluggy API.

**Spec:** `docs/superpowers/specs/2026-10-28-saldo-investimentos-banco-design.md`

## Global Constraints

- O Client Secret só em `lib/pluggy.ts` (`server-only`).
- Nada vira lançamento sem o clique em "Lançar rendimento".
- Saldo = campo `balance` da Pluggy (bruto).
- Migração sem DROP; teste de RLS em DO-block terminando com `raise exception`.
- Lançamento igual ao do `AtualizarSaldo` sem aporte: descrição `Rendimento`/`Desvalorização`, `movimento_investimento = 'rendimento'`, `neutro = true`, `status = 'pago'`, `escopo` e `dono_id` da conta do app.

## Review Focus

- Busca repetida não pode apagar a ligação (`conta_id`) nem o "Não acompanhar" (`acompanhar`). Verificação SQL na Task 2.
- Aplicação pendente na caixa → sugestão bloqueada, não rendimento. Teste na Task 1.
- Diferença abaixo de R$ 0,01 (ex.: 0,004 de arredondamento) não gera sugestão. Teste na Task 1.
- Investimento resgatado totalmente (TOTAL_WITHDRAWAL, saldo 0) ainda ligado conta como 0, sem quebrar a soma. Teste na Task 1.
- Conta de investimento sem nenhum investimento ligado (EQTPREV, FGTS) nunca recebe sugestão. Teste na Task 1.

---

### Task 1: `lib/saldoInvestimentos.ts`

**Files:** Create `lib/saldoInvestimentos.ts`, `lib/saldoInvestimentos.test.ts`.

**Interfaces:**
- Consumes: `saldoDaConta`, `LancamentoInvestimento` de `lib/investimentos.ts`.
- Produces:
  - `type InvestimentoBanco = { id: string; nome: string; saldo: number; data_saldo: string; situacao: string; conta_id: string | null; acompanhar: boolean }`
  - `type ContaInvestimento = { id: string; nome: string; saldo_inicial: number; saldo_conferido_em: string | null }`
  - `type SugestaoRendimento = { contaId: string; nome: string; saldoBanco: number; saldoApp: number; diferenca: number; data: string; desde: string | null; bloqueada: boolean }`
  - `sugerirRendimentos(contas: ContaInvestimento[], investimentos: InvestimentoBanco[], lancamentos: LancamentoInvestimento[], bloqueadas: Set<string>): SugestaoRendimento[]`
  - `const MOTIVO_BLOQUEIO = 'Há aplicação ou resgate deste banco esperando revisão. Confirme antes, para não contar como rendimento.'`

- [ ] **Step 1: testes** — dois investimentos (10.000 + 15.312,40) na mesma conta com app 25.000 → uma sugestão, `diferenca` 312,40, `data` = maior `data_saldo`; app maior que banco → `diferenca` negativa; banco 1.000,004 × app 1.000 → nenhuma; `acompanhar: false` fica fora da soma; conta em `bloqueadas` → `bloqueada: true`; conta sem ligados → nenhuma; TOTAL_WITHDRAWAL com saldo 0 ligado → soma igual sem ele; `desde` = `saldo_conferido_em`.
- [ ] **Step 2:** `npm test` → falha (módulo não existe).
- [ ] **Step 3:** implementar; os lançamentos de cada conta são os com `conta_id` igual.
- [ ] **Step 4:** `npm test` → passa.
- [ ] **Step 5:** commit.

### Task 2: Migração `investimentos_banco` + busca

**Files:** Create `supabase/migracoes/20261028_investimentos_banco.sql` (e linha no README da pasta); Modify `lib/pluggy.ts`, `app/api/pluggy/sincronizar/route.ts`.

**Interfaces:**
- Produces: tabela conforme o spec, RLS `is_admin()` em todas as operações (igual a `contas_banco`); `type InvestimentoPluggy = { id: string; itemId: string; type: string; subtype: string | null; name: string; balance: number | null; date: string | null; status: string | null }`; `listarInvestimentos(itemId: string): Promise<InvestimentoPluggy[]>` (segue `page`/`totalPages`, teto `MAXIMO_PAGINAS`).

- [ ] **Step 1:** `apply_migration`; DO-block: membro não-admin lê 0 linhas e não insere; admin insere; termina com `raise exception`.
- [ ] **Step 2:** `listarInvestimentos` em `lib/pluggy.ts`.
- [ ] **Step 3:** na rota, por conexão, depois das contas: upsert de `id, item_id, nome, tipo, subtipo, saldo (balance ?? 0), data_saldo (dataLocal(date) ou hoje), situacao, atualizado_em` com `onConflict: 'id'` — sem `conta_id`/`acompanhar` no payload. Erro vai para `erros`. Resposta ganha `investimentos`.
- [ ] **Step 4:** verificação SQL: inserir linha de teste com `conta_id` e `acompanhar=false`, repetir o upsert do mesmo formato e ver que os dois campos ficaram (dentro de DO-block com rollback).
- [ ] **Step 5:** `npx tsc --noEmit`, `npm run build`; commit.

### Task 3: Tela /bancos

**Files:** Modify `app/bancos/page.tsx`; Create `app/bancos/SaldosInvestimentos.tsx`.

**Interfaces:**
- Consumes: Task 1 (`sugerirRendimentos`, `MOTIVO_BLOQUEIO`), tabela da Task 2, `CAMPOS_LANCAMENTO_INVESTIMENTO`.

- [ ] **Step 1:** carregar `investimentos_banco`, contas `tipo = 'investimento'` (com `saldo_inicial, saldo_conferido_em, escopo, dono_id`) e os lançamentos delas (`buscarTudo`).
- [ ] **Step 2:** "Ligar contas": investimentos sem `conta_id`, com `acompanhar`, e não (TOTAL_WITHDRAWAL com saldo 0); select com as contas de investimento + "Não acompanhar"; sugestão pelo nome (`instituicao`/nome da conta contido no nome da conexão, como `sugestaoContaApp`). Salvar junto com o "Salvar ligações".
- [ ] **Step 3:** `bloqueadas` = `contaDestino` das transações em "revisar" cuja ação atual (escolhida ou sugerida) é `transferencia`.
- [ ] **Step 4:** `SaldosInvestimentos` acima da lista "A revisar": textos do spec (`saldo no banco em dd/mm`, `no app`, `desde dd/mm`, `Rendimento de`/`Desvalorização de`), botão "Lançar rendimento" ou `MOTIVO_BLOQUEIO`. Ao lançar: insert como em Global Constraints com `data` da sugestão, update `contas.saldo_conferido_em`, recarregar, mensagem "Rendimento lançado.".
- [ ] **Step 5:** `npm run lint`, `npm run build`; commit.

### Task 4: Investimentos + versão de teste

**Files:** Modify `app/investimentos/page.tsx`.

- [ ] **Step 1:** buscar `investimentos_banco.conta_id` (só admin lê; para os outros vem vazio, sem erro) e mostrar "Saldo vem do banco" nas contas ligadas.
- [ ] **Step 2:** `npm test`, `npm run lint`, `npm run build`; commit; push do branch `saldo-investimentos`; esperar o status da Vercel.
- [ ] **Step 3:** atualizar a memória do projeto.
