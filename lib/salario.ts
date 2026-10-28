/**
 * Linhas do contracheque para o "Detalhar salário" da caixa de entrada: parte do
 * último contracheque lançado na conta, aproveita as previsões do mês e põe no
 * desconto do adiantamento o valor recebido no dia 15.
 * Spec: docs/superpowers/specs/2026-10-28-detalhar-salario-design.md
 *
 * Imports relativos de propósito: o Vitest testa este arquivo sem o alias "@/".
 */
import type { ItemBanco, LancamentoApp } from './conciliacao'

export type LinhaSalario = {
  /** Previsão que será atualizada para paga; sem id, a linha é inserida */
  id?: string
  descricao: string
  categoria_id: string | null
  subcategoria_id: string | null
  tipo: 'receita' | 'despesa'
  valor: number
  neutro: boolean
  /** Linha de transferência (ex.: Itaú → EQTPREV): conta que recebe */
  contaDestino?: string
}

const DIAS_PREVISAO = 5

function centavos(valor: number): number {
  return Math.round(Number(valor) * 100)
}

function diasEntre(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
}

/** Líquido do contracheque: receitas − descontos (transferência sai da conta) */
export function liquidoSalario(linhas: LinhaSalario[]): number {
  return linhas.reduce((s, l) => s + (l.tipo === 'receita' ? 1 : -1) * centavos(l.valor), 0) / 100
}

export function montarLinhasSalario(
  item: ItemBanco,
  lancamentos: LancamentoApp[],
  categoriasFolha: Set<string>
): LinhaSalario[] {
  const conta = item.contaBanco.conta_id
  const daConta = lancamentos.filter((l) => l.conta_id === conta && !l.fatura_cartao_id)
  const ehFolha = (l: LancamentoApp) => !!l.categoria_id && categoriasFolha.has(l.categoria_id)

  // Último contracheque: data antes do crédito, fim de mês, com 2+ linhas de folha pagas
  const contagem = new Map<string, number>()
  for (const l of daConta) {
    if (l.status !== 'pago' || !ehFolha(l) || l.data >= item.data) continue
    if (Number(l.data.slice(8, 10)) <= 20) continue
    contagem.set(l.data, (contagem.get(l.data) ?? 0) + 1)
  }
  const dataModelo = [...contagem]
    .filter(([, n]) => n >= 2)
    .map(([d]) => d)
    .sort()
    .at(-1)

  const linhas: LinhaSalario[] = dataModelo
    ? daConta
        .filter((l) => l.status === 'pago' && l.data === dataModelo)
        .map((l) => ({
          descricao: l.descricao,
          categoria_id: l.categoria_id ?? null,
          subcategoria_id: l.subcategoria_id ?? null,
          tipo: l.tipo === 'receita' ? 'receita' : 'despesa',
          valor: Number(l.valor),
          neutro: !!l.neutro,
          ...(l.transferencia_id
            ? {
                contaDestino:
                  lancamentos.find(
                    (o) => o.transferencia_id === l.transferencia_id && o.id !== l.id
                  )?.conta_id ?? undefined,
              }
            : {}),
        }))
    : []

  // Previsões do mês: assumem a linha da mesma subcategoria (o valor do contracheque vale)
  const previsoes = daConta.filter(
    (l) => l.status === 'pendente' && ehFolha(l) && diasEntre(l.data, item.data) <= DIAS_PREVISAO
  )
  for (const p of previsoes) {
    const par = linhas.find(
      (l) =>
        !l.id && !l.contaDestino && l.subcategoria_id && l.subcategoria_id === p.subcategoria_id
    )
    if (par) par.id = p.id
    else
      linhas.push({
        id: p.id,
        descricao: p.descricao,
        categoria_id: p.categoria_id ?? null,
        subcategoria_id: p.subcategoria_id ?? null,
        tipo: p.tipo === 'receita' ? 'receita' : 'despesa',
        valor: Number(p.valor),
        neutro: !!p.neutro,
      })
  }

  // Adiantamento recebido no mês (dia 1 a 20): o contracheque desconta esse valor
  const mes = item.data.slice(0, 7)
  const adiantamento = daConta.find(
    (l) =>
      l.tipo === 'receita' &&
      l.neutro &&
      ehFolha(l) &&
      l.data.startsWith(mes) &&
      Number(l.data.slice(8, 10)) <= 20
  )
  if (adiantamento) {
    const desconto = linhas.find((l) => l.tipo === 'despesa' && l.neutro && !l.contaDestino)
    if (desconto) desconto.valor = Number(adiantamento.valor)
    else
      linhas.push({
        descricao: 'Adiantamento Quinzenal',
        categoria_id: adiantamento.categoria_id ?? null,
        subcategoria_id: adiantamento.subcategoria_id ?? null,
        tipo: 'despesa',
        valor: Number(adiantamento.valor),
        neutro: true,
      })
  }

  return linhas
}
