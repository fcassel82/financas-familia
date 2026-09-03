import { parseData, parseValor } from './parseExtrato'
import type { LancamentoOfx } from './parseOfx'

export type ModoValorCsv = 'sinal' | 'despesa' | 'receita'

export type MapeamentoCsv = {
  colData: string
  colDescricao: string
  colValor: string
  modo: ModoValorCsv
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
  const { colData, colDescricao, colValor, modo } = mapeamento

  const lancamentos: LancamentoOfx[] = []
  for (const linha of linhas) {
    const data = parseData(linha[colData])
    const bruto = parseValor(linha[colValor])
    if (!data || !Number.isFinite(bruto) || bruto === 0) continue

    const tipo: 'receita' | 'despesa' =
      modo === 'despesa' ? 'despesa' : modo === 'receita' ? 'receita' : bruto < 0 ? 'despesa' : 'receita'

    lancamentos.push({
      data,
      descricao: (linha[colDescricao] ?? '').trim() || 'Lançamento importado',
      valor: Math.abs(bruto),
      tipo,
      // CSV não traz um identificador único de banco, então não dá pra usar
      // FITID como no OFX — a conciliação usa só data/valor/tipo
      idBanco: '',
    })
  }
  return lancamentos
}
