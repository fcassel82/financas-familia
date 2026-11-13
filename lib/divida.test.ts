import { describe, expect, it } from 'vitest'
import { dividirPagamento, resumoSAC, tabelaSAC, type DividaSAC } from './divida'

// Empréstimo da ampliação da casa: simulação do banco (13/11/2026)
const obra: DividaSAC = {
  valor_total: 70325,
  parcelas_total: 48,
  taxa_juros_am: 1.5133,
  data_primeira_parcela: '2026-12-10',
}

describe('tabelaSAC', () => {
  it('bate com a simulação do banco na 1ª, 24ª e 48ª parcela', () => {
    const linhas = tabelaSAC(obra, [])
    expect(linhas).toHaveLength(48)
    expect(linhas[0].valor).toBe(2529.33)
    expect(linhas[23].valor).toBe(2019.39)
    expect(linhas[47].valor).toBe(1487.28)
    expect(linhas[0].amortizacao).toBe(1465.1)
    expect(linhas[47].saldoDepois).toBe(0)
  })

  it('vence todo mês no mesmo dia', () => {
    const linhas = tabelaSAC(obra, [])
    expect(linhas[0].vencimento).toBe('2026-12-10')
    expect(linhas[1].vencimento).toBe('2027-01-10')
    expect(linhas[47].vencimento).toBe('2030-11-10')
  })

  it('usa o valor real das parcelas pagas', () => {
    const pagas = [{ numero: 1, pago_em: '2026-12-10', amortizacao: 1465.1, juros: 1100, pago_terceiros: 1465.1 }]
    const linhas = tabelaSAC(obra, pagas)
    expect(linhas[0]).toMatchObject({ paga: true, valor: 2565.1, saldoDepois: 68859.9 })
    expect(linhas[1].paga).toBe(false)
  })
})

describe('resumoSAC', () => {
  it('antes de pagar: saldo cheio e juros estimados de toda a dívida', () => {
    const r = resumoSAC(obra, [])
    expect(r.saldoDevedor).toBe(70325)
    expect(r.jurosPagos).toBe(0)
    expect(r.jurosAPagar).toBeCloseTo(26073.59, 0)
    expect(r.proxima?.numero).toBe(1)
    expect(r.taxaUltimaPaga).toBeNull()
  })

  it('depois da 1ª parcela: saldo cai pela amortização e a taxa real aparece', () => {
    const r = resumoSAC(obra, [
      { numero: 1, pago_em: '2026-12-10', amortizacao: 1465.1, juros: 1064.23, pago_terceiros: 1465.1 },
    ])
    expect(r.saldoDevedor).toBe(68859.9)
    expect(r.jurosPagos).toBe(1064.23)
    expect(r.pagoPorTerceiros).toBe(1465.1)
    expect(r.proxima?.numero).toBe(2)
    expect(r.taxaUltimaPaga).toBe(1.5133)
  })
})

describe('dividirPagamento', () => {
  it('a amortização é fixa e o resto do valor pago é juros', () => {
    expect(dividirPagamento(obra, [], 2600)).toEqual({
      numero: 1,
      amortizacao: 1465.1,
      juros: 1134.9,
      saldoAntes: 70325,
    })
  })
})
