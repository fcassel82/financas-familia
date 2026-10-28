import { describe, expect, it } from 'vitest'
import type { LancamentoInvestimento } from './investimentos'
import {
  sugerirRendimentos,
  type ContaInvestimento,
  type InvestimentoBanco,
} from './saldoInvestimentos'

function lanc(parcial: Partial<LancamentoInvestimento>): LancamentoInvestimento {
  return {
    conta_id: 'itau',
    data: '2026-09-01',
    tipo: 'receita',
    valor: 0,
    status: 'pago',
    transferencia_id: 't1',
    movimento_investimento: null,
    ...parcial,
  }
}

function inv(parcial: Partial<InvestimentoBanco>): InvestimentoBanco {
  return {
    id: 'i1',
    nome: 'CDB',
    saldo: 0,
    data_saldo: '2026-10-27',
    situacao: 'ACTIVE',
    conta_id: 'itau',
    acompanhar: true,
    ...parcial,
  }
}

const contas: ContaInvestimento[] = [
  { id: 'itau', nome: 'Itaú Investimento', saldo_inicial: 0, saldo_conferido_em: '2026-08-31' },
  { id: 'fgts', nome: 'FGTS', saldo_inicial: 5000, saldo_conferido_em: null },
]
const aplicado = [lanc({ valor: 25000 })]

describe('sugerirRendimentos', () => {
  it('soma os investimentos ligados à mesma conta', () => {
    const r = sugerirRendimentos(
      contas,
      [
        inv({ id: 'a', saldo: 10000, data_saldo: '2026-10-26' }),
        inv({ id: 'b', saldo: 15312.4, data_saldo: '2026-10-27' }),
      ],
      aplicado,
      new Set()
    )
    expect(r).toEqual([
      {
        contaId: 'itau',
        nome: 'Itaú Investimento',
        saldoBanco: 25312.4,
        saldoApp: 25000,
        diferenca: 312.4,
        data: '2026-10-27',
        desde: '2026-08-31',
        bloqueada: false,
      },
    ])
  })

  it('banco menor que o app vira diferença negativa', () => {
    const r = sugerirRendimentos(contas, [inv({ saldo: 24900 })], aplicado, new Set())
    expect(r[0].diferenca).toBe(-100)
  })

  it('diferença abaixo de um centavo não sugere', () => {
    expect(sugerirRendimentos(contas, [inv({ saldo: 25000.004 })], aplicado, new Set())).toEqual([])
  })

  it('"Não acompanhar" fica fora da soma', () => {
    const r = sugerirRendimentos(
      contas,
      [inv({ id: 'a', saldo: 25100 }), inv({ id: 'b', saldo: 999, acompanhar: false })],
      aplicado,
      new Set()
    )
    expect(r[0].saldoBanco).toBe(25100)
  })

  it('investimento resgatado com saldo zero não muda a soma', () => {
    const r = sugerirRendimentos(
      contas,
      [inv({ id: 'a', saldo: 25100 }), inv({ id: 'b', saldo: 0, situacao: 'TOTAL_WITHDRAWAL' })],
      aplicado,
      new Set()
    )
    expect(r[0].saldoBanco).toBe(25100)
    expect(r[0].diferenca).toBe(100)
  })

  it('conta com transferência esperando revisão sai bloqueada', () => {
    const r = sugerirRendimentos(contas, [inv({ saldo: 26000 })], aplicado, new Set(['itau']))
    expect(r[0].bloqueada).toBe(true)
  })

  it('conta sem investimento ligado nunca recebe sugestão', () => {
    const r = sugerirRendimentos(
      contas,
      [inv({ saldo: 25100 }), inv({ id: 'solto', saldo: 9999, conta_id: null })],
      aplicado,
      new Set()
    )
    expect(r.map((s) => s.contaId)).toEqual(['itau'])
  })

  it('só conta os lançamentos da própria conta', () => {
    const r = sugerirRendimentos(
      contas,
      [inv({ saldo: 25100 })],
      [...aplicado, lanc({ conta_id: 'fgts', valor: 700 })],
      new Set()
    )
    expect(r[0].saldoApp).toBe(25000)
  })
})
