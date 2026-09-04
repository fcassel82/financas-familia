import { somarMeses } from './formato'

export type ComParcela<T> = T & { parcela_numero: number; parcela_total: number }

/**
 * Divide um valor em N parcelas mensais a partir da data base, com o resto da
 * divisão em centavos indo para a última parcela — nunca perde nem ganha
 * centavo no total. Usada tanto para lançar uma compra parcelada quanto para
 * provisionar as próximas faturas de um cartão.
 */
export function dividirEmParcelas<T extends { data: string; descricao: string; valor: number }>(
  base: T,
  quantidade: number
): ComParcela<T>[] {
  const totalCentavos = Math.round(base.valor * 100)
  const porParcela = Math.floor(totalCentavos / quantidade)
  const sobra = totalCentavos - porParcela * quantidade

  return Array.from({ length: quantidade }, (_, i) => {
    const centavos = i === quantidade - 1 ? porParcela + sobra : porParcela
    return {
      ...base,
      data: somarMeses(base.data, i),
      descricao: `${base.descricao} (${i + 1}/${quantidade})`,
      valor: centavos / 100,
      parcela_numero: i + 1,
      parcela_total: quantidade,
    }
  })
}
