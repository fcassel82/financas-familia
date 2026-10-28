/**
 * Saldo dos investimentos que chega pelo Meu Pluggy: compara com o saldo do app
 * e sugere a diferença como rendimento (ou desvalorização), para o Fred confirmar.
 */
import { saldoDaConta, type LancamentoInvestimento } from './investimentos'

export type InvestimentoBanco = {
  id: string
  nome: string
  saldo: number
  data_saldo: string
  situacao: string
  conta_id: string | null
  acompanhar: boolean
}

export type ContaInvestimento = {
  id: string
  nome: string
  saldo_inicial: number
  saldo_conferido_em: string | null
}

export type SugestaoRendimento = {
  contaId: string
  nome: string
  saldoBanco: number
  saldoApp: number
  diferenca: number
  data: string
  desde: string | null
  bloqueada: boolean
}

export const MOTIVO_BLOQUEIO =
  'Há aplicação ou resgate deste banco esperando revisão. Confirme antes, para não contar como rendimento.'

function centavos(valor: number): number {
  return Math.round(valor * 100) / 100
}

/**
 * Uma sugestão por conta de investimento do app com investimento do banco ligado.
 * `bloqueadas`: contas com aplicação ou resgate ainda na caixa de entrada; a
 * diferença ali pode ser essa transferência, não rendimento.
 */
export function sugerirRendimentos(
  contas: ContaInvestimento[],
  investimentos: InvestimentoBanco[],
  lancamentos: LancamentoInvestimento[],
  bloqueadas: Set<string>
): SugestaoRendimento[] {
  const sugestoes: SugestaoRendimento[] = []
  for (const conta of contas) {
    const ligados = investimentos.filter((i) => i.conta_id === conta.id && i.acompanhar)
    if (ligados.length === 0) continue

    const saldoBanco = centavos(ligados.reduce((s, i) => s + Number(i.saldo), 0))
    const saldoApp = saldoDaConta(
      conta.saldo_inicial,
      lancamentos.filter((l) => l.conta_id === conta.id)
    )
    const diferenca = centavos(saldoBanco - saldoApp)
    if (Math.abs(diferenca) < 0.01) continue

    sugestoes.push({
      contaId: conta.id,
      nome: conta.nome,
      saldoBanco,
      saldoApp,
      diferenca,
      data: ligados
        .map((i) => i.data_saldo)
        .sort()
        .at(-1)!,
      desde: conta.saldo_conferido_em,
      bloqueada: bloqueadas.has(conta.id),
    })
  }
  return sugestoes
}
