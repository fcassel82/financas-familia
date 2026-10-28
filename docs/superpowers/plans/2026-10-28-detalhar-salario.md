# Salário e adiantamento na caixa de entrada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A caixa de entrada reconhece o adiantamento (lança neutro) e o salário ("Detalhar salário" com as linhas do último contracheque, ou liga ao salário já detalhado).

**Architecture:** Novas regras em `lib/conciliacao.ts` (`sugerirAcao`); `lib/salario.ts` (puro) monta as linhas do contracheque; `/bancos` ganha a janela `DetalharSalario.tsx` e o lançamento neutro.

**Tech Stack:** Next.js 16, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-detalhar-salario-design.md`

## Global Constraints

- Reconhecer salário: receita, `normalizar(descricao)` contém `salario`. Dia ≤ 20 = adiantamento; dia > 20 = salário.
- Folha = categorias com `segue_mes_salario`.
- Soma com ±R$ 0,01; valores em centavos para comparar.
- Confirmar só quando a soma bate com o banco.
- Nada apaga lançamentos; previsões são atualizadas para `pago`.

## Review Focus

- Despesa com "salario" na descrição (ex.: "pagamento salário doméstica") não entra nas regras de salário. Teste na Task 1.
- Lançamento já ligado a outra transação do banco não entra na soma do salário já detalhado. Teste na Task 1.
- Sem contracheque anterior (nenhuma data com 2+ linhas de folha) → `montarLinhasSalario` devolve só as previsões (ou vazio) sem quebrar. Teste na Task 2.
- Adiantamento sem histórico neutro → cai em "Lançar" normal. Teste na Task 1.
- Previsão de outro mês (fora de ±5 dias) não é puxada. Teste na Task 2.

---

### Task 1: Regras em `lib/conciliacao.ts`

**Files:** Modify `lib/conciliacao.ts`, `lib/conciliacao.test.ts`.

**Interfaces — Produces:**
- `LancamentoApp` ganha `categoria_id?: string | null; subcategoria_id?: string | null; neutro?: boolean`.
- `ContextoConciliacao` ganha `categoriasFolha?: Set<string>`.
- `Sugestao` ganha `neutro?: boolean; categoria?: string` ("categoriaId|subId") `; detalharSalario?: boolean`.
- `export function ehSalario(item: ItemBanco): boolean`.

- [ ] Testes: 10 linhas de 28/08 (8 de folha/saúde criadas juntas, transferência −498,21 com `transferencia_id`, adiantamento neutro) somando 6.085,39 → `ligar` com 10 ids, crédito em 29/08; um id em `jaLigados` → não liga; crédito em 15/10 com histórico neutro de folha → `lancar`, `neutro: true`, `categoria` do histórico; sem histórico → `lancar` sem neutro; crédito em 30/09 → `detalharSalario: true`; despesa "SALARIO" → regra antiga.
- [ ] Rodar → falham. Implementar antes da regra 7 (a transferência entra na soma: os filtros de `livres` excluem transferência, então a regra usa a própria lista). Rodar → passam. Commit.

### Task 2: `lib/salario.ts`

**Files:** Create `lib/salario.ts`, `lib/salario.test.ts`.

**Interfaces — Produces:** `LinhaSalario` (spec); `montarLinhasSalario(item: ItemBanco, lancamentos: LancamentoApp[], categoriasFolha: Set<string>, transferencias: { id: string; transferencia_id: string; conta_id: string | null }[]): LinhaSalario[]` (a última lista dá a conta de destino de cada transferência); `liquidoSalario(linhas: LinhaSalario[]): number`.

- [ ] Testes: modelo = data mais recente antes do item com 2+ linhas de folha na conta e dia > 20, com todas as linhas pagas da conta nessa data (saúde e transferência com `contaDestino`); previsão pendente da mesma subcategoria até ±5 dias substitui e leva `id`; previsão a 20 dias não entra; previsão sem par entra com o valor dela; desconto neutro do adiantamento recebe o valor da receita neutra do dia 1–20 do mês do item; sem modelo → só previsões; `liquidoSalario` = 6.085,39 para as linhas de 28/08.
- [ ] Rodar → falham; implementar; passam; commit.

### Task 3: Tela `/bancos`

**Files:** Modify `app/bancos/page.tsx`; Create `app/bancos/DetalharSalario.tsx`.

- [ ] `CAMPOS_LANCAMENTO` ganha `neutro`; categorias trazem `segue_mes_salario`; `ctx.categoriasFolha`. Buscar as pontas de transferência (`id, transferencia_id, conta_id`) já vêm nos lançamentos.
- [ ] "Lançar" com `sugestao.neutro`: categoria pré-escolhida (`sugestao.categoria`), selo "neutro", insert com `neutro: true`.
- [ ] `detalharSalario`: botão "Detalhar salário" abre `DetalharSalario` (Modal) com `montarLinhasSalario`; linhas editáveis (descrição, categoria|sub, receita/desconto, valor, remover), "+ Linha", rodapé "Soma R$ X · Banco R$ Y ✓", Confirmar só quando bate.
- [ ] Confirmar: update das previsões (`valor, descricao, categoria_id, subcategoria_id, data, status: 'pago', neutro`), insert das demais, transferências em par com `transferencia_id`, `marcar(t, 'ligada', ids, 'Salário detalhado')`, mensagem "Salário lançado em N linhas.".
- [ ] lint, build; commit; push do branch `detalhar-salario`; status da Vercel; memória.
