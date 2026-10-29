/**
 * Caixa de entrada dos bancos: decide a ação sugerida para cada transação que
 * veio da Pluggy. As regras e a ordem estão em
 * docs/superpowers/specs/2026-10-26-bancos-pluggy-design.md; vale a primeira
 * que bater. Nada aqui grava: a tela executa o que a pessoa confirmar.
 *
 * Imports relativos de propósito: o Vitest testa este arquivo sem o alias "@/".
 */
import { normalizar } from './formato'
import { competenciaDaCompra } from './faturaCartao'

export type ItemBanco = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: 'receita' | 'despesa'
  pagamento_cartao: boolean
  categoria_banco: string | null
  parcela: number | null
  parcelas: number | null
  /** Conta do banco e a ligação com o app */
  contaBanco: { tipo: string; conta_id: string | null; cartao_id: string | null }
}

export type LancamentoApp = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  status: string
  conta_id: string | null
  cartao_id: string | null
  parcela_total: number | null
  nota_fiscal_id: string | null
  transferencia_id: string | null
  fatura_cartao_id: string | null
  criado_em: string
  categoria_id?: string | null
  subcategoria_id?: string | null
  neutro?: boolean
  fatura_competencia?: string | null
  data_vencimento?: string | null
}

export type CartaoConciliacao = {
  id: string
  nome: string
  dia_fechamento: number | null
  dia_vencimento: number | null
  conta_pagamento_id: string | null
}

export type NotaApp = { id: string; data: string; valor_pago: number }

export type ContextoConciliacao = {
  lancamentos: LancamentoApp[]
  notas: NotaApp[]
  contas: { id: string; nome: string; tipo: string }[]
  nomeDaContaApp: (id: string) => string
  /** Lançamentos já ligados a outra transação do banco (não podem ligar de novo) */
  jaLigados: Set<string>
  /** Categorias que seguem o mês do salário (folha de pagamento) */
  categoriasFolha?: Set<string>
  cartoes?: CartaoConciliacao[]
}

export type Sugestao = {
  acao: 'ligar' | 'lancar' | 'transferencia' | 'ignorar' | 'pagar'
  motivo: string
  lancamentos?: string[]
  /** Itens de nota somados: banco − soma dos itens */
  diferenca?: number
  /** Transferência: de onde sai e para onde vai (contas do app) */
  origem?: string
  contaDestino?: string
  detalharNota?: boolean
  /** Lançar como neutro (adiantamento salarial), com a categoria já escolhida ("categoriaId|subId") */
  neutro?: boolean
  categoria?: string
  /** Crédito do salário: abrir as linhas do contracheque */
  detalharSalario?: boolean
  /** Pagar fatura: lançamento da fatura, cartão, mês e quanto as compras somam no app */
  fatura?: string
  cartao?: string
  competencia?: string
  compras?: number
  bloqueada?: boolean
}

/** Débito da conta que paga a fatura de um cartão ("Pagamento de boleto BANCO C6 S.A.") */
export function ehPagamentoDeFatura(item: ItemBanco): boolean {
  if (item.contaBanco.tipo === 'CREDIT' || item.tipo !== 'despesa') return false
  if (/fatura/i.test(item.descricao)) return true
  const comBanco = !!apelidoDoBanco(item.descricao)
  return (
    comBanco &&
    (/boleto/i.test(item.descricao) || (item.categoria_banco ?? '') === 'Credit card payment')
  )
}

function apelidoDoBanco(texto: string): string | undefined {
  const nome = normalizar(texto)
  return APELIDOS_DE_BANCO.find(([padrao]) => padrao.test(nome))?.[1]
}

