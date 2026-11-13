import { somarMeses } from './formato'

/**
 * Tabela de um empréstimo no sistema SAC: a amortização é fixa (valor ÷ nº de
 * parcelas) e os juros incidem sobre o saldo, então a parcela cai todo mês.
 *
 * As parcelas já pagas usam os valores reais (em empréstimo pós-fixado, como
 * Selic + x%, a parcela muda com a taxa); as futuras são estimadas com a taxa
 * guardada na dívida, sobre o saldo que sobrou.
 */

export type ParcelaPaga = {
  numero: number
  pago_em: string
  amortizacao: number
  juros: number
  /** Parte paga por outra pessoa ou empresa (ex.: a escola), fora das contas da família */
  pago_terceiros: number
}

export type DividaSAC = {
  valor_total: number
  parcelas_total: number
  /** % ao mês */
  taxa_juros_am: number
  data_primeira_parcela: string
}

export type LinhaSAC = {
  numero: number
  vencimento: string
  amortizacao: number
  juros: number
  valor: number
  saldoDepois: number
  paga: boolean
  pagoEm: string | null
  pagoTerceiros: number
}

const centavos = (v: number) => Math.round(v * 100) / 100

/** Amortização da parcela k de uma tabela SAC ainda não paga */
function amortizacaoPrevista(d: DividaSAC, saldo: number, numero: number): number {
  if (numero >= d.parcelas_total) return saldo
  return Math.min(d.valor_total / d.parcelas_total, saldo)
}

export function tabelaSAC(d: DividaSAC, pagas: ParcelaPaga[]): LinhaSAC[] {
  const porNumero = new Map(pagas.map((p) => [p.numero, p]))
  const linhas: LinhaSAC[] = []
  let saldo = d.valor_total

  for (let numero = 1; numero <= d.parcelas_total && saldo > 0.005; numero++) {
    const paga = porNumero.get(numero)
    const amortizacao = paga ? Number(paga.amortizacao) : amortizacaoPrevista(d, saldo, numero)
    const juros = paga ? Number(paga.juros) : (saldo * d.taxa_juros_am) / 100
    saldo = Math.max(0, saldo - amortizacao)
    linhas.push({
      numero,
      vencimento: somarMeses(d.data_primeira_parcela, numero - 1),
      amortizacao: centavos(amortizacao),
      juros: centavos(juros),
      valor: centavos(amortizacao + juros),
      saldoDepois: centavos(saldo),
      paga: !!paga,
      pagoEm: paga?.pago_em ?? null,
      pagoTerceiros: paga ? Number(paga.pago_terceiros) : 0,
    })
  }
  return linhas
}

export type ResumoSAC = {
  saldoDevedor: number
  parcelasPagas: number
  jurosPagos: number
  jurosAPagar: number
  pagoPorTerceiros: number
  proxima: LinhaSAC | null
  /** Taxa implícita na última parcela paga (% ao mês), para acompanhar a Selic */
  taxaUltimaPaga: number | null
}

export function resumoSAC(d: DividaSAC, pagas: ParcelaPaga[]): ResumoSAC {
  const linhas = tabelaSAC(d, pagas)
  const pagasLinhas = linhas.filter((l) => l.paga)
  const ultima = pagasLinhas.at(-1)
  const saldoAntesUltima = ultima ? ultima.saldoDepois + ultima.amortizacao : 0
  const soma = (ls: LinhaSAC[], f: (l: LinhaSAC) => number) => centavos(ls.reduce((s, l) => s + f(l), 0))
  return {
    saldoDevedor: ultima ? ultima.saldoDepois : centavos(d.valor_total),
    parcelasPagas: pagasLinhas.length,
    jurosPagos: soma(pagasLinhas, (l) => l.juros),
    jurosAPagar: soma(linhas.filter((l) => !l.paga), (l) => l.juros),
    pagoPorTerceiros: soma(pagasLinhas, (l) => l.pagoTerceiros),
    proxima: linhas.find((l) => !l.paga) ?? null,
    taxaUltimaPaga:
      ultima && saldoAntesUltima > 0 ? Math.round((ultima.juros / saldoAntesUltima) * 1_000_000) / 10_000 : null,
  }
}

/**
 * Divide o valor real pago numa parcela: a amortização é a do SAC (não muda
 * com a taxa), o resto é juros.
 */
export function dividirPagamento(
  d: DividaSAC,
  pagas: ParcelaPaga[],
  valorPago: number
): { numero: number; amortizacao: number; juros: number; saldoAntes: number } | null {
  const proxima = tabelaSAC(d, pagas).find((l) => !l.paga)
  if (!proxima) return null
  const saldoAntes = centavos(proxima.saldoDepois + proxima.amortizacao)
  const amortizacao = proxima.numero >= d.parcelas_total ? saldoAntes : proxima.amortizacao
  return {
    numero: proxima.numero,
    amortizacao,
    juros: centavos(valorPago - amortizacao),
    saldoAntes,
  }
}
