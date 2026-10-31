import { describe, expect, it } from 'vitest'
import { mesclarTransacoesBanco, type ExistenteBanco, type LinhaBanco } from './mesclarBanco'

function nova(parcial: Partial<LinhaBanco>): LinhaBanco {
  return {
    id: 'n1',
    conta_banco_id: 'cartao',
    data: '2026-10-10',
    descricao: 'MERCADO X',
    valor: 50,
    tipo: 'despesa',
    pagamento_cartao: false,
    categoria_banco: null,
    comerciante: null,
    parcela: null,
    parcelas: null,
    pendente_banco: false,
    provider_id: null,
    ...parcial,
  }
}

function existente(parcial: Partial<ExistenteBanco>): ExistenteBanco {
  return {
    id: 'e1',
    data: '2026-10-10',
    descricao: 'MERCADO X',
    valor: 50,
    tipo: 'despesa',
    situacao: 'revisar',
    pendente_banco: true,
    provider_id: null,
    ...parcial,
  }
}

describe('mesclarTransacoesBanco', () => {
  it('compra nova entra na caixa', () => {
    const p = mesclarTransacoesBanco([nova({ pendente_banco: true })], [])
    expect(p.inserir).toHaveLength(1)
    expect(p.atualizar).toEqual([])
  })

  it('mesma id sem mudança não faz nada', () => {
    const p = mesclarTransacoesBanco([nova({ id: 'e1', pendente_banco: true })], [existente({})])
    expect(p).toEqual({ inserir: [], atualizar: [] })
  })

  it('pendente que fechou com a mesma id só deixa de ser pendente', () => {
    const p = mesclarTransacoesBanco([nova({ id: 'e1' })], [existente({})])
    expect(p.atualizar).toEqual([{ idAtual: 'e1', mudanca: { pendente_banco: false } }])
  })

  it('pendente que voltou confirmada com outra id assume a linha antiga, sem duplicar', () => {
    const p = mesclarTransacoesBanco(
      [nova({ id: 'n9', data: '2026-10-11', descricao: 'MERCADO X LTDA' })],
      [existente({})]
    )
    expect(p.inserir).toEqual([])
    expect(p.atualizar).toEqual([
      {
        idAtual: 'e1',
        mudanca: {
          id: 'n9',
          pendente_banco: false,
          data: '2026-10-11',
          descricao: 'MERCADO X LTDA',
        },
      },
    ])
  })

  it('já confirmada no app mantém data, descrição e valor, só troca a id', () => {
    const p = mesclarTransacoesBanco(
      [nova({ id: 'n9', data: '2026-10-11', valor: 50 })],
      [existente({ situacao: 'lancada' })]
    )
    expect(p.atualizar).toEqual([{ idAtual: 'e1', mudanca: { id: 'n9', pendente_banco: false } }])
  })

  it('reconhece pelo providerId mesmo com valor diferente', () => {
    const p = mesclarTransacoesBanco(
      [nova({ id: 'n9', provider_id: 'p1', valor: 52 })],
      [existente({ provider_id: 'p1' })]
    )
    expect(p.atualizar[0]).toMatchObject({ idAtual: 'e1', mudanca: { id: 'n9', valor: 52 } })
    expect(p.inserir).toEqual([])
  })

  it('duas compras iguais no mesmo dia continuam duas', () => {
    const p = mesclarTransacoesBanco(
      [nova({ id: 'n1' }), nova({ id: 'n2' })],
      [existente({ id: 'e1' }), existente({ id: 'e2' })]
    )
    expect(p.inserir).toEqual([])
    expect(p.atualizar.map((a) => [a.idAtual, a.mudanca.id])).toEqual([
      ['e1', 'n1'],
      ['e2', 'n2'],
    ])
  })

  it('linha que a Pluggy ainda devolve não é assumida por outra compra', () => {
    const p = mesclarTransacoesBanco(
      [nova({ id: 'e1', pendente_banco: true }), nova({ id: 'n2', pendente_banco: true })],
      [existente({ id: 'e1' })]
    )
    expect(p.inserir.map((r) => r.id)).toEqual(['n2'])
  })

  it('pendente longe da data (mais de 3 dias) não é a mesma compra', () => {
    const p = mesclarTransacoesBanco([nova({ id: 'n9', data: '2026-10-20' })], [existente({})])
    expect(p.inserir).toHaveLength(1)
  })

  it('confirmada antiga só é a mesma com data e descrição iguais', () => {
    const antiga = existente({ pendente_banco: false, situacao: 'ligada' })
    expect(mesclarTransacoesBanco([nova({ id: 'n9' })], [antiga]).inserir).toEqual([])
    expect(
      mesclarTransacoesBanco([nova({ id: 'n9', descricao: 'OUTRA' })], [antiga]).inserir
    ).toHaveLength(1)
  })
})
