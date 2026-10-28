import { describe, expect, it } from 'vitest'
import { janelaDosMeses, mesDoLancamento } from './mesSalario'

const folha = new Set(['salario', 'descontos'])

describe('mesDoLancamento', () => {
  it('despesa comum no fim do mês fica no mês do calendário', () => {
    expect(mesDoLancamento('2026-04-29', 'mercado', folha)).toBe('2026-04')
    expect(mesDoLancamento('2026-04-29', null, folha)).toBe('2026-04')
  })

  it('salário e descontos da folha a partir do dia 26 vão para o mês seguinte', () => {
    expect(mesDoLancamento('2026-04-28', 'salario', folha)).toBe('2026-05')
    expect(mesDoLancamento('2026-04-28', 'descontos', folha)).toBe('2026-05')
    expect(mesDoLancamento('2026-12-30', 'salario', folha)).toBe('2027-01')
  })

  it('folha antes do dia 26 fica no próprio mês', () => {
    expect(mesDoLancamento('2026-05-15', 'salario', folha)).toBe('2026-05')
  })
})

describe('janelaDosMeses', () => {
  it('vai do dia 26 do mês anterior até o último dia do mês', () => {
    expect(janelaDosMeses('2026-05', '2026-05')).toEqual({ inicio: '2026-04-26', fim: '2026-05-31' })
    expect(janelaDosMeses('2026-01', '2026-03')).toEqual({ inicio: '2025-12-26', fim: '2026-03-31' })
  })
})
