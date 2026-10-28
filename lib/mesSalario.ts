/**
 * Mês de um lançamento: a folha de pagamento (categorias marcadas como
 * "Segue o mês do salário") usa o mês de competência, em que o dia 26 em diante
 * já é do mês seguinte, porque o salário do fim do mês paga o mês que vem. Todo
 * o resto segue o mês do calendário: uma compra em 29/04 é de abril.
 *
 * Imports relativos de propósito: o Vitest testa este arquivo sem o alias "@/".
 */
import { chaveCompetencia, limitesCompetencia, limitesDoMes } from './formato'

export function mesDoLancamento(
  data: string,
  categoriaId: string | null,
  categoriasSalario: Set<string>
): string {
  return categoriaId && categoriasSalario.has(categoriaId) ? chaveCompetencia(data) : data.slice(0, 7)
}

/**
 * Datas a buscar no banco para os meses de `primeiro` a `ultimo`: inclui a
 * folha paga a partir do dia 26 do mês anterior. Depois, filtre com mesDoLancamento.
 */
export function janelaDosMeses(primeiro: string, ultimo: string): { inicio: string; fim: string } {
  return { inicio: limitesCompetencia(primeiro).inicio, fim: limitesDoMes(ultimo).fim }
}
