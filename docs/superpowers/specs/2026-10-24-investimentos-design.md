# Investimentos a partir das contas de investimento

Data: 24/10/2026 · Status: aguardando revisão do Fred

## Objetivo

A família registra cada investimento como uma **conta do tipo "investimento"** e movimenta o dinheiro por transferências a partir da conta corrente (aplicação e resgate). A tela Investimentos de hoje usa outra tabela (`investimentos`), que está vazia, e só o administrador a vê. Ela não conversa com o jeito como a família trabalha.

O novo menu Investimentos deve responder, nesta ordem de importância:

1. **Quanto temos em cada investimento e no total**, com o saldo batendo com o extrato do banco.
2. **Quanto rendeu**, separando o que foi colocado (por nós ou pela empresa) do que o dinheiro rendeu.
3. **Para onde vai o dinheiro**: aplicações e resgates de cada mês, para acompanhar a meta de 20% para o Futuro.

## Situação hoje (levantada em 17/10/2026)

- 5 contas do tipo investimento: C6 Investimento (familiar), EQTPREV, Família Previdência, Fundo de Garantia (FGTS) e Itaú Investimento (pessoais). O saldo somado no app é de R$ 242.224,64.
- Aplicações e resgates do Itaú Investimento já são transferências. O app não os conta como receita ou despesa, e a Calculadora 50/30/20 conta a aplicação como Futuro. **Isso fica como está.**
- Rendimentos, depósito do FGTS e aporte patronal da EQTPREV estão lançados como **receita comum**. Por isso eles aumentam a "renda do mês" no Início, nos Relatórios e na régua/Calculadora 50/30/20, e não contam como Futuro. Em setembro foram R$ 1.882,98.
- C6 Investimento e Família Previdência só têm o saldo inicial. Itaú Investimento nunca recebeu um lançamento de rendimento, então os saldos do app tendem a divergir do extrato.
- O cartão "Investimentos" do Patrimônio leva à tela vazia, e o Patrimônio ainda soma a tabela `investimentos`.

## Decisões tomadas

| Pergunta | Decisão |
|---|---|
| O que a tela mostra | Saldo, rendimento e aplicações/resgates, nessa ordem |
| Rendimento, FGTS e patronal contam como renda do mês? | **Não.** Aumentam só o saldo do investimento e o patrimônio |
| Como manter o saldo igual ao do banco | Botão **Atualizar saldo**: digita-se o saldo do extrato e o app lança a diferença como rendimento |
| Quem vê cada investimento | Segue o escopo da conta: familiar, todos veem; pessoal, só o dono (regras de acesso já existentes) |
| Como reconhecer rendimento e aporte da empresa | **Marcação nova no lançamento**, que obriga o lançamento a ser neutro |

## Tela Investimentos (`/investimentos`)

O nome no menu continua "Investimentos", no grupo Patrimônio.

**Resumo no topo:**
"Vocês têm **R$ total** em **N** investimentos." e, na linha de baixo, "Em **ano** renderam **R$ x** e a empresa aportou **R$ y**." (ano do calendário, pela data dos lançamentos marcados).

**Um cartão por conta de investimento ativa e visível:**
- nome e instituição;
- saldo atual (mesma conta de saldo usada no Início e no Patrimônio);
- "Atualizado em dd/mm": a data mais recente entre a última conferência gravada na conta e o último lançamento marcado. Sem nenhuma das duas, mostra "Nunca atualizado";
- etiqueta **desatualizado** (cor de alerta) quando a última atualização tiver mais de 35 dias, ou quando o investimento nunca foi atualizado;
- quanto rendeu no ano corrente;
- botão **Atualizar saldo**.

Ao tocar no cartão, ele se expande e mostra o **histórico por mês de competência** (dia 26 a 25, como no Início e na Calculadora) dos últimos 12 meses, em quatro colunas: aplicado (transferências recebidas), resgatado (transferências enviadas), aporte da empresa e rendimento (o líquido de ganhos e perdas). Meses sem movimento não aparecem.

**Mês atual** (mês de competência, como no Início): "Neste mês vocês aplicaram R$ x e resgataram R$ y", somando as transferências para e de contas de investimento, com link para a Calculadora 50/30/20.

**Botão "Novo investimento":** abre `/contas` com o formulário de nova conta já aberto e o tipo "Conta de investimento" escolhido (parâmetro `?novo=investimento`).

**Estado vazio:** "Nenhum investimento cadastrado. Cadastre uma conta do tipo investimento para acompanhar saldo e rendimento aqui." com o botão "Novo investimento".

## Atualizar saldo

Abre uma janela (o componente `Modal` já existente) com:

- **Saldo no app:** o saldo atual da conta, só para leitura.
- **Saldo no banco hoje** (obrigatório, `InputMoeda`).
- **Aporte da empresa desde a última atualização** (opcional, `InputMoeda`).
- **Data** (padrão: hoje).

A janela mostra, enquanto o usuário digita, o que vai ser lançado:

- `aporte = campo aporte (ou 0)`
- `rendimento = saldo no banco − saldo no app − aporte`
- Aporte > 0 gera o texto "aporte da empresa de R$ x".
- Rendimento > 0 gera "rendimento de R$ x". Rendimento < 0 gera "desvalorização de R$ x".
- Rendimento = 0 e sem aporte gera "O saldo já confere, nada a lançar".

