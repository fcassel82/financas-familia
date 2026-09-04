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

/** Diferença em dias entre duas datas ISO (sem erro de fuso) */
function diasEntreIso(a: string, b: string): number {
  const [a1, a2, a3] = a.split('-').map(Number)
  const [b1, b2, b3] = b.split('-').map(Number)
  const da = new Date(a1, a2 - 1, a3)
  const db = new Date(b1, b2 - 1, b3)
  return Math.round((da.getTime() - db.getTime()) / 86_400_000)
}

export type PendenciaFatura = {
  id: string
  cartaoNome: string
  competencia: string
  valor: number
  data_vencimento: string
}

/** Quantos dias de diferença entre o débito e o vencimento ainda contam como "é a mesma fatura" */
const JANELA_DIAS_PAGAMENTO_FATURA = 5

/**
 * Entre as faturas de cartão ainda em aberto, acha a que provavelmente é paga por
 * este débito do extrato da conta: mesmo valor, vencimento a poucos dias da data
 * do débito. Uma fatura já usada por outra linha do mesmo extrato não é reaproveitada.
 */
export function casarComFaturaAberta(
  item: { data: string; valor: number; tipo: 'receita' | 'despesa' },
  pendencias: PendenciaFatura[],
  usadas: Set<string>
): PendenciaFatura | null {
  if (item.tipo !== 'despesa') return null
  return (
    pendencias.find(
      (p) =>
        !usadas.has(p.id) &&
        Math.abs(p.valor - item.valor) < 0.005 &&
        Math.abs(diasEntreIso(item.data, p.data_vencimento)) <= JANELA_DIAS_PAGAMENTO_FATURA
    ) ?? null
  )
}
