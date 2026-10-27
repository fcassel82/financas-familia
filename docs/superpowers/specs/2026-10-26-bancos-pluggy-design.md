# Importar dos bancos (Meu Pluggy) com caixa de entrada e conciliação de notas fiscais

Data: 26/10/2026 · Status: aprovado pelo Fred no chat

## Objetivo

Trazer automaticamente as transações das 4 conexões do Meu Pluggy (Nubank, C6, Banrisul, Itaú: 8 contas e cartões) para uma **caixa de entrada**. Nada vira lançamento sem o Fred confirmar. O app sugere a ação certa para cada transação: ligar ao lançamento que já existe (inclusive aos itens de uma nota fiscal), ignorar pagamento de fatura, registrar transferência entre contas próprias ou lançar com categoria sugerida pelo histórico.

## Decisões

| Pergunta | Decisão |
|---|---|
| Como importar | Caixa de entrada para revisar (nada entra sem confirmação) |
| Quando buscar | Ao abrir o app como administrador, no máximo 1 vez por dia, e pelo botão "Buscar agora". Usa o login da pessoa; nenhuma chave mestra do Supabase na Vercel |
| Primeira busca | Últimos 60 dias; depois, a partir da última busca menos 5 dias (a Pluggy atualiza 1 vez por dia) |
| Notas fiscais | Cada nota importada vira um registro (`notas_fiscais`) e os itens apontam para ele; transação do banco com o valor pago da nota liga à nota inteira |

A conferência mostrou que a categoria da Pluggy erra com frequência: salário da CEEE como "Electricity", débito automático de fatura como "Automatic investment". Ela serve só como pista para reconhecer transferências; a categoria sugerida vem do histórico (`lib/sugestoes.ts`).

## Banco de dados

**`notas_fiscais`:** `id` uuid, `loja`, `cnpj`, `data` date, `valor_pago` numeric, `desconto` numeric, `quantidade_itens` int, `conta_id`, `cartao_id`, `escopo` ('familiar'|'pessoal'), `dono_id`, `criado_em`. As regras de acesso são iguais às de `contas`: membro vê familiar, o próprio pessoal ou tudo se for administrador; altera o dono ou o administrador.

**`transacoes.nota_fiscal_id`:** uuid → `notas_fiscais` (on delete set null), com índice.

**`contas_banco`** (só administrador, todas as operações): `id` text (id da conta na Pluggy), `item_id`, `nome`, `tipo` ('BANK'|'CREDIT'), `subtipo`, `numero`, `saldo`, `conta_id` → contas, `cartao_id` → cartoes_credito (no máximo um dos dois), `ultima_busca` timestamptz, `criado_em`.

**`transacoes_banco`** (só administrador, todas as operações): `id` text (id da transação na Pluggy), `conta_banco_id` → contas_banco, `data` date, `descricao`, `valor` numeric (> 0), `tipo` ('receita'|'despesa'), `pagamento_cartao` boolean, `categoria_banco`, `comerciante`, `parcela`, `parcelas`, `situacao` ('revisar'|'lancada'|'ligada'|'ignorada', padrão 'revisar'), `lancamentos` uuid[] (lançamentos criados ou ligados), `motivo` text, `criado_em`, `revisado_em`.

## Busca (`POST /api/pluggy/sincronizar`)

- Exige o token de um administrador. O cliente Supabase usa o token da pessoa, então as regras de acesso valem.
- Para cada conexão: lista as contas e faz upsert em `contas_banco` (atualiza nome, número e saldo; **mantém** a ligação com a conta do app).
- Para cada conta: busca as transações de `de` até hoje. `de` = 60 dias atrás na primeira vez; depois, `ultima_busca` − 5 dias. Ignora as de status `PENDING`. Insere em `transacoes_banco` **sem sobrescrever** as que já existem (`on conflict do nothing`).
- Sinal e tipo:
  - Conta (BANK): `CREDIT` = receita e `DEBIT` = despesa.
  - Cartão (CREDIT): valor > 0 = despesa (compra). Valor < 0 = pagamento da fatura quando a descrição tem "pagamento", "pgto" ou "pag fatura" (`pagamento_cartao = true`); fora isso, é estorno (receita).
- Resposta: `{ novas, contas }`.

## Sugestão de ação (`lib/conciliacao.ts`, puro e testado)

Por ordem; vale a primeira que bater.

1. **Pagamento de fatura** → `ignorar`, motivo "pagamento de fatura". Vale quando `pagamento_cartao`, ou quando é despesa em conta e a descrição tem "fatura".
2. **Rendimento da conta** → `lancar`. Vale para receita com "rend", "rendimento" ou "juros" na descrição. Vem antes da transferência porque "REND PAGO APLIC" contém "aplic".
3. **Transferência** → `transferencia`. Vale quando a descrição tem "resgate", "aplic", "aplicação" ou "cofrinho", ou quando a categoria do banco é "Investments", "Automatic investment", "Same person transfer" ou "Transfer - same ownership".
   - A outra conta sugerida é a conta de investimento cujo nome contém o nome da conta ligada (Itaú → Itaú Investimento); se não houver, a primeira conta de investimento.
   - Direção: despesa sai da conta ligada para a outra; receita entra na conta ligada vinda da outra.
