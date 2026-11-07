import { describe, expect, it } from 'vitest'
import { calcular, type Subcategoria, type TransacaoCalc } from './regra503020'

const base: Omit<TransacaoCalc, 'id' | 'valor' | 'tipo'> = {
  data: '2026-10-20',
  escopo: 'pessoal',
  dono_id: 'eu',
  categoria_id: null,
  subcategoria_id: null,
  conta_id: null,
  transferencia_id: null,
  fatura_cartao_id: null,
  neutro: false,
  movimento_investimento: null,
}

const subs = new Map<string, Subcategoria>([
  ['prev', { id: 'prev', categoria_id: 'c', nome: 'Previdência', grupo_503020: 'investimento' }],
])

describe('calcular — aporte da empresa', () => {
  it('soma aporte patronal e FGTS à parte, sem mexer na renda nem no Futuro', () => {
    const r = calcular(
      [
        { ...base, id: 'sal', valor: 6000, tipo: 'receita' },
        { ...base, id: 'eu', valor: 500, tipo: 'despesa', subcategoria_id: 'prev' },
        { ...base, id: 'pat', valor: 570, tipo: 'receita', neutro: true, movimento_investimento: 'aporte_empresa' },
        { ...base, id: 'fgts', valor: 996.42, tipo: 'receita', neutro: true, movimento_investimento: 'aporte_empresa' },
        { ...base, id: 'rend', valor: 40, tipo: 'receita', neutro: true, movimento_investimento: 'rendimento' },
      ],
      subs,
      new Map()
    )
    expect(r.rendaBruta).toBe(6000)
    expect(r.buckets.investimento).toBe(500)
    expect(r.aporteEmpresa).toBeCloseTo(1566.42)
  })

  it('sem aporte da empresa o campo fica zerado', () => {
    const r = calcular([{ ...base, id: 'sal', valor: 100, tipo: 'receita' }], subs, new Map())
    expect(r.aporteEmpresa).toBe(0)
  })
})