/** Fatura do app que este débito paga (spec 2026-10-28-pagar-fatura) */
function sugerirPagamentoDeFatura(item: ItemBanco, ctx: ContextoConciliacao): Sugestao | null {
  const todos = ctx.cartoes ?? []
  const apelido = apelidoDoBanco(item.descricao)
  const cartoes = apelido
    ? todos.filter((c) => apelidoDoBanco(c.nome) === apelido)
    : todos.filter((c) => c.conta_pagamento_id && c.conta_pagamento_id === item.contaBanco.conta_id)
  const ids = new Set(cartoes.map((c) => c.id))
  const alvo = centavos(item.valor)
  const faturas = ctx.lancamentos
    .filter(
      (l) =>
        l.fatura_cartao_id &&
        ids.has(l.fatura_cartao_id) &&
        !ctx.jaLigados.has(l.id) &&
        diasEntre(l.data_vencimento ?? l.data, item.data) <= 15
    )
    .sort(
      (a, b) =>
        diasEntre(a.data_vencimento ?? a.data, item.data) -
        diasEntre(b.data_vencimento ?? b.data, item.data)
    )

  const paga = faturas.find((l) => l.status === 'pago' && centavos(l.valor) === alvo)
  if (paga) return { acao: 'ligar', motivo: `${paga.descricao}, já paga`, lancamentos: [paga.id] }

  const pendente = faturas.find((l) => l.status === 'pendente')
  if (!pendente) return null
  const cartao = cartoes.find((c) => c.id === pendente.fatura_cartao_id)!
  const competencia = (pendente.fatura_competencia ?? pendente.data).slice(0, 7)
  // Mesma conta da tela Faturas: compras pagas do cartão que caem nesta fatura
  let compras = 0
  if (cartao.dia_fechamento && cartao.dia_vencimento) {
    for (const l of ctx.lancamentos) {
      if (l.cartao_id !== cartao.id || l.status !== 'pago') continue
      if (competenciaDaCompra(l.data, cartao.dia_fechamento, cartao.dia_vencimento) !== competencia)
        continue
      compras += (l.tipo === 'despesa' ? 1 : -1) * centavos(l.valor)
    }
  }
  return {
    acao: 'pagar',
    motivo: `Paga a ${pendente.descricao}`,
    fatura: pendente.id,
    cartao: cartao.nome,
    competencia,
    compras: compras / 100,
    bloqueada: Math.abs(alvo - compras) > 1,
  }
}

/** Crédito da folha numa conta ("Salário COMPANHIA ESTADUAL…") */
export function ehSalario(item: ItemBanco): boolean {
  return (
    item.tipo === 'receita' &&
    item.contaBanco.tipo !== 'CREDIT' &&
    normalizar(item.descricao).includes('salario')
  )
}

/**
 * Linha de fatura que repete dinheiro já lançado: o saldo da fatura anterior
 * paga com atraso ("Valor pendente do mês anterior") ou o crédito do pagamento.
 * As compras dessas faturas já estão no app; juros, multa e IOF continuam valendo.
 */
export function linhaDeSaldoAnterior(descricao: string): boolean {
  return /valor pendente|saldo (da fatura )?anterior|pagamento recebido/i.test(descricao)
}

const CATEGORIAS_DE_TRANSFERENCIA = new Set([
  'investments',
  'automatic investment',
  'same person transfer',
  'transfer - same ownership',
])

const centavos = (v: number) => Math.round(Math.abs(Number(v)) * 100)

function diasEntre(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
}

export function tipoDaTransacao(
  contaTipo: string,
  amount: number,
  type: string,
  descricao: string
): { tipo: 'receita' | 'despesa'; pagamentoCartao: boolean } {
  if (contaTipo === 'CREDIT') {
    // No cartão a compra vem positiva; negativo é pagamento da fatura ou estorno
    if (amount > 0) return { tipo: 'despesa', pagamentoCartao: false }
    return { tipo: 'receita', pagamentoCartao: /pagamento|pgto|pag\.? fatura/i.test(descricao) }
  }
  if (type === 'CREDIT') return { tipo: 'receita', pagamentoCartao: false }
  if (type === 'DEBIT') return { tipo: 'despesa', pagamentoCartao: false }
  return { tipo: amount >= 0 ? 'receita' : 'despesa', pagamentoCartao: false }
}

/** O lançamento do app é da mesma conta/cartão da ligação (ou ainda não tem nenhuma) */
function mesmaOrigem(l: LancamentoApp, item: ItemBanco): 'mesma' | 'sem' | null {
  const { conta_id, cartao_id } = item.contaBanco
  if (!l.conta_id && !l.cartao_id) return 'sem'
  if (conta_id && l.conta_id === conta_id) return 'mesma'
  if (cartao_id && l.cartao_id === cartao_id) return 'mesma'
  return null
}

function contaDeInvestimento(item: ItemBanco, ctx: ContextoConciliacao): string | undefined {
  const investimentos = ctx.contas.filter((c) => c.tipo === 'investimento')
  const nomeLigada = item.contaBanco.conta_id
    ? normalizar(ctx.nomeDaContaApp(item.contaBanco.conta_id))
    : ''
  const doMesmoBanco = nomeLigada
    ? investimentos.find((c) => normalizar(c.nome).includes(nomeLigada))
    : undefined
  return (doMesmoBanco ?? investimentos[0])?.id
}

