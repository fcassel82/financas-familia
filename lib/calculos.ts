import { diasAte } from './formato'

// ============================================================
// Depreciação de bens
// ============================================================

export type BemParaDepreciar = {
  valor_aquisicao: number
  data_aquisicao: string
  vida_util_anos: number | null
  valor_residual: number
}

export type Depreciacao = {
  /** Quanto o bem vale hoje, pela depreciação linear */
  valorAtual: number
  /** Quanto já se perdeu desde a compra */
  perdido: number
  /** 0 a 100 — quanto da vida útil já passou */
  percentualDepreciado: number
  anosDeUso: number
  /** Verdadeiro quando a vida útil já terminou */
  totalmenteDepreciado: boolean
}

/**
 * Depreciação linear: o bem perde valor de forma constante ao longo da vida
 * útil, até parar no valor residual. Sem vida útil informada, o bem não
 * deprecia e continua valendo o preço de compra.
 */
export function calcularDepreciacao(bem: BemParaDepreciar): Depreciacao {
  const valorCompra = Number(bem.valor_aquisicao)
  const residual = Number(bem.valor_residual ?? 0)
  const anosDeUso = Math.max(0, -diasAte(bem.data_aquisicao) / 365.25)

  if (!bem.vida_util_anos || bem.vida_util_anos <= 0) {
    return {
      valorAtual: valorCompra,
      perdido: 0,
      percentualDepreciado: 0,
      anosDeUso,
      totalmenteDepreciado: false,
    }
  }

  const fracaoUsada = Math.min(1, anosDeUso / bem.vida_util_anos)
  const depreciavel = Math.max(0, valorCompra - residual)
  const perdido = depreciavel * fracaoUsada

  return {
    valorAtual: Math.max(residual, valorCompra - perdido),
    perdido,
    percentualDepreciado: fracaoUsada * 100,
    anosDeUso,
    totalmenteDepreciado: fracaoUsada >= 1,
  }
}

// ============================================================
// Consumo de combustível
// ============================================================

export type AbastecimentoParaCalculo = {
  id: string
  data: string
  odometro: number
  litros: number
  valor_total: number
  tanque_cheio: boolean
}

export type ComConsumo = {
  /** km rodados desde o abastecimento anterior */
  kmRodados: number | null
  /** km por litro no trecho; só é confiável entre dois tanques cheios */
  consumo: number | null
  precoLitro: number
}

/**
 * Calcula o consumo entre abastecimentos.
 *
 * O método usado é o "tanque cheio a tanque cheio": os litros de um
 * abastecimento completo são exatamente o que foi gasto para rodar desde o
 * abastecimento cheio anterior. Por isso o consumo só aparece quando ambos os
 * abastecimentos encheram o tanque — completar pela metade não permite saber
 * quanto de fato foi consumido.
 */
export function calcularConsumo<T extends AbastecimentoParaCalculo>(
  abastecimentos: T[]
): (T & ComConsumo)[] {
  // Ordena do mais antigo para o mais novo, que é como o odômetro cresce
  const ordenados = [...abastecimentos].sort(
    (a, b) => a.data.localeCompare(b.data) || Number(a.odometro) - Number(b.odometro)
  )

  const resultado: (T & ComConsumo)[] = []
  let ultimoCheio: T | null = null

  for (const a of ordenados) {
    const odometro = Number(a.odometro)
    const litros = Number(a.litros)
    const precoLitro = litros > 0 ? Number(a.valor_total) / litros : 0

    let kmRodados: number | null = null
    let consumo: number | null = null

    if (ultimoCheio) {
      const distancia = odometro - Number(ultimoCheio.odometro)
      if (distancia > 0) {
        kmRodados = distancia
        if (a.tanque_cheio) consumo = distancia / litros
      }
    }

    resultado.push({ ...a, kmRodados, consumo, precoLitro })

    if (a.tanque_cheio) ultimoCheio = a
  }

  // Devolve do mais recente para o mais antigo, que é como a tela lista
  return resultado.reverse()
}

// ============================================================
// Duração do botijão de gás
// ============================================================

export type TrocaGas = { id: string; data: string; valor: number }

export type ComDuracao = {
  /** Dias que o botijão anterior durou até esta troca */
  diasDuracao: number | null
  /** Custo por dia do botijão anterior */
  custoDia: number | null
}

/**
 * Cada troca marca o fim do botijão anterior. A duração é a distância até a
 * troca anterior, e o custo por dia usa o valor do botijão que acabou.
 *
 * Genérico para preservar os campos extras de quem chama (fornecedor,
 * observações etc.) em vez de reduzi-los ao mínimo usado no cálculo.
 */
export function calcularDuracaoGas<T extends TrocaGas>(trocas: T[]): (T & ComDuracao)[] {
  const ordenadas = [...trocas].sort((a, b) => a.data.localeCompare(b.data))

  const resultado: (T & ComDuracao)[] = ordenadas.map((troca, i) => {
    const anterior = i > 0 ? ordenadas[i - 1] : null
    if (!anterior) return { ...troca, diasDuracao: null, custoDia: null }

    const dias = Math.round(
      (new Date(troca.data + 'T00:00:00').getTime() -
        new Date(anterior.data + 'T00:00:00').getTime()) /
        86_400_000
    )

    return {
      ...troca,
      diasDuracao: dias > 0 ? dias : null,
      custoDia: dias > 0 ? Number(anterior.valor) / dias : null,
    }
  })

  return resultado.reverse()
}