4. **Lançamento igual no app** → `ligar`. Mesmo tipo, mesmo valor (centavos), data até ±2 dias, mesma conta ou cartão da ligação (ou lançamento sem conta), lançamento ainda não ligado. Compras parceladas no cartão: lançamento do mesmo cartão com `parcela_total = parcelas`, mesmo valor e data até ±40 dias.
5. **Nota fiscal registrada** → `ligar`, com os itens da nota. `valor_pago` igual (±R$ 0,01), data até ±2 dias, itens ainda não ligados.
6. **Itens de nota antigos** → `ligar`, com os itens. Despesas do mesmo dia, sem `nota_fiscal_id`, sem conta ou com a conta ou cartão da ligação, criadas no mesmo minuto (`criado_em`), 2 ou mais itens, soma até R$ 0,50 do valor. A tela mostra a diferença.
7. **Demais** → `lancar`, com até 3 categorias de `sugerirCategoria`. Em despesa, também a opção "Detalhar com nota fiscal".

## Tela "Importar dos bancos" (`/bancos`, menu Ajustes)

- **Ligar contas** (aparece enquanto houver conta do banco sem ligação): cada conta do banco ganha uma lista de contas e cartões do app, com sugestão pelo nome (C6 BANK → C6, BANRISUL → Banrisul, itau → Itaú, Nu → NuBank Fred). Botão "Salvar ligações".
- **"Buscar agora"** e "Última busca: dd/mm hh:mm".
- **Lista "A revisar"** por conta: data, descrição, valor e a ação sugerida (com o motivo), que pode ser trocada para Lançar, Ligar a existente, Transferência ou Ignorar. Lançar mostra as categorias sugeridas e "Outra…". Transferência mostra a outra conta. Botão "Confirmar".
- **"Confirmar todas as já no app"**: confirma de uma vez as que estão com ação `ligar`.
- **Efeitos ao confirmar:**
  - **Ligar:** os lançamentos sem conta ou cartão recebem a conta ou o cartão da ligação; a transação do banco fica `ligada`, com os ids.
  - **Lançar:** insere 1 lançamento (`status` pago, escopo da conta do app, `dono_id` do usuário, parcela/parcelas quando houver, categoria escolhida ou nenhuma, que aí vai para as Pendências); a transação fica `lancada`.
  - **Transferência:** insere as duas pontas com o mesmo `transferencia_id`, igual à tela Transferências. Se a outra ponta também estiver na caixa (outra conta ligada, tipo oposto, mesmo valor, até ±2 dias), ela fica `ligada` aos mesmos ids. A transação fica `lancada`.
  - **Ignorar:** fica `ignorada`, com o motivo.
- **Mensagens:** "Confirmado.", "Confirmadas N transações.", "Não foi possível confirmar. Tente novamente."
- **Vazio:** "Nada para revisar. A próxima busca traz o que for novo."

## Início

- Se a pessoa é administradora e a última busca registrada neste aparelho não é de hoje, chama `/api/pluggy/sincronizar` em segundo plano.
- Aviso "N transações dos bancos para revisar" com link para `/bancos`, quando N > 0.

## Nota fiscal (Importar)

- Ao salvar uma nota (formato nfce), cria antes a linha em `notas_fiscais` (loja, CNPJ, data de emissão ou a data da tela, `valor_pago` = valor pago da nota ou, sem ele, a soma dos itens; desconto, quantidade, conta ou cartão, escopo, dono) e grava os itens com `nota_fiscal_id`.
- **"Detalhar com nota fiscal"** abre `/importar?caixa=<id>` com data, meio de pagamento e conta ou cartão preenchidos e o valor esperado. Depois de salvar, a transação do banco fica `ligada` aos itens. A tela mostra "Nota R$ x / Banco R$ y ✓" ou a diferença.

## Fora deste trabalho

- Investimentos pela API (`/investments`).
- Marcar automaticamente a fatura como paga a partir do débito automático.
- Contas da Gisa (outro CPF no Meu Pluggy).

## Como vai ser testado

- Vitest: tipo e sinal (conta e cartão), pagamento de fatura, rendimento antes de transferência, transferência com conta sugerida e direção, ligar por valor/data, parcelas, nota registrada, itens antigos por soma e minuto, item já ligado não reaproveitado.
- Banco: DO-block com rollback mostrando que um membro não lê `contas_banco` nem `transacoes_banco`, e que `notas_fiscais` segue o escopo.
- `npm test`, `npm run build`, `npm run lint`; versão de teste com os dados reais do Fred antes de publicar.
- A tela de conferência (`/conferir-bancos`) e a sua rota saem quando a caixa de entrada entrar.