export function sugerirAcao(item: ItemBanco, ctx: ContextoConciliacao): Sugestao {
  const desc = item.descricao

  // 0. Saldo da fatura anterior no cartão: repetiria as compras do mês passado
  if (item.contaBanco.tipo === 'CREDIT' && linhaDeSaldoAnterior(desc)) {
    return { acao: 'ignorar', motivo: 'Saldo da fatura anterior' }
  }

  // 1. Pagamento de fatura. No cartão, o crédito do pagamento não é compra nem estorno;
  // na conta, o débito paga (ou liga) a fatura do app, que tira do saldo sem ser despesa
  if (item.contaBanco.tipo === 'CREDIT' && item.pagamento_cartao) {
    return { acao: 'ignorar', motivo: 'Pagamento de fatura' }
  }
  if (ehPagamentoDeFatura(item)) {
    const sugestao = sugerirPagamentoDeFatura(item, ctx)
    if (sugestao) return sugestao
    // Boleto de banco sem fatura no app pode ser outra conta: segue as regras comuns
    if (/fatura/i.test(desc)) {
      return { acao: 'ignorar', motivo: 'Pagamento de fatura (fatura não está no app)' }
    }
  }

  // 2. Rendimento da conta ("REND PAGO APLIC" não é aplicação)
  if (item.tipo === 'receita' && /\brend\b|rendimentos?|juros/i.test(desc)) {
    return { acao: 'lancar', motivo: 'Rendimento da conta', detalharNota: false }
  }

  // 3. Transferência entre contas próprias (aplicação e resgate)
  const categoria = (item.categoria_banco ?? '').toLowerCase()
  // "aplic" sozinho ou aplicação, mas não "aplicativo"
  if (
    /\bresgates?\b|\baplic(a[cç][aã]o|a[cç][oõ]es)?\b|cofrinhos?/i.test(desc) ||
    CATEGORIAS_DE_TRANSFERENCIA.has(categoria)
  ) {
    const outra = contaDeInvestimento(item, ctx)
    const ligada = item.contaBanco.conta_id ?? undefined
    if (outra && ligada) {
      return item.tipo === 'despesa'
        ? {
            acao: 'transferencia',
            motivo: 'Aplicação entre contas próprias',
            origem: ligada,
            contaDestino: outra,
          }
        : {
            acao: 'transferencia',
            motivo: 'Resgate entre contas próprias',
            origem: outra,
            contaDestino: ligada,
          }
    }
  }

  const livres = ctx.lancamentos.filter(
    (l) =>
      !ctx.jaLigados.has(l.id) &&
      l.status === 'pago' &&
      !l.transferencia_id &&
      !l.fatura_cartao_id &&
      l.tipo === item.tipo
  )
  const alvo = centavos(item.valor)

  // 4a. Parcela do cartão: o app guarda a compra parcelada com parcela_total
  if (item.parcelas && item.parcelas > 1 && item.contaBanco.cartao_id) {
    const parcela = livres.find(
      (l) =>
        l.cartao_id === item.contaBanco.cartao_id &&
        l.parcela_total === item.parcelas &&
        centavos(l.valor) === alvo &&
        diasEntre(l.data, item.data) <= 40
    )
    if (parcela)
      return { acao: 'ligar', motivo: 'Parcela já lançada no app', lancamentos: [parcela.id] }
  }

  // 4b. Lançamento igual: mesmo valor, até 2 dias, de preferência na mesma conta
  const iguais = livres
    .map((l) => ({ l, origem: mesmaOrigem(l, item), dias: diasEntre(l.data, item.data) }))
    .filter((c) => c.origem && c.dias <= 2 && centavos(c.l.valor) === alvo)
    .sort((a, b) => Number(a.origem === 'sem') - Number(b.origem === 'sem') || a.dias - b.dias)
  if (iguais[0]) {
    return {
      acao: 'ligar',
      motivo: `Já no app: ${iguais[0].l.descricao}`,
      lancamentos: [iguais[0].l.id],
    }
  }

  if (item.tipo === 'despesa') {
    // 5. Nota fiscal registrada: o banco mostra o valor pago da nota
    for (const nota of ctx.notas) {
      if (Math.abs(centavos(nota.valor_pago) - alvo) > 1 || diasEntre(nota.data, item.data) > 2)
        continue
      const itens = livres.filter((l) => l.nota_fiscal_id === nota.id).map((l) => l.id)
      if (itens.length > 0) {
        return {
          acao: 'ligar',
          motivo: `Nota fiscal com ${itens.length} itens`,
          lancamentos: itens,
        }
      }
    }

    // 6. Itens de nota antigos (antes do registro de notas): mesmo dia, mesmo minuto de importação
    const grupos = new Map<string, LancamentoApp[]>()
    for (const l of livres) {
      if (l.nota_fiscal_id || l.data !== item.data || !mesmaOrigem(l, item)) continue
      const minuto = l.criado_em.slice(0, 16)
      grupos.set(minuto, [...(grupos.get(minuto) ?? []), l])
    }
    let melhor: { itens: LancamentoApp[]; diferenca: number } | null = null
    for (const itens of grupos.values()) {
      if (itens.length < 2) continue
      const soma = itens.reduce((s, l) => s + centavos(l.valor), 0)
      const diferenca = (alvo - soma) / 100
      if (
        Math.abs(diferenca) <= 0.5 &&
        (!melhor || Math.abs(diferenca) < Math.abs(melhor.diferenca))
      ) {
        melhor = { itens, diferenca }
      }
    }
    if (melhor) {
      return {
        acao: 'ligar',
        motivo: `${melhor.itens.length} itens de nota do mesmo dia`,
        lancamentos: melhor.itens.map((l) => l.id),
        diferenca: melhor.diferenca,
      }
    }
  }

  // 6b. Salário e adiantamento (spec 2026-10-28-detalhar-salario)
  if (ehSalario(item)) {
    const folha = ctx.categoriasFolha ?? new Set<string>()
    const daConta = ctx.lancamentos.filter(
      (l) =>
        l.conta_id === item.contaBanco.conta_id &&
        l.status === 'pago' &&
        !l.fatura_cartao_id &&
        !ctx.jaLigados.has(l.id)
    )
    const ehFolha = (l: LancamentoApp) => !!l.categoria_id && folha.has(l.categoria_id)

    // Contracheque já lançado à mão: tudo da conta no dia (folha, saúde, previdência,
    // adiantamento neutro) dá o líquido que o banco creditou
    const dias = [
      ...new Set(
        daConta.filter((l) => ehFolha(l) && diasEntre(l.data, item.data) <= 3).map((l) => l.data)
      ),
    ].sort((a, b) => diasEntre(a, item.data) - diasEntre(b, item.data))
    for (const dia of dias) {
      const linhas = daConta.filter((l) => l.data === dia)
      const liquido = linhas.reduce(
        (s, l) => s + (l.tipo === 'receita' ? 1 : -1) * centavos(l.valor),
        0
      )
      if (Math.abs(liquido - alvo) <= 1) {
        return {
          acao: 'ligar',
          motivo: `Salário já detalhado (${linhas.length} linhas)`,
          lancamentos: linhas.map((l) => l.id),
        }
      }
    }

    if (Number(item.data.slice(8, 10)) > 20) {
      return { acao: 'lancar', motivo: 'Salário: detalhar o contracheque', detalharSalario: true }
    }
    // Adiantamento: par neutro, com a categoria do último adiantamento recebido
    const ultimo = ctx.lancamentos
      .filter((l) => l.tipo === 'receita' && l.neutro && ehFolha(l))
      .sort((a, b) => b.data.localeCompare(a.data))[0]
    if (ultimo) {
      return {
        acao: 'lancar',
        motivo: 'Adiantamento salarial (neutro)',
        neutro: true,
        categoria: `${ultimo.categoria_id}|${ultimo.subcategoria_id ?? ''}`,
      }
    }
  }

  // 7. Lançar (com categoria sugerida pelo histórico, na tela)
  return { acao: 'lancar', motivo: 'Novo no app', detalharNota: item.tipo === 'despesa' }
}

