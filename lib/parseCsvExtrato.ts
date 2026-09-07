import { somarMeses } from './formato'
import { parseData, parseValor } from './parseExtrato'
import type { LancamentoOfx } from './parseOfx'

export type ModoValorCsv = 'sinal' | 'despesa' | 'receita' | 'fatura_cartao'

export type MapeamentoCsv = {
  colData: string
  colDescricao: string
  colValor: string
  modo: ModoValorCsv
  /**
   * Coluna opcional com o número da parcela no formato do banco ("9/12",
   * "3/3", "Única"). Quando presente, corrige a data de cada parcela em vez
   * de usar a "data de compra" (fixa) repetida em toda fatura em que a
   * parcela aparece — ver parcelaDaCelula().
   */
  colParcela?: string
}

/**
 * Lê "9/12" → {numero: 9, total: 12}. "Única", vazio ou formato não
 * reconhecido contam como parcela única (não desloca a data).
 */
function parcelaDaCelula(bruto: string | undefined): { numero: number; total: number } | null {
  const texto = (bruto ?? '').trim()
  if (!texto) return null
  const m = texto.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (!m) return null
  const numero = parseInt(m[1], 10)
  const total = parseInt(m[2], 10)
  if (!Number.isFinite(numero) || !Number.isFinite(total) || total <= 1) return null
  return { numero, total }
}

/**
 * Converte linhas de um CSV genérico (colunas escolhidas pela pessoa) no
 * mesmo formato usado para lançamentos vindos de OFX, para reaproveitar a
 * tela de conciliação já existente.
 */
export function linhasCsvParaLancamentos(
  linhas: Record<string, string>[],
  mapeamento: MapeamentoCsv
): LancamentoOfx[] {
  const { colData, colDescricao, colValor, modo, colParcela } = mapeamento

  const lancamentos: LancamentoOfx[] = []
  for (const linha of linhas) {
    const dataCompra = parseData(linha[colData])
    const bruto = parseValor(linha[colValor])
    if (!dataCompra || !Number.isFinite(bruto) || bruto === 0) continue

    const tipo: 'receita' | 'despesa' =
      modo === 'despesa'
        ? 'despesa'
        : modo === 'receita'
          ? 'receita'
          : modo === 'fatura_cartao'
            ? bruto < 0
              ? 'receita' // estorno/crédito na fatura
              : 'despesa'
            : bruto < 0
              ? 'despesa'
              : 'receita'

    const parcela = colParcela ? parcelaDaCelula(linha[colParcela]) : null
    // A "data de compra" do banco não muda entre faturas — para a 2ª parcela
    // em diante, a data real da cobrança é a de compra + (N-1) meses, senão
    // toda parcela cai no mesmo mês e vira duplicata ao reconciliar.
    const data = parcela && parcela.numero > 1 ? somarMeses(dataCompra, parcela.numero - 1) : dataCompra

    lancamentos.push({
      data,
      descricao: (linha[colDescricao] ?? '').trim() || 'Lançamento importado',
      valor: Math.abs(bruto),
      tipo,
      // CSV não traz um identificador único de banco, então não dá pra usar
      // FITID como no OFX — a conciliação usa só data/valor/tipo
      idBanco: '',
      parcelaNumero: parcela?.numero,
      parcelaTotal: parcela?.total,
    })
  }
  return lancamentos
}
