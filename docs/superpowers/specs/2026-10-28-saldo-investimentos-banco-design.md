# Saldo dos investimentos pelo banco (Meu Pluggy)

Data: 28/10/2026 · Status: aprovado pelo Fred no chat

## Objetivo

O saldo dos investimentos do Itaú e do C6 chega pela busca diária do Meu Pluggy. A diferença para o saldo do app vira uma **sugestão de rendimento** em Importar dos bancos, e o Fred confirma. O Fred deixa de digitar o saldo no "Atualizar saldo" desses investimentos.

## Decisões

| Pergunta | Decisão |
|---|---|
| Lançar sozinho ou sugerir | Sugerir; nada entra sem o Fred confirmar |
| Qual saldo | Saldo bruto (campo `balance` da Pluggy), antes do IR |
| Vários investimentos do banco | Somam numa conta de investimento do app (dois CDBs e um fundo do Itaú → "Itaú Investimento") |
| Aplicações e resgates | Continuam vindo da conta corrente, como transferência, na caixa de entrada (sem mudança) |
| EQTPREV, Família Previdência, FGTS | Continuam no "Atualizar saldo" manual; não estão no Open Finance |

## Banco de dados

**`investimentos_banco`** (só administrador, todas as operações, igual a `contas_banco`):
- `id` text (id do investimento na Pluggy), `item_id` text;
- `nome`, `tipo` (FIXED_INCOME, MUTUAL_FUND…), `subtipo`;
- `saldo` numeric (bruto), `data_saldo` date, `situacao` text (ACTIVE, PENDING, TOTAL_WITHDRAWAL);
- `conta_id` uuid → `contas` (on delete set null);
- `acompanhar` boolean not null default true (false = "Não acompanhar");
- `criado_em`, `atualizado_em` timestamptz.

## Busca (`POST /api/pluggy/sincronizar`)

- Para cada conexão, além das contas: `GET /investments?itemId=…`, seguindo as páginas.
- Upsert em `investimentos_banco`, atualizando nome, tipo, saldo, `data_saldo` (data do saldo na Pluggy, no fuso de Brasília; sem ela, hoje) e situação. **Mantém** `conta_id` e `acompanhar`.
- Erro nos investimentos de uma conexão entra em `erros` e não impede o resto da busca.
- Resposta ganha `investimentos` (quantos vieram).

## Sugestão de rendimento (`lib/saldoInvestimentos.ts`, puro e testado)

`sugerirRendimentos(contas, investimentosBanco, lancamentos, bloqueadas): SugestaoRendimento[]`.

Para cada conta de investimento do app com pelo menos um investimento ligado e acompanhado:
- `saldoBanco` = soma de `saldo` dos ligados (resgatados totalmente entram com o saldo que vierem, normalmente 0);
- `saldoApp` = `saldoDaConta` (já existe em `lib/investimentos.ts`), só com os lançamentos até a `data` do saldo do banco (uma aplicação de hoje não vira desvalorização quando o saldo do banco é de ontem);
- `diferenca` = `saldoBanco − saldoApp`, arredondada em centavos;
- `data` = a maior `data_saldo` dos ligados;
- gera sugestão quando `|diferenca| ≥ 0,01`;
- `bloqueada = true` quando a conta está em `bloqueadas`, com o motivo "Há aplicação ou resgate deste banco esperando revisão. Confirme antes, para não contar como rendimento."

`bloqueadas` = contas de investimento que aparecem como `contaDestino` numa transação da caixa de entrada em "revisar" com ação sugerida ou escolhida `transferencia`.

## Tela "Importar dos bancos" (`/bancos`)

- **Ligar contas** também lista os investimentos do banco ainda sem ligação (e com `acompanhar`), com as contas de investimento do app e a opção "Não acompanhar". Sugestão pelo nome (Itaú → Itaú Investimento, C6 → C6 Investimento). Fica escondido o que tem situação TOTAL_WITHDRAWAL e saldo 0.
- **Saldos dos investimentos** (nova seção, acima da lista "A revisar"), uma linha por sugestão:
  - "Itaú Investimento · saldo no banco em 27/10: R$ 25.312,40 · no app: R$ 25.000,00";
  - "Rendimento de R$ 312,40" (ou "Desvalorização de R$ …"), com o botão **Lançar rendimento**;
  - bloqueada: o motivo no lugar do botão.
- **Ao confirmar:** mesmo efeito do "Atualizar saldo" sem aporte: 1 lançamento `Rendimento` (receita) ou `Desvalorização` (despesa), `movimento_investimento = 'rendimento'`, `neutro`, pago, na `data` da sugestão, `escopo` e `dono_id` da conta do app; e `contas.saldo_conferido_em = data`. Mensagem "Rendimento lançado.".
- A primeira sugestão de cada conta pode ser grande (rendimento acumulado desde o último "Atualizar saldo"); a linha mostra "desde dd/mm" com a última atualização.

## Investimentos

Sem mudança no cálculo. As contas ligadas a investimentos do banco mostram "Saldo vem do banco" ao lado do "Atualizar saldo" (que continua disponível para corrigir à mão).

## Fora deste trabalho

- Lançar sem confirmação.
- Transações dentro do investimento (`/investments/{id}/transactions`); aplicações e resgates seguem pela conta corrente.
- Aporte da empresa (só existe na previdência, que é manual).

## Como vai ser testado

- Vitest em `sugerirRendimentos`: soma de dois investimentos na mesma conta; diferença positiva e negativa; diferença de R$ 0,004 não sugere; "Não acompanhar" fica fora; conta com transferência pendente sai bloqueada; conta sem investimento ligado não aparece; data = maior `data_saldo`.
- Banco: DO-block com rollback mostrando que um membro não lê `investimentos_banco`.
- `npm test`, `npm run build`, `npm run lint`; versão de teste e primeira busca real para conferir se o saldo bruto da Pluggy bate com o app do banco antes de publicar.
