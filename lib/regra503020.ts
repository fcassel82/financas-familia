/**
 * Regra 50/30/20 da família: Essenciais (até 50%), Qualidade de Vida (até 30%)
 * e Futuro (20% ou mais) sobre a renda líquida do mês de competência.
 *
 * Usada pela Calculadora 50/30/20 e pela régua da tela inicial — as duas
 * precisam chegar exatamente no mesmo número.
 */

export type Grupo503020 = 'necessidade' | 'desejo' | 'investimento' | 'deducao'
export type Grupo = 'necessidade' | 'desejo' | 'investimento'

export type Subcategoria = {
  id: string
  categoria_id: string
  nome: string
  grupo_503020: Grupo503020 | null
}

export type TransacaoCalc = {
  id: string
  data: string
  valor: number
  tipo: 'receita' | 'despesa'
  escopo: string
  dono_id: string
  categoria_id: string | null
  subcategoria_id: string | null
  conta_id: string | null
  transferencia_id: string | null
  fatura_cartao_id: string | null
  neutro: boolean
}

export type Resultado = {
  rendaBruta: number
  deducoes: number
  rendaLiquida: number
  buckets: Record<Grupo, number>
  naoClassificado: number
}

export const CAMPOS_TRANSACAO_CALC =
  'id, data, valor, tipo, escopo, dono_id, categoria_id, subcategoria_id, conta_id, transferencia_id, fatura_cartao_id, neutro'

export const METAS: Record<Grupo, number> = {
  necessidade: 50,
  desejo: 30,
  investimento: 20,
}

export const ROTULO_GRUPO: Record<Grupo, string> = {
  necessidade: 'Essenciais',
  desejo: 'Qualidade de Vida',
  investimento: 'Futuro',
}

// Cores vêm do tema (globals.css), para acompanhar o modo escuro
export const COR_GRUPO: Record<Grupo, string> = {
  necessidade: 'var(--essencial)',
  desejo: 'var(--qualidade)',
  investimento: 'var(--futuro)',
}

export function calcular(
  transacoes: TransacaoCalc[],
  subcategoriaMap: Map<string, Subcategoria>,
  contaTipoMap: Map<string, string>
): Resultado {
  let rendaBruta = 0
  let deducoes = 0
  let naoClassificado = 0
  const buckets = { necessidade: 0, desejo: 0, investimento: 0 }
  const transferencias = new Map<string, TransacaoCalc[]>()

  for (const t of transacoes) {
    if (t.neutro || t.fatura_cartao_id) continue

    if (t.transferencia_id) {
      const lista = transferencias.get(t.transferencia_id) ?? []
      lista.push(t)
      transferencias.set(t.transferencia_id, lista)
      continue
    }

    if (t.tipo === 'receita') {
      rendaBruta += t.valor
      continue
    }

    const sub = t.subcategoria_id ? subcategoriaMap.get(t.subcategoria_id) : null
    const grupo = sub?.grupo_503020 ?? null
    if (grupo === 'deducao') deducoes += t.valor
    else if (grupo === 'necessidade' || grupo === 'desejo' || grupo === 'investimento')
      buckets[grupo] += t.valor
    else naoClassificado += t.valor
  }

  // Aporte para conta de investimento (ex: aplicação em Cofrinhos) conta como
  // "Investimentos e futuro" — resgate (o caminho inverso) não conta como gasto nem receita
  for (const legs of transferencias.values()) {
    const despesaLeg = legs.find((l) => l.tipo === 'despesa')
    const receitaLeg = legs.find((l) => l.tipo === 'receita')
    if (!despesaLeg || !receitaLeg) continue
    const tipoOrigem = despesaLeg.conta_id ? contaTipoMap.get(despesaLeg.conta_id) : null
    const tipoDestino = receitaLeg.conta_id ? contaTipoMap.get(receitaLeg.conta_id) : null
    if (tipoDestino === 'investimento' && tipoOrigem !== 'investimento') {
      buckets.investimento += despesaLeg.valor
    }
  }

  return { rendaBruta, deducoes, rendaLiquida: rendaBruta - deducoes, buckets, naoClassificado }
}
