# Pagamento de fatura na caixa de entrada (Importar dos bancos)

Data: 28/10/2026 · Status: em revisão pelo Fred

## Problema

O pagamento da fatura do cartão chega da conta corrente pelo Open Finance:
- "Pagamento de fatura" na conta do Nubank;
- "Débito automático Fatura Uniclass Signature" no Itaú;
- "Pagamento de boleto BANCO C6 S.A." no Itaú.

No app, a fatura é um lançamento próprio ("Fatura C6 — Outubro de 2026", com `fatura_cartao_id`). Ele fica pendente e, ao ser pago, recebe a conta e a data. Esse lançamento tira o valor do saldo da conta, mas não conta como despesa, porque as compras já contam no cartão.

Hoje a caixa de entrada:
- **ignora** "Pagamento de fatura" e "Débito automático Fatura…". Com isso, a fatura pendente nunca vira paga e o saldo da conta fica acima do real (Itaú: R$ 4.915,67 em 13/10);
- sugere **lançar como despesa nova** o "Pagamento de boleto BANCO C6 S.A.". Com isso, o pagamento conta duas vezes.

## Decisões

| Pergunta | Decisão |
|---|---|
| Fatura já paga no app com o mesmo valor | Só liga, sem mudar nada |
| Fatura pendente | Paga com o valor do banco, a conta e a data do débito |
| Compras do cartão no app não somam o valor do banco | **Trava**: mostra quanto falta e só libera quando bater (±R$ 0,01) |
| Débito já ignorado como pagamento de fatura | Volta para "revisar" para passar pela regra nova |

## Como reconhecer (`lib/conciliacao.ts`)

`ehPagamentoDeFatura(item)`: despesa em conta (BANK) e uma destas condições:
- "fatura" na descrição; ou
- "boleto" na descrição, com o apelido de um banco de cartão (C6, Itaú, Nubank); ou
- `categoria_banco` = "Credit card payment", com o apelido de um banco de cartão.

**Qual cartão:** o apelido na descrição (tabela `APELIDOS_DE_BANCO`, que ganha `uniclass|signature|personnalite` → itau) aponta o cartão cujo nome tem o mesmo apelido. Sem apelido, servem os cartões com `conta_pagamento_id` igual à conta do débito.

**Qual fatura:** lançamentos com `fatura_cartao_id` desses cartões, vencimento (ou data) até ±15 dias do débito, e ainda não ligados a outra transação do banco:
1. paga, com o mesmo valor (±R$ 0,01) → `ligar` ("Fatura C6 de setembro, já paga");
2. senão, a pendente mais próxima do vencimento → `pagar`.

Sem fatura encontrada → `ignorar` como hoje, com o motivo "Pagamento de fatura (fatura não está no app)".

**Trava (`pagar`):**
- `compras` = soma, no app, das compras do cartão naquela fatura: despesas − estornos, com `cartao_id` do cartão, fora transferência e fatura;
- a fatura é a do `competenciaDaCompra(data, fechamento, vencimento)` igual ao mês de `fatura_competencia`;
- `diferenca = valor do banco − compras`; `bloqueada = |diferenca| > R$ 0,01`.

`Sugestao` ganha `acao: 'pagar'`, `fatura?: string` (id), `cartao?: string` (nome), `competencia?: string`, `compras?: number`, `bloqueada?: boolean`.

O contexto ganha `cartoes: { id, nome, dia_fechamento, dia_vencimento, conta_pagamento_id }[]`. Os lançamentos já trazem `cartao_id`; passam a trazer também `fatura_competencia` e `data_vencimento`.

## Tela (`/bancos`)

- Nova ação **"Pagar fatura"** no item. Ela mostra "Fatura C6 de outubro: compras no app R$ 40,90 · banco R$ 148,52".
- Bloqueada: "Faltam R$ 107,62 em compras do C6 nesta fatura. Confirme as compras desse cartão aqui na caixa; o pagamento libera quando bater." Se as compras passarem do valor: "As compras do C6 nesta fatura somam R$ X a mais que o pago." O Confirmar fica desativado.
- **Ao confirmar:** a fatura recebe `status = 'pago'`, `conta_id` da ligação, `data` = data do débito e `valor` = valor do banco. A transação do banco fica `ligada` à fatura, com o motivo "Fatura paga".
- A lista é recalculada a cada confirmação. Confirmar uma compra do cartão libera o pagamento na hora.

## Dados

Uma vez, via SQL: `transacoes_banco` em contas BANK com `situacao = 'ignorada'` e `motivo = 'Pagamento de fatura'` voltam para `revisar` (motivo e `revisado_em` limpos). Hoje é só o de 13/10. Nada é apagado.

## Fora deste trabalho

- Fatura sem lançamento no app (cartão sem dia de fechamento/vencimento, como o Mercado Pago Gisa): segue "ignorar".
- Pagamento parcial da fatura.

## Como vai ser testado

- Vitest (`conciliacao`):
  - "Pagamento de boleto BANCO C6 S.A." com fatura C6 paga de mesmo valor → `ligar`;
  - "Débito automático Fatura Uniclass Signature" → cartão Itaú Visa;
  - "Pagamento de fatura" na conta do Nubank → cartão pela `conta_pagamento_id`;
  - pendente com compras que batem → `pagar` sem bloqueio;
  - pendente com compras menores → `bloqueada` com a diferença;
  - fatura já ligada a outra transação não é reaproveitada;
  - sem fatura → `ignorar`;
  - boleto de outra empresa ("VERO") → regras comuns.
- `npm test`, `npm run build`, `npm run lint`; versão de teste com os débitos reais:
  - 08/09, 11/09 e 11/09 ligam;
  - os de outubro ficam travados até as compras baterem.
