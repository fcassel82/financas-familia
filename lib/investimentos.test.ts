import { describe, expect, it } from 'vitest'
import {
  calcularAtualizacao,
  dataUltimaAtualizacao,
  estaDesatualizado,
  historicoPorMes,
  resumoDoAno,
  saldoDaConta,
  type LancamentoInvestimento,
} from './investimentos'

function lanc(parcial: Partial<LancamentoInvestimento>): LancamentoInvestimento {
  return {
    conta_id: 'c1',
    data: '2026-09-01',
    tipo: 'receita',
    valor: 0,
    status: 'pago',
    transferencia_id: null,
    movimento_investimento: null,
    ...parcial,
  }
}

describe('calcularAtualizacao', () => {
  it('arredonda a centavos', () => {
    expect(calcularAtualizacao(999.9, 1000.1, 0)).toEqual({ aporte: 0, rendimento: 0.2 })
  })

  it('lança a diferença como rendimento', () => {
    expect(calcularAtualizacao(21505.48, 21817.88, 0).rendimento).toBe(312.4)
  })

  it('saldo do banco menor vira desvalorização', () => {
    expect(calcularAtualizacao(1000, 950, 0).rendimento).toBe(-50)
  })

  it('aporte maior que a diferença deixa o rendimento negativo', () => {
    expect(calcularAtualizacao(1000, 1300, 500)).toEqual({ aporte: 500, rendimento: -200 })
  })
})

describe('saldoDaConta', () => {
  it('soma só os pagos', () => {
    const lancs = [
      lanc({ tipo: 'receita', valor: 50 }),
      lanc({ tipo: 'despesa', valor: 20 }),
      lanc({ tipo: 'receita', valor: 999, status: 'pendente' }),
    ]
    expect(saldoDaConta(100, lancs)).toBe(130)
  })
})

describe('resumoDoAno', () => {
  it('soma rendimento líquido e aporte da empresa do ano', () => {
    const lancs = [
      lanc({ data: '2026-09-01', valor: 50.63, movimento_investimento: 'rendimento' }),
      lanc({
        data: '2026-10-01',
        tipo: 'despesa',
        valor: 10,
        movimento_investimento: 'rendimento',
      }),
      lanc({ data: '2026-09-18', valor: 996.42, movimento_investimento: 'aporte_empresa' }),
      lanc({ data: '2025-12-01', valor: 100, movimento_investimento: 'aporte_empresa' }),
    ]
    expect(resumoDoAno(lancs, 2026)).toEqual({ rendeu: 40.63, aporteEmpresa: 996.42 })
  })
})

describe('historicoPorMes', () => {
  const lancs = [
    lanc({ data: '2026-07-30', valor: 20000, transferencia_id: 't1' }),
    lanc({ data: '2026-08-10', tipo: 'despesa', valor: 6200.01, transferencia_id: 't2' }),
    lanc({ data: '2026-09-26', valor: 5, movimento_investimento: 'rendimento' }),
    lanc({ data: '2026-09-27', valor: 777, status: 'pendente', transferencia_id: 't3' }),
  ]

  it('agrupa por mês do calendário, do mais recente ao mais antigo', () => {
    expect(historicoPorMes(lancs, '2026-10')).toEqual([
      { chave: '2026-09', aplicado: 0, resgatado: 0, aporteEmpresa: 0, rendimento: 5 },
      { chave: '2026-08', aplicado: 0, resgatado: 6200.01, aporteEmpresa: 0, rendimento: 0 },
      { chave: '2026-07', aplicado: 20000, resgatado: 0, aporteEmpresa: 0, rendimento: 0 },
    ])
  })

  it('ignora meses fora da janela', () => {
    expect(historicoPorMes(lancs, '2026-10', 2).map((l) => l.chave)).toEqual(['2026-09'])
  })
})

describe('dataUltimaAtualizacao', () => {
  it('usa a mais recente entre a conferência e o último lançamento marcado', () => {
    const lancs = [lanc({ data: '2026-10-05', valor: 1, movimento_investimento: 'rendimento' })]
    expect(dataUltimaAtualizacao('2026-10-01', lancs)).toBe('2026-10-05')
    expect(dataUltimaAtualizacao('2026-10-09', lancs)).toBe('2026-10-09')
  })

  it('ignora lançamentos sem marcação', () => {
    expect(
      dataUltimaAtualizacao(null, [lanc({ data: '2026-10-05', transferencia_id: 't' })])
    ).toBeNull()
  })

  it('sem nada, nunca foi atualizado', () => {
    expect(dataUltimaAtualizacao(null, [])).toBeNull()
  })
})

describe('estaDesatualizado', () => {
  it('mais de 35 dias', () => {
    expect(estaDesatualizado('2026-09-05', '2026-10-24')).toBe(true)
  })

  it('dentro de 35 dias', () => {
    expect(estaDesatualizado('2026-10-01', '2026-10-24')).toBe(false)
    expect(estaDesatualizado('2026-09-19', '2026-10-24')).toBe(false)
  })

  it('nunca atualizado', () => {
    expect(estaDesatualizado(null, '2026-10-24')).toBe(true)
  })
})