const APELIDOS_DE_BANCO: [RegExp, string][] = [
  [/nu pagamentos|nubank|\bnu\b/, 'nubank'],
  [/itau|uniclass|personnalite|signature/, 'itau'],
  [/\bc6\b/, 'c6'],
  [/banrisul/, 'banrisul'],
  [/mercado pago/, 'mercado pago'],
  [/\binter\b/, 'inter'],
]

/** Sugere a conta ("conta:id") ou o cartão ("cartao:id") do app para uma conta do banco */
export function sugestaoContaApp(
  nomeBanco: string,
  tipoBanco: string,
  contas: { id: string; nome: string; tipo: string }[],
  cartoes: { id: string; nome: string }[],
  titular = ''
): string | null {
  const nome = normalizar(nomeBanco)
  const apelido = APELIDOS_DE_BANCO.find(([padrao]) => padrao.test(nome))?.[1]
  if (!apelido) return null
  const opcoes =
    tipoBanco === 'CREDIT'
      ? cartoes.map((c) => ({ chave: `cartao:${c.id}`, nome: normalizar(c.nome) }))
      : contas
          .filter((c) => c.tipo !== 'investimento' && c.tipo !== 'carteira')
          .map((c) => ({ chave: `conta:${c.id}`, nome: normalizar(c.nome) }))
  const candidatas = opcoes.filter((o) => o.nome.includes(apelido))
  const doTitular = titular
    ? candidatas.find((o) => o.nome.includes(normalizar(titular)))
    : undefined
  return (doTitular ?? candidatas[0])?.chave ?? null
}
