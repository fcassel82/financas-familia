# Importar dos bancos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Caixa de entrada das transações do Meu Pluggy com sugestão de ação e conciliação com notas fiscais.

**Architecture:** Busca no servidor (`/api/pluggy/sincronizar`, token do admin, `lib/pluggy.ts`) grava em `transacoes_banco`; `lib/conciliacao.ts` (puro) decide a ação sugerida; a tela `/bancos` executa a ação com a sessão do usuário. Notas fiscais ganham tabela própria e os itens apontam para ela.

**Tech Stack:** Next.js 16, Supabase (RLS), Vitest, Pluggy API.

**Spec:** `docs/superpowers/specs/2026-10-26-bancos-pluggy-design.md`

## Global Constraints

- O Client Secret só em `lib/pluggy.ts` (`server-only`); nenhuma resposta da API repassa a chave.
- Nada vira lançamento sem o clique em Confirmar.
- Migrações sem DROP (o MCP recusa); testes de RLS em DO-block com `raise exception` no fim.
- Valores: `valor` sempre positivo; o tipo diz receita/despesa.

## Review Focus

- Mesma transação do banco em duas buscas — não duplica nem volta para "revisar" (on conflict do nothing). Teste na Task 3 (verificação SQL).
- "REND PAGO APLIC AUT MAIS" — rendimento, não transferência. Teste na Task 2.
- Lançamento do app usado para ligar uma transação não pode ligar outra. Teste na Task 2.
- Itens de duas notas do mesmo dia (minutos diferentes) — não somam juntos. Teste na Task 2.
- Compra parcelada 3/10 no cartão com lançamento parcelado no app — liga, não lança de novo. Teste na Task 2.

---

### Task 1: Migração (notas_fiscais, nota_fiscal_id, contas_banco, transacoes_banco) + teste de acesso
- [ ] SQL conforme o spec; `apply_migration`; arquivo em `supabase/migracoes/`; DO-block de acesso; advisors; commit.

### Task 2: `lib/conciliacao.ts`
**Produces:** `tipoDaTransacao(contaTipo, amount, type, descricao): { tipo; pagamentoCartao }`; `sugerirAcao(item, ctx): Sugestao` com `Sugestao = { acao: 'ligar'|'lancar'|'transferencia'|'ignorar'; motivo: string; lancamentos?: string[]; diferenca?: number; contaDestino?: string; origem?: string; detalharNota?: boolean }`; `sugestaoContaApp(nomeBanco, contas, cartoes)`.
- [ ] Testes do Review Focus + regras 1–7 → falham → implementar → passam; commit.

### Task 3: `POST /api/pluggy/sincronizar`
- [ ] Rota (admin), upsert de contas mantendo a ligação, busca incremental, insert sem sobrescrever, `ultima_busca`; build; commit.

### Task 4: Tela `/bancos` + menu
- [ ] Ligar contas, Buscar agora, lista com ações, confirmar e confirmar em lote; build/lint; commit.

### Task 5: Início (busca automática diária + aviso)
- [ ] Chamada em segundo plano (localStorage com a data) e contagem; commit.

### Task 6: Importar — notas fiscais e "Detalhar com nota fiscal"
- [ ] Criar `notas_fiscais` antes dos itens; `?caixa=` preenche e liga; comparação de valores; commit.

### Task 7: Limpeza e versão de teste
- [ ] Remover `/conferir-bancos` e a rota de conferência; teste visual com dados de exemplo (desfeito); push do branch.
