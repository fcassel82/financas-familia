# Pendências de classificação

Data: 25/10/2026 · Status: aprovado pelo Fred no chat

## Objetivo

Listar os lançamentos pagos **sem conta nem cartão** (95 em 25/10) e os **sem categoria** (41), sugerir de 1 a 3 opções com base no histórico do banco e deixar o Fred escolher e corrigir, um a um ou vários iguais de uma vez. Nada muda sem a escolha dele. Também evitar novas pendências na importação de nota fiscal.

## Quais lançamentos entram

- **Sem conta ou cartão:** `status = pago`, `conta_id` e `cartao_id` nulos, sem transferência e sem `fatura_cartao_id`.
- **Sem categoria:** `categoria_id` nulo, sem transferência, sem `fatura_cartao_id` e não neutro.

## Sugestões (de 1 a 3, cada uma com o motivo)

Antes de comparar, a descrição é normalizada: sem acento, minúsculas, sem números e com a pontuação trocada por espaço. Assim "EBN*SPOTIFY" e "EBN   *SPOTIFY" ficam iguais. O **comerciante** é o que vem antes do "*" (sem espaços) ou, sem "*", a primeira palavra (pelo menos 3 letras).

**Conta ou cartão**, usando os lançamentos do mesmo tipo que já têm conta ou cartão:

| Sinal | Pontos |
|---|---|
| Mesma descrição normalizada | 3 por lançamento |
| Mesmo comerciante | 2 por lançamento |
| Descrição com jeito de compra no cartão ("*" ou parcela "1/2"): cartões de quem lançou, pela proporção de uso | até 1 |
| Reserva: contas e cartões de quem lançou, pela proporção de uso (sem contas de investimento) | até 0,5 |

**Categoria e subcategoria**, usando os lançamentos do mesmo tipo que já têm categoria:

| Sinal | Pontos |
|---|---|
| Mesma descrição normalizada | 3 por lançamento |
| Mesmo comerciante | 2 por lançamento |
| Dicionário de produtos (`lib/categorizarProduto.ts`), só despesa | 1,5 |
| Reserva: pares categoria/subcategoria mais usados nesse tipo, pela proporção | até 0,5 |

Ficam as 3 opções com mais pontos. Só entram contas e cartões ativos. O motivo mostrado é o do sinal mais forte, por exemplo "Mesma descrição: 3 vezes", "Mesmo comerciante (mercadolivre): 5 vezes", "Compra com jeito de cartão", "Mais usado por quem lançou" ou "Pelo nome do produto".

## Tela `/pendencias` (menu Ajustes, "Pendências")

- Duas abas com a contagem: "Sem conta ou cartão (N)" e "Sem categoria (N)".
- Cada lançamento mostra descrição, data, valor (e a categoria ou a conta que já tiver). Abaixo vêm as sugestões como botões, cada um com o motivo, e "Outra…", que abre a lista completa. Tocar numa opção só seleciona; **Salvar** grava.
- Quando houver outros pendentes com a mesma descrição normalizada na mesma aba, aparece a caixa "Aplicar também aos outros N iguais" (marcada). Ao salvar, todos recebem a mesma escolha.
- Aviso de fatura: ao escolher um cartão para uma compra cuja fatura (`competenciaDaCompra`) já está registrada como paga, a tela mostra "Esta compra passa a constar na fatura de <mês> do <cartão>, já paga; o valor pago não muda." A tela de Faturas só cria cobranças automáticas para os últimos 2 meses, então compras antigas não geram faturas vencidas.
- Quem não é dono do lançamento nem administrador vê o item com o aviso "Só quem lançou ou o administrador pode corrigir", sem botões.
- Ao salvar: o item sai da lista e aparece "Corrigido." (ou "Corrigidos N lançamentos."). Se der erro: "Não foi possível salvar. Tente novamente."
- Lista vazia: "Nenhuma pendência. Todos os lançamentos têm conta e categoria."

## Início

Quando houver pendências, aparece um aviso: "N lançamentos precisam de conta ou categoria", com link para `/pendencias`.

## Importação de nota fiscal (e extrato)

A opção de pagamento "Dinheiro" passa a exigir uma conta (lista com as contas do tipo carteira primeiro, já escolhida a primeira carteira). O lançamento é gravado nessa conta e o saldo dela passa a refletir o gasto.

## Fora deste trabalho

- Classificação 50/30/20 das subcategorias (item separado).
- Criar ou registrar faturas automaticamente.

## Como vai ser testado

- Testes automáticos (Vitest) da normalização, do comerciante, do "jeito de cartão" e da pontuação das sugestões de conta/cartão e de categoria.
- `npm test`, `npm run build`, `npm run lint`.
- Teste visual com dados de exemplo (alteração temporária, desfeita depois).
- Versão de teste antes de publicar.
