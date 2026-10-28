/**
 * Caixa de entrada dos bancos: decide a ação sugerida para cada transação que
 * veio da Pluggy. As regras e a ordem estão em
 * docs/superpowers/specs/2026-10-26-bancos-pluggy-design.md; vale a primeira
 * que bater. Nada aqui grava: a tela executa o que a pessoa confirmar.
 *
 * Imports relativos de propósito: o Vitest testa este arquivo sem o alias "@/".
 */
import { normalizar } from './formato'

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
}

export type NotaApp = { id: string; data: string; valor_pago: number }

export type ContextoConciliacao = {
  lancamentos: LancamentoApp[]
  notas: NotaApp[]
  contas: { id: string; nome: string; tipo: string }[]
  nomeDaContaApp: (id: string) => string
  /** Lançamentos já ligados a outra transação do banco (não podem ligar de novo) */
  jaLigados: Set<string>
}

export type Sugestao = {
  acao: 'ligar' | 'lancar' | 'transferencia' | 'ignorar'
  motivo: string
  lancamentos?: string[]
  /** Itens de nota somados: banco − soma dos itens */
  diferenca?: number
  /** Transferência: de onde sai e para onde vai (contas do app) */
  origem?: string
  contaDestino?: string
  detalharNota?: boolean
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

  // 1. Pagamento de fatura: as compras já contam no cartão
  if (
    item.pagamento_cartao ||
    (item.contaBanco.tipo !== 'CREDIT' && item.tipo === 'despesa' && /fatura/i.test(desc))
  ) {
    return { acao: 'ignorar', motivo: 'Pagamento de fatura' }
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

  // 7. Lançar (com categoria sugerida pelo histórico, na tela)
  return { acao: 'lancar', motivo: 'Novo no app', detalharNota: item.tipo === 'despesa' }
}

const APELIDOS_DE_BANCO: [RegExp, string][] = [
  [/nu pagamentos|nubank|\bnu\b/, 'nubank'],
  [/itau/, 'itau'],
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
