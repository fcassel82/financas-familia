# Salário e adiantamento na caixa de entrada (Importar dos bancos)

Data: 28/10/2026 · Status: em revisão pelo Fred

## Objetivo

O crédito da CEEE chega no Itaú numa linha só, com o valor líquido. O Fred registra o contracheque em linhas:
- receitas: Salário Base, Periculosidade, Anuênio e Horas Extras;
- descontos de folha: INSS, IRRF, Adiantamento e Auxílio Refeição;
- descontos de outras categorias: Convênio Médico e Plano Odontológico;
- a contribuição para a EQTPREV, como transferência Itaú → EQTPREV.

Em 28/08 as 10 linhas somam exatamente os R$ 6.085,39 do banco. Hoje esses créditos ficam parados em "revisar", porque nenhum lançamento sozinho tem o valor líquido. Com esta mudança, a caixa de entrada:

- reconhece o **adiantamento** (por volta do dia 15) e o lança como **receita neutra** em Impostos e Descontos em Folha › Adiantamento Salarial (Quinzenal);
- reconhece o **salário** (fim do mês) e oferece **"Detalhar salário"**: as linhas do último contracheque, já preenchidas e editáveis, com a soma conferida contra o banco;
- liga ao salário já detalhado à mão quando as linhas somam o valor do banco (caso de 29/08).

## Decisões

| Pergunta | Decisão |
|---|---|
| De onde vêm os valores | Do último contracheque detalhado no app; o Fred ajusta e acrescenta linhas (Horas Extras etc.) |
| Adiantamento | Par neutro, como já é feito desde fevereiro: receita neutra no dia 15 e desconto neutro no contracheque, as duas em Impostos e Descontos em Folha › Adiantamento Salarial (Quinzenal). Sem categoria nova |
| Previsões do mês (Salário Base, Periculosidade, Anuênio pendentes) | São aproveitadas: recebem o valor e a data do banco e viram pagas, em vez de duplicar |
| Soma diferente do banco | "Confirmar" só fica ativo quando a soma bate com o banco (±R$ 0,01) |
| VR e VA (Alelo) | Fora: não passam pelo Itaú; seguem como previsões |

## Como reconhecer (`lib/conciliacao.ts`)

"Folha" = categorias com `segue_mes_salario`. O contexto ganha `categoriasFolha: Set<string>`, e os lançamentos passam a trazer `categoria_id`, `subcategoria_id` e `neutro`.

Novas regras na ordem atual, depois da regra 4 (lançamento igual) e antes da 7 (lançar):

- **Salário já detalhado → `ligar`.** Receita em conta com "salario" na descrição (sem acento, sem maiúsculas). Para cada dia até ±3 dias do crédito com pelo menos um lançamento de folha na mesma conta, junta **todos** os lançamentos pagos dessa conta naquele dia, ainda não ligados: folha, outras categorias e a ponta da transferência. Liga quando o líquido (receitas − despesas, neutros incluídos) é igual ao valor (±R$ 0,01). Motivo: "Salário já detalhado (N linhas)".
- **Adiantamento → `lancar` com `neutro: true`.** Receita com "salario" na descrição e dia do mês ≤ 20. A categoria e a subcategoria vêm do último lançamento receita neutro de folha (hoje, Impostos e Descontos em Folha › Adiantamento Salarial (Quinzenal)). Motivo: "Adiantamento salarial (neutro)". Sem histórico, cai na regra 7.
- **Salário → `lancar` com `detalharSalario: true`.** Receita com "salario" na descrição e dia > 20. Motivo: "Salário: detalhar o contracheque".

`Sugestao` ganha `neutro?: boolean`, `categoria?: string` ("categoriaId|subId") e `detalharSalario?: boolean`.

## Linhas do contracheque (`lib/salario.ts`, puro e testado)

`montarLinhasSalario(item, lancamentos, categoriasFolha): LinhaSalario[]`

- **Modelo:** a data mais recente, antes da data do item, com 2 ou mais lançamentos pagos de folha na mesma conta, dia > 20. Entram **todas** as linhas pagas da conta nessa data, com descrição, categoria, subcategoria, tipo, valor e neutro:
  - folha;
  - outras categorias (Convênio Médico, Plano Odontológico);
  - transferências: a ponta desta conta, com a conta de destino (EQTPREV).
- **Previsões:** lançamentos **pendentes** de folha na mesma conta, com data até ±5 dias do item. Cada previsão substitui a linha do modelo com a mesma subcategoria (guarda o `id` para ser atualizada), mantendo o valor do modelo. Previsão sem par no modelo entra como linha nova com o próprio valor.
- **Desconto do adiantamento:** se houver receita neutra de folha na mesma conta, entre o dia 1 e o dia 20 do mês do item, a linha de desconto neutro do modelo recebe esse valor.
- `LinhaSalario = { id?: string; descricao: string; categoria_id: string | null; subcategoria_id: string | null; tipo: 'receita' | 'despesa'; valor: number; neutro: boolean; contaDestino?: string }` (`contaDestino` = linha de transferência).
- `liquidoSalario(linhas): number` = receitas − despesas, em centavos; a transferência conta como despesa da conta.

## Tela (`/bancos`)

- Com `detalharSalario`, o item mostra o botão **"Detalhar salário"** (no lugar da escolha de categoria do "Lançar"). Ele abre uma janela com:
  - as linhas: descrição, categoria e subcategoria (lista), receita/desconto, valor e um botão para remover. A linha de transferência mostra "Transferência → EQTPREV", sem categoria;
  - "+ Linha" para acrescentar (por exemplo, Horas Extras);
  - um aviso "neutro" nas linhas neutras;
  - o rodapé "Soma R$ X · Banco R$ Y ✓", ou a diferença em alerta;
  - **Confirmar**, ativo só quando bate.
- **Ao confirmar:**
  - linhas com `id` (previsões): atualizadas com valor, descrição, categoria, data do banco e `status = 'pago'`;
  - as demais: inseridas com a data do banco, a conta da ligação, o escopo da conta, `dono_id` do usuário, `status = 'pago'` e `neutro` da linha;
  - transferência: as duas pontas com o mesmo `transferencia_id` (descrição "Transferência: Itaú → EQTPREV"), igual à tela Transferências; o id da ponta desta conta entra na ligação;
  - a transação do banco fica `ligada` com todos os ids e o motivo "Salário detalhado".
  - Mensagem: "Salário lançado em N linhas."
- Com `neutro` no "Lançar", o lançamento é inserido com `neutro = true`, e a categoria sugerida já vem escolhida. O item mostra "neutro".

## Fora deste trabalho

- Ler o PDF do contracheque.
- Previsões de VR/VA nas contas Alelo.
- Aporte patronal da EQTPREV (continua no "Atualizar saldo" da tela Investimentos).

## Como vai ser testado

- Vitest (`conciliacao`): salário já detalhado liga com as 10 linhas de 28/08 (folha, saúde, transferência e o neutro) somando R$ 6.085,39; adiantamento no dia 15 vira `lancar` neutro com a categoria do histórico; salário no dia 30 vira `detalharSalario`; despesa com "salario" não entra nas regras; linhas já ligadas não somam.
- Vitest (`salario`): modelo da data mais recente com 2+ linhas de folha, levando também as linhas de outras categorias e a transferência com o destino; previsão substitui a linha da mesma subcategoria e leva o id; previsão sem par entra; desconto do adiantamento usa o valor recebido no mês; `liquidoSalario` com neutros.
- `npm test`, `npm run build`, `npm run lint`; versão de teste com os créditos reais (16/09, 30/09 e 15/10 a lançar; 29/08 a ligar).
