# Mês do salário só para a folha de pagamento

Data: 27/10/2026 · Status: aprovado pelo Fred no chat

## Regra

- Lançamentos de uma categoria marcada como **"Segue o mês do salário"** contam para o mês seguinte a partir do dia 26 (mês de competência, como antes). Exemplo: o salário de 28/04 é de maio.
- **Todo o resto segue o mês do calendário.** Uma compra em 29/04 é de abril.
- Vêm marcadas: **Salário e Renda Principal**, **Impostos e Descontos em Folha** e **Benefícios**. O salário e os descontos da folha (INSS, IRRF…) são lançados juntos e precisam ficar no mesmo mês, para a renda líquida bater.
- A marcação fica na tela Categorias, por categoria (só o administrador altera).

## Banco

`categorias.segue_mes_salario boolean not null default false`, com `true` nas três categorias acima.

## Cálculo (`lib/mesSalario.ts`, puro e testado)

- `mesDoLancamento(data, categoriaId, categoriasSalario)`: `chaveCompetencia(data)` se a categoria estiver marcada; senão `data.slice(0, 7)`.
- `janelaDosMeses(primeiro, ultimo)`: do dia 26 do mês anterior ao `primeiro` até o último dia do `ultimo`. É o intervalo a buscar no banco; depois o filtro pelo mês fica com `mesDoLancamento`.

## Telas

| Tela | Antes | Agora |
|---|---|---|
| Início | mês de competência de hoje, datas 26→25 | mês do calendário de hoje; busca a janela e filtra por `mesDoLancamento` (frase, régua, últimos lançamentos) |
| Lançamentos | mês 26→25 | idem, com o mês do calendário ao abrir |
| Relatórios | meses 26→25 | meses pelo `mesDoLancamento`; período "Entre datas" continua por data pura |
| Calculadora 50/30/20 | `chaveCompetencia` em tudo | `mesDoLancamento` |
| Investimentos | aplicações e histórico 26→25 | mês do calendário (não é folha) |
| Resumo | filtro por datas | novo parâmetro `meses` (lista de "aaaa-mm"): entra o lançamento cujo `mesDoLancamento` está na lista; a média por mês usa a quantidade de meses |
| Extrato, Faturas | calendário / ciclo do cartão | sem mudança |

O texto do Início "Mês de competência: …" passa a ser "Salário e descontos da folha que caem a partir do dia 26 contam para o mês seguinte."

## Testes

- Vitest: `mesDoLancamento` (despesa comum em 29/04 → abril; salário em 28/04 → maio; desconto de folha em 28/04 → maio), `janelaDosMeses`, Resumo com `meses`.
- `npm test`, `npm run build`, `npm run lint`; versão de teste antes de publicar.
