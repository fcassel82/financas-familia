# Pendências de classificação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela `/pendencias` com sugestões (1 a 3) de conta/cartão e de categoria tiradas do histórico, mais a importação de nota fiscal exigindo conta no pagamento em dinheiro.

**Architecture:** Pontuação pura em `lib/sugestoes.ts` (testada); a página carrega o histórico com `buscarTudo`, calcula as sugestões no navegador e grava com `update` em `transacoes` (as regras de acesso já limitam a dono/administrador).

**Tech Stack:** Next.js 16, Supabase JS, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-25-pendencias-design.md`

## Global Constraints

- Pontos e textos exatamente como no spec; máximo de 3 sugestões, só com pontos > 0.
- Contas/cartões inativos nunca são sugeridos; contas de investimento não entram na reserva.
- Nada é gravado sem o toque em Salvar.

## Review Focus

- Descrição só com números ou pontuação ("123") — normaliza para vazio e não casa com tudo; sem sugestão por descrição. Teste na Task 1.
- "EBN*SPOTIFY" e "EBN         *SPOTIFY" — mesma descrição normalizada. Teste na Task 1.
- Histórico com conta inativa — não sugerida. Teste na Task 1.
- Comerciante curto ("MP*…" → "mp") — ignorado (menos de 3 letras). Teste na Task 1.
- Lançamento de outra pessoa (membro) — sem botões, com aviso. Verificado na Task 2 (visual).

---

### Task 1: `lib/sugestoes.ts`
**Files:** Create `lib/sugestoes.ts`, `lib/sugestoes.test.ts`
**Produces:** `normalizarDescricao(d: string): string`; `comerciante(d: string): string | null`; `pareceCartao(d: string): boolean`; `type Historico = { descricao; tipo; dono_id; conta_id; cartao_id; categoria_id; subcategoria_id }`; `sugerirOrigem(alvo, historico, contas: {id,nome,tipo,ativo}[], cartoes: {id,nome,ativo}[]): SugestaoOrigem[]` (`{ tipo: 'conta'|'cartao'; id; nome; motivo; pontos }`); `sugerirCategoria(alvo, historico, categorias: {id,nome,tipo}[], subcategorias: {id,nome,categoria_id}[]): SugestaoCategoria[]` (`{ categoria_id; subcategoria_id: string|null; nome; motivo; pontos }`).
- [ ] Testes (Review Focus + ordenação por pontos + máximo 3 + dicionário para "ERVA MATE") → falham → implementar → passam. Commit.

### Task 2: Tela `/pendencias`, menu e aviso no Início
**Files:** Create `app/pendencias/page.tsx`; Modify `components/AppShell.tsx` (item "Pendências" em Ajustes, ícone `IconeAlerta`), `app/page.tsx` (aviso com contagem).
- [ ] Implementar conforme o spec (abas, sugestões, "Outra…", aplicar aos iguais, aviso de fatura paga, item sem permissão, mensagens). Build/lint. Commit.

### Task 3: Importação exige conta no dinheiro
**Files:** Modify `app/importar/page.tsx`.
- [ ] Contas com `tipo`; "Dinheiro" mostra a lista (carteiras primeiro, a primeira já escolhida ao tocar em Dinheiro); `meioPagamentoValido` exige conta; grava `conta_id`. Build/lint. Commit.

### Task 4: Verificação e versão de teste
- [ ] Teste visual com dados de exemplo (desfeito), push do branch, link de teste para o Fred.
