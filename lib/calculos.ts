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
  /** km rodados desde o último tanque cheio (é o trecho que o consumo mede) */
  kmRodados: number | null
  /** km por litro no trecho; só é confiável entre dois tanques cheios */
  consumo: number | null
  /**
   * Litros que abasteceram o trecho medido — soma dos parciais no meio mais
   * este abastecimento. Só preenchido quando há consumo, e serve para a tela
   * calcular a média geral como (soma de km) / (soma de litros).
   */
  litrosConsumidos: number | null
  precoLitro: number
}

/**
 * Calcula o consumo entre abastecimentos.
 *
 * O método usado é o "tanque cheio a tanque cheio": entre dois tanques cheios,
 * tudo o que foi abastecido no meio é exatamente o que o carro queimou no
 * trecho. Por isso o consumo só aparece quando ambas as pontas encheram o
 * tanque — completar pela metade não fecha a conta.
 *
 * Os abastecimentos parciais no meio do trecho **contam nos litros**: ignorá-los
 * faz o km/l disparar para valores impossíveis (o KA chegou a mostrar 80 km/l
 * num trecho com 3 parciais no meio).
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
  let litrosDesdeUltimoCheio = 0

  for (const a of ordenados) {
    const odometro = Number(a.odometro)
    const litros = Number(a.litros)
    const precoLitro = litros > 0 ? Number(a.valor_total) / litros : 0

    // Este abastecimento também repõe o que foi queimado no trecho que termina
    // aqui, então entra na soma antes de dividir.
    litrosDesdeUltimoCheio += litros

    let kmRodados: number | null = null
    let consumo: number | null = null
    let litrosConsumidos: number | null = null

    if (ultimoCheio) {
      const distancia = odometro - Number(ultimoCheio.odometro)
      if (distancia > 0) {
        kmRodados = distancia
        if (a.tanque_cheio && litrosDesdeUltimoCheio > 0) {
          consumo = distancia / litrosDesdeUltimoCheio
          litrosConsumidos = litrosDesdeUltimoCheio
        }
      }
    }

    resultado.push({ ...a, kmRodados, consumo, litrosConsumidos, precoLitro })

    if (a.tanque_cheio) {
      ultimoCheio = a
      litrosDesdeUltimoCheio = 0
    }
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

// ============================================================
// Valorização de imóveis
// ============================================================

export type ImovelParaAvaliar = {
  valor_pago: number
  data_aquisicao: string
  indice_base: number | null
  valor_avaliado_manual: number | null
}

export type Avaliacao = {
  /** Quanto o imóvel vale hoje */
  valorAtual: number
  /** Diferença em reais sobre o que foi pago */
  valorizacao: number
  /** Valorização em % sobre o valor pago */
  percentual: number
  /** Como o valorAtual foi obtido, para a tela poder explicar ao usuário */
  origem: 'manual' | 'indice' | 'sem-indice'
}

/**
 * Corrige o valor do imóvel pelo IVG-R: o quanto o índice subiu desde a compra
 * é o quanto o imóvel subiu. Uma avaliação informada à mão sempre prevalece —
 * quem viu o imóvel sabe mais que o índice nacional.
 */
export function avaliarImovel(imovel: ImovelParaAvaliar, indiceAtual: number | null): Avaliacao {
  const pago = Number(imovel.valor_pago)

  const manual = imovel.valor_avaliado_manual
  if (manual != null && Number(manual) > 0) {
    const valorAtual = Number(manual)
    return {
      valorAtual,
      valorizacao: valorAtual - pago,
      percentual: pago > 0 ? ((valorAtual - pago) / pago) * 100 : 0,
      origem: 'manual',
    }
  }

  const base = imovel.indice_base
  if (!base || !indiceAtual || Number(base) <= 0) {
    // Sem índice não dá para estimar: mostra o valor pago, sem inventar ganho.
    return { valorAtual: pago, valorizacao: 0, percentual: 0, origem: 'sem-indice' }
  }

  const valorAtual = pago * (indiceAtual / Number(base))
  return {
    valorAtual,
    valorizacao: valorAtual - pago,
    percentual: pago > 0 ? ((valorAtual - pago) / pago) * 100 : 0,
    origem: 'indice',
  }
}
