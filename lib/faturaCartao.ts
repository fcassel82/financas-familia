import { somarDias } from './formato'

/** "2026-10-31" a partir de ano/mês/dia, ajustando dias que não existem no mês (ex: 31 em fevereiro) */
function dataValida(ano: number, mes: number, dia: number): string {
  const ultimoDia = new Date(ano, mes, 0).getDate()
  const diaFinal = Math.min(dia, ultimoDia)
  return `${ano}-${String(mes).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`
}

function proximoMes(ano: number, mes: number): [number, number] {
  return mes === 12 ? [ano + 1, 1] : [ano, mes + 1]
}

function mesAnterior(ano: number, mes: number): [number, number] {
  return mes === 1 ? [ano - 1, 12] : [ano, mes - 1]
}

/**
 * Em qual fatura (identificada pelo mês de vencimento, "2026-10") uma compra
 * feita em `dataISO` vai cair, dado o dia de fechamento e de vencimento do cartão.
 */
export function competenciaDaCompra(
  dataISO: string,
  diaFechamento: number,
  diaVencimento: number
): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)

  // Se a compra é depois do fechamento do mês, ela só entra na fatura seguinte
  const [fechAno, fechMes] = dia > diaFechamento ? proximoMes(ano, mes) : [ano, mes]

  // Quando o vencimento cai antes do fechamento no calendário (ex: fecha dia 25,
  // vence dia 5), o vencimento é sempre no mês seguinte ao do fechamento
  const [vencAno, vencMes] =
    diaVencimento < diaFechamento ? proximoMes(fechAno, fechMes) : [fechAno, fechMes]

  return `${vencAno}-${String(vencMes).padStart(2, '0')}`
}

export type CicloFatura = {
  /** Mês de vencimento, "2026-10" */
  competencia: string
  /** Primeiro dia do ciclo (dia seguinte ao fechamento anterior) */
  inicioCiclo: string
  /** Último dia do ciclo (data de fechamento desta fatura) */
  fimCiclo: string
  /** Data de vencimento da fatura */
  vencimento: string
}

/** Dado o mês de vencimento de uma fatura, calcula as datas do seu ciclo de compras */
export function cicloDaCompetencia(
  competencia: string,
  diaFechamento: number,
  diaVencimento: number
): CicloFatura {
  const [vencAno, vencMes] = competencia.split('-').map(Number)
  const vencimento = dataValida(vencAno, vencMes, diaVencimento)

  const [fechAno, fechMes] =
    diaVencimento < diaFechamento ? mesAnterior(vencAno, vencMes) : [vencAno, vencMes]
  const fimCiclo = dataValida(fechAno, fechMes, diaFechamento)

  const [inicioAno, inicioMes] = mesAnterior(fechAno, fechMes)
  const fechamentoAnterior = dataValida(inicioAno, inicioMes, diaFechamento)
  const inicioCiclo = somarDias(fechamentoAnterior, 1)

  return { competencia, inicioCiclo, fimCiclo, vencimento }
}

/** Soma meses a uma competência ("2026-10", 1) → "2026-11" */
export function deslocarCompetencia(competencia: string, meses: number): string {
  const [ano, mes] = competencia.split('-').map(Number)
  const d = new Date(ano, mes - 1 + meses, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
