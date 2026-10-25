/**
 * Contas da tela Investimentos. Cada investimento é uma conta do tipo
 * "investimento": aplicação e resgate são transferências; rendimento e aporte
 * da empresa são lançamentos marcados (sempre neutros, não são renda do mês).
 *
 * Imports relativos de propósito: o Vitest testa este arquivo sem o alias "@/".
 */
import { chaveCompetencia, deslocarMes } from './formato'

export type MovimentoInvestimento = 'rendimento' | 'aporte_empresa'

export type LancamentoInvestimento = {
  conta_id: string
  data: string
  tipo: 'receita' | 'despesa'
  valor: number
  status: string
  transferencia_id: string | null
  movimento_investimento: MovimentoInvestimento | null
}

export type LinhaHistorico = {
  chave: string
  aplicado: number
  resgatado: number
  aporteEmpresa: number
  rendimento: number
}

export const CAMPOS_LANCAMENTO_INVESTIMENTO =
  'conta_id, data, tipo, valor, status, transferencia_id, movimento_investimento'

// Sem isto 999,90 → 1.000,10 daria um rendimento de 0,20000000000005
function centavos(valor: number): number {
  return Math.round(valor * 100) / 100
}

function sinal(l: LancamentoInvestimento): number {
  return l.tipo === 'receita' ? Number(l.valor) : -Number(l.valor)
}

/** O que o "Atualizar saldo" vai lançar: rendimento negativo é desvalorização */
export function calcularAtualizacao(
  saldoApp: number,
  saldoBanco: number,
  aporte: number
): { aporte: number; rendimento: number } {
  return {
    aporte: centavos(aporte),
    rendimento: centavos(saldoBanco - saldoApp - aporte),
  }
}

/** Mesma conta de saldo do Início: saldo inicial + lançamentos pagos */
export function saldoDaConta(saldoInicial: number, lancs: LancamentoInvestimento[]): number {
  return centavos(
    lancs.filter((l) => l.status === 'pago').reduce((s, l) => s + sinal(l), Number(saldoInicial))
  )
}

/** Quanto rendeu (ganhos − perdas) e quanto a empresa aportou no ano do calendário */
export function resumoDoAno(
  lancs: LancamentoInvestimento[],
  ano: number
): { rendeu: number; aporteEmpresa: number } {
  let rendeu = 0
  let aporteEmpresa = 0
  for (const l of lancs) {
    if (l.status !== 'pago' || Number(l.data.slice(0, 4)) !== ano) continue
    if (l.movimento_investimento === 'rendimento') rendeu += sinal(l)
    else if (l.movimento_investimento === 'aporte_empresa') aporteEmpresa += Number(l.valor)
  }
  return { rendeu: centavos(rendeu), aporteEmpresa: centavos(aporteEmpresa) }
}

/** Movimento por mês de competência, do mais recente ao mais antigo, sem meses vazios */
export function historicoPorMes(
  lancs: LancamentoInvestimento[],
  mesAtual: string,
  meses = 12
): LinhaHistorico[] {
  const janela = new Set<string>()
  for (let i = 0; i < meses; i++) janela.add(deslocarMes(mesAtual, -i))

  const porMes = new Map<string, LinhaHistorico>()
  for (const l of lancs) {
    if (l.status !== 'pago') continue
    const chave = chaveCompetencia(l.data)
    if (!janela.has(chave)) continue
    const linha = porMes.get(chave) ?? { chave, aplicado: 0, resgatado: 0, aporteEmpresa: 0, rendimento: 0 }
    if (l.transferencia_id) {
      if (l.tipo === 'receita') linha.aplicado += Number(l.valor)
      else linha.resgatado += Number(l.valor)
    } else if (l.movimento_investimento === 'aporte_empresa') {
      linha.aporteEmpresa += Number(l.valor)
    } else if (l.movimento_investimento === 'rendimento') {
      linha.rendimento += sinal(l)
    }
    porMes.set(chave, linha)
  }

  return Array.from(porMes.values())
    .map((l) => ({
      ...l,
      aplicado: centavos(l.aplicado),
      resgatado: centavos(l.resgatado),
      aporteEmpresa: centavos(l.aporteEmpresa),
      rendimento: centavos(l.rendimento),
    }))
    .sort((a, b) => b.chave.localeCompare(a.chave))
}

/** A data mais recente entre a conferência gravada e o último lançamento marcado */
export function dataUltimaAtualizacao(
  conferidoEm: string | null,
  lancs: LancamentoInvestimento[]
): string | null {
  let ultima = conferidoEm
  for (const l of lancs) {
    if (!l.movimento_investimento) continue
    if (!ultima || l.data > ultima) ultima = l.data
  }
  return ultima
}

/** Sem atualização há mais de `dias` dias, ou nunca atualizado */
export function estaDesatualizado(ultima: string | null, hoje: string, dias = 35): boolean {
  if (!ultima) return true
  const [a1, m1, d1] = ultima.split('-').map(Number)
  const [a2, m2, d2] = hoje.split('-').map(Number)
  const diferenca = Math.round(
    (new Date(a2, m2 - 1, d2).getTime() - new Date(a1, m1 - 1, d1).getTime()) / 86_400_000
  )
  return diferenca > dias
}