**Ao confirmar ("Atualizar saldo"):**
1. Se houver aporte, insere um lançamento: conta do investimento, `tipo = receita`, `valor = aporte`, `descricao = "Aporte da empresa"`, `movimento_investimento = 'aporte_empresa'`, `neutro = true`, `status = pago`, `data` = data escolhida, `escopo` = escopo da conta, `dono_id` = usuário logado, sem categoria.
2. Se o rendimento for diferente de zero, insere um lançamento do mesmo jeito, com `movimento_investimento = 'rendimento'`. A descrição é "Rendimento" (`tipo = receita`) ou "Desvalorização" (`tipo = despesa`), e `valor = |rendimento|`.
3. Atualiza `contas.saldo_conferido_em` com a data escolhida. Se a regra de acesso não permitir, porque o usuário não é dono nem administrador, essa etapa é ignorada sem erro: a data passa a vir do último lançamento marcado.
4. Fecha a janela, recarrega a tela e mostra "Saldo atualizado." Com lançamentos criados, a mensagem também diz o que foi lançado.

**Erros:** saldo no banco vazio deixa o botão desativado. Falha ao gravar mostra "Não foi possível atualizar o saldo. Tente novamente." e mantém a janela aberta com os valores digitados.

## Marcação no formulário de lançamento (`/lancamentos`)

- O formulário passa a carregar o `tipo` das contas.
- Quando a conta escolhida é de investimento, aparece a escolha **"Este lançamento é:"** com as opções Movimento comum, Rendimento e Aporte da empresa (padrão: Movimento comum; na edição, o valor salvo).
- Rendimento ou Aporte da empresa liga o "Lançamento neutro" e o deixa travado, com o texto "Rendimento e aporte da empresa não contam como renda do mês."
- Trocar para uma conta que não é de investimento volta para Movimento comum.

**Na lista de Lançamentos (`/transacoes`)**, a etiqueta "neutro" vira "rendimento" ou "aporte da empresa" quando o lançamento tem a marcação.

## Banco de dados

Uma migração:

```sql
alter table public.transacoes
  add column movimento_investimento text
    check (movimento_investimento in ('rendimento', 'aporte_empresa'));

-- Lançamento marcado nunca pode contar como renda do mês
alter table public.transacoes
  add constraint transacoes_movimento_investimento_neutro
    check (movimento_investimento is null or neutro);

comment on column public.transacoes.movimento_investimento is
  'Dinheiro que nasce dentro de um investimento: rendimento (ganho ou perda) ou aporte da empresa (patronal, FGTS). Sempre neutro: aumenta o saldo, não a renda do mês.';

alter table public.contas add column saldo_conferido_em date;

comment on column public.contas.saldo_conferido_em is
  'Última vez que o saldo desta conta foi conferido com o extrato pelo botão Atualizar saldo.';
```

As colunas novas seguem as regras de acesso que já existem em `transacoes` e `contas`. Nenhuma regra nova é necessária.

**Reclassificação dos 6 lançamentos existentes**, aplicada na mesma migração, por `id`, depois de o Fred conferir a lista:

| Data | Conta | Descrição | Valor | Marcação |
|---|---|---|---|---|
| 01/06/2026 | EQTPREV | EQTPrev. Patronal | 425,32 | aporte_empresa |
| 01/07/2026 | EQTPREV | EQTPrev. Patronal | 1.082,47 | aporte_empresa |
| 28/08/2026 | EQTPREV | EQTPrev. Patronal | 387,41 | aporte_empresa |
| 01/09/2026 | EQTPREV | Rentabilidade | 50,63 | rendimento |
| 18/09/2026 | Fundo de Garantia (FGTS) | FGTS | 996,42 | aporte_empresa |
| 18/09/2026 | Fundo de Garantia (FGTS) | Rendimentos | 448,52 | rendimento |

Os 6 recebem `neutro = true`. A categoria atual fica como está.

**Efeito esperado:** a renda de junho a setembro cai pela soma desses valores no Início, nos Relatórios e na Calculadora. Os saldos das contas e o Patrimônio não mudam.

## Outras telas

- **Início, Relatórios, Lançamentos e Calculadora/régua 50/30/20:** nenhuma mudança de código. Todas já ignoram os lançamentos neutros.
- **Previsão e Extrato:** nenhuma mudança. Elas somam saldos, e o rendimento deve continuar entrando no saldo.
- **Patrimônio:** deixa de buscar e somar a tabela `investimentos`. O cartão "Investimentos" continua abrindo `/investimentos`. O texto "ainda com rendimento junto" e a nota sobre aporte patronal misturado saem.
- **Contas:** aceita `?novo=investimento` para abrir o formulário de nova conta com o tipo investimento já escolhido.

## Fora deste trabalho

- Apagar a tabela `investimentos`, que está vazia. Fica para a etapa de correções no banco, com confirmação.
- Rentabilidade em percentual, comparação com CDI e metas por investimento.
- Importar automaticamente o extrato do investimento.
- Alterar como aplicações e resgates são registrados.

## Como vai ser testado

1. Aplicar a migração e conferir por SQL que os 6 lançamentos ficaram marcados e neutros, que a regra recusa um lançamento marcado e não neutro, e que os saldos das 5 contas não mudaram.
2. `npm run build` e `npm run lint` sem erros.
3. Teste visual no Mac com dados de exemplo (alteração temporária, desfeita em seguida): tela com cartões, histórico aberto, janela de Atualizar saldo com os três tipos de resultado, nos modos claro e escuro e no celular e no computador.
4. Versão de teste na Vercel para o Fred usar com os dados reais: atualizar o saldo de um investimento e conferir se o Início e a Calculadora deixaram de contar os 6 lançamentos.
5. Publicar no app oficial só depois da aprovação.
