# Resumo: tocar numa soma abre os lançamentos dela

Data: 24/10/2026 · Status: aprovado pelo Fred no chat

## Objetivo

Em todo lugar do app que mostra uma soma de um grupo (uma categoria, um mês, um grupo 50/30/20, uma conta), tocar nela abre os lançamentos que formam aquela soma. Assim dá para conferir os números e corrigir erros de classificação. A ideia vem do Patrimônio, onde tocar em "Imóveis" já abre a tela de imóveis.

## Decisões

- **Uma tela única de Resumo** (`/resumo`), aberta por todos os links. O filtro vai no endereço, então o botão voltar funciona.
- **Mesma regra de soma da tela de origem**, para os números baterem.
- **Botão Editar** em cada lançamento do Resumo. Ao salvar ou cancelar, a pessoa volta para o mesmo Resumo, já atualizado.
- Saldo de conta abre o **Extrato** daquela conta; fatura de cartão abre as **Faturas** daquele cartão; a receber e a pagar da Previsão abrem **A pagar**.

## Filtro do Resumo (parâmetros do endereço)

| Parâmetro | Valores | Efeito |
|---|---|---|
| `de`, `ate` | data ISO | Período (obrigatório) |
| `regra` | `resultado` (padrão), `503020`, `conta` | Regra de soma (abaixo) |
| `tipo` | `receita`, `despesa` | Só esse tipo |
| `categoria` | id ou `sem` | Só essa categoria (`sem` = sem categoria) |
| `subcategoria` | id ou `sem` | Só essa subcategoria |
| `categorias` | ids separados por vírgula | Qualquer uma delas (filtro múltiplo dos Relatórios) |
| `grupo` | `necessidade`, `desejo`, `investimento`, `deducao`, `sem` | Grupo 50/30/20 da subcategoria |
| `escopo` | `familiar`, `pessoal` | Só esse escopo |
| `membros` | ids separados por vírgula | Dono do lançamento (pessoal) ou familiar, como no filtro "Quem" |
| `conta` | id | Só essa conta |
| `cartao` | id | Só esse cartão |
| `movimento` | `rendimento`, `aporte_empresa`, `aplicado`, `resgatado` | Movimento dentro de uma conta de investimento |
| `titulo` | texto | Título mostrado (ex.: "Alimentação") |

**Regras de soma:**
- `resultado` (Início, Lançamentos, Relatórios): `status = pago`, sem transferência, sem pagamento agregado de fatura (`fatura_cartao_id`), sem neutro.
- `503020` (Calculadora e régua do Início): igual à Calculadora. Fica de fora o que é neutro ou pagamento agregado de fatura. Receita conta como renda bruta. Despesa entra pelo grupo da subcategoria. No grupo `investimento` entram também as aplicações, que são transferências de uma conta que não é de investimento para uma que é.
- `conta` (Investimentos, Extrato): tudo o que é pago dentro da conta, inclusive transferências e lançamentos neutros.

## Tela Resumo

- **Topo:** botão Voltar (volta à tela anterior); título (`titulo`, ou o nome da categoria ou subcategoria filtrada, ou "Lançamentos"); período ("de 26 de abr. a 25 de out."); etiquetas para os filtros ativos (Familiar/Pessoal, nome da conta ou do cartão, Receitas/Despesas, grupo).
- **Números:** total (receita soma, despesa subtrai; quando o filtro tem um só `tipo`, mostra o valor positivo na cor do tipo), quantidade de lançamentos e média por mês quando o período cobre mais de um mês de competência.
- **Divisão:** por categoria quando não há filtro de categoria; por subcategoria quando há. Cada linha mostra nome, valor e %, e abre um Resumo com o filtro a mais. "Sem categoria" e "Sem subcategoria" também aparecem.
- **Lançamentos por dia:** cabeçalho "Hoje", "Ontem" ou dia da semana, com o total do dia. Cada lançamento mostra descrição, categoria/subcategoria, conta ou cartão, valor e um botão **Editar** visível, que abre `/lancamentos?id=…&voltar=<este resumo>`.
- **Vazio:** "Nenhum lançamento encontrado para este filtro."
- **Carregando:** "Carregando..."

## Como os links aparecem

- A linha inteira pode ser tocada: nome, valor e uma setinha "›" no fim. Alvo de pelo menos 44px.
- Fatias de pizza e barras dos gráficos também abrem o Resumo.
- As cores dos valores não mudam.

## Onde entram os links

| Tela | Soma | Destino |
|---|---|---|
| Início | Entraram / saíram | Resumo do mês de competência, regra `resultado`, por tipo |
| Início | Essenciais, Qualidade de Vida, Futuro, Sem grupo | Resumo regra `503020`, por grupo |
| Início | Saldo de cada conta | `/extrato?conta=` |
| Lançamentos | Receitas, despesas, saldo do mês | Resumo do mês com a aba (escopo) e os filtros da tela |
| Relatórios | Receitas, despesas, saldo | Resumo do período e filtros da tela |
| Relatórios | Centros de custo, pizza de categorias | Resumo por categoria |
| Relatórios | Pizza de conta/cartão | Resumo por conta ou cartão |
| Relatórios | Familiar vs. Pessoal | Resumo por escopo |
| Relatórios | Barras da evolução mensal | Resumo do mês, por tipo |
| Calculadora | Renda bruta, deduções, cada grupo, Não classificado, cada subcategoria, cada mês do gráfico | Resumo regra `503020` |
| Investimentos | Rendeu, aportou (por conta e no total), aplicaram, resgataram, cada mês do histórico | Resumo regra `conta` |
| Contas | Saldo de cada conta | `/extrato?conta=` |
| Cartões | Fatura atual de cada cartão | `/faturas?cartao=` |
| Previsão | A receber, a pagar | `/contas-pagar` |

Patrimônio já tem links. Veículos, Chuveiro a gás e Dívidas mostram as próprias listas e ficam como estão.

## Editar e voltar

`/lancamentos` aceita `voltar` (um caminho interno começando com `/`, mas não com `//`). Ao salvar, apagar ou cancelar uma edição, ele volta para `voltar` em vez de `/transacoes`.

## Fora deste trabalho

- Exportar o Resumo.
- Editar vários lançamentos de uma vez.

## Como vai ser testado

- Testes automáticos (Vitest) da leitura e montagem do filtro e da filtragem por regra, com os casos de transferência, neutro, fatura agregada, aplicação no Futuro e "sem categoria".
- `npm run build`, `npm run lint` e `npm test`.
- Teste visual com dados de exemplo (alteração temporária desfeita depois).
- Versão de teste na Vercel antes de publicar.
