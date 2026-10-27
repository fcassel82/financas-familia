import { describe, expect, it } from 'vitest'
import {
  sugerirAcao,
  sugestaoContaApp,
  tipoDaTransacao,
  type ContextoConciliacao,
  type ItemBanco,
  type LancamentoApp,
} from './conciliacao'

function item(parcial: Partial<ItemBanco>): ItemBanco {
  return {
    id: 'b1',
    data: '2026-10-13',
    descricao: 'Compra',
    valor: 100,
    tipo: 'despesa',
    pagamento_cartao: false,
    categoria_banco: null,
    parcela: null,
    parcelas: null,
    contaBanco: { tipo: 'BANK', conta_id: 'itau', cartao_id: null },
    ...parcial,
  }
}

function lanc(parcial: Partial<LancamentoApp>): LancamentoApp {
  return {
    id: 'l1',
    data: '2026-10-13',
    descricao: 'X',
    valor: 100,
    tipo: 'despesa',
    status: 'pago',
    conta_id: 'itau',
    cartao_id: null,
    parcela_total: null,
    nota_fiscal_id: null,
    transferencia_id: null,
    fatura_cartao_id: null,
    criado_em: '2026-10-24T10:00:12Z',
    ...parcial,
  }
}

const contas = [
  { id: 'itau', nome: 'Itaú', tipo: 'corrente' },
  { id: 'itauinv', nome: 'Itaú Investimento', tipo: 'investimento' },
  { id: 'c6inv', nome: 'C6 Investimento', tipo: 'investimento' },
  { id: 'nufred', nome: 'NuBank Fred', tipo: 'corrente' },
  { id: 'nugisa', nome: 'Nubank Gisa', tipo: 'corrente' },
  { id: 'c6', nome: 'C6', tipo: 'corrente' },
]

function ctx(parcial: Partial<ContextoConciliacao> = {}): ContextoConciliacao {
  return {
    lancamentos: [],
    notas: [],
    contas,
    nomeDaContaApp: (id) => contas.find((c) => c.id === id)?.nome ?? '',
    jaLigados: new Set(),
    ...parcial,
  }
}

describe('tipoDaTransacao', () => {
  it('conta: crédito é receita, débito é despesa', () => {
    expect(tipoDaTransacao('BANK', 2536.21, 'CREDIT', 'Salário')).toEqual({
      tipo: 'receita',
      pagamentoCartao: false,
    })
    expect(tipoDaTransacao('BANK', -83.97, 'DEBIT', 'Pix')).toEqual({
      tipo: 'despesa',
      pagamentoCartao: false,
    })
  })

  it('cartão: compra positiva, pagamento negativo, estorno negativo', () => {
    expect(tipoDaTransacao('CREDIT', 50, 'DEBIT', 'LOJA')).toEqual({
      tipo: 'despesa',
      pagamentoCartao: false,
    })
    expect(tipoDaTransacao('CREDIT', -4915.67, 'CREDIT', 'Pagamento recebido')).toEqual({
      tipo: 'receita',
      pagamentoCartao: true,
    })
    expect(tipoDaTransacao('CREDIT', -30, 'CREDIT', 'Estorno LOJA')).toEqual({
      tipo: 'receita',
      pagamentoCartao: false,
    })
  })
})

describe('sugerirAcao: regras por ordem', () => {
  it('débito automático de fatura é ignorado, mesmo com categoria de investimento', () => {
    const s = sugerirAcao(
      item({
        descricao: 'Débito automático Fatura Uniclass Signature',
        valor: 4915.67,
        categoria_banco: 'Automatic investment',
      }),
      ctx()
    )
    expect(s).toMatchObject({ acao: 'ignorar', motivo: 'Pagamento de fatura' })
  })

  it('pagamento dentro do cartão é ignorado', () => {
    const s = sugerirAcao(
      item({
        tipo: 'receita',
        pagamento_cartao: true,
        contaBanco: { tipo: 'CREDIT', conta_id: null, cartao_id: 'nu' },
      }),
      ctx()
    )
    expect(s.acao).toBe('ignorar')
  })

  it('rendimento vem antes de transferência', () => {
    const s = sugerirAcao(
      item({ descricao: 'Rendimentos REND PAGO APLIC AUT MAIS', valor: 0.04, tipo: 'receita' }),
      ctx()
    )
    expect(s).toMatchObject({ acao: 'lancar', motivo: 'Rendimento da conta' })
  })

  it('resgate é transferência vinda do investimento do mesmo banco', () => {
    const s = sugerirAcao(
      item({ descricao: 'Entrada RESGATE COFRINHOS', valor: 400.01, tipo: 'receita' }),
      ctx()
    )
    expect(s).toMatchObject({ acao: 'transferencia', origem: 'itauinv', contaDestino: 'itau' })
  })

  it('aplicação é transferência para o investimento', () => {
    const s = sugerirAcao(item({ descricao: 'APLICACAO COFRINHOS', valor: 500 }), ctx())
    expect(s).toMatchObject({ acao: 'transferencia', origem: 'itau', contaDestino: 'itauinv' })
  })

  it('aplicativo e renda não são confundidos com aplicação e rendimento', () => {
    expect(sugerirAcao(item({ descricao: 'UBER APLICATIVO' }), ctx()).acao).toBe('lancar')
    expect(
      sugerirAcao(item({ descricao: 'Renda extra freela', tipo: 'receita' }), ctx()).motivo
    ).toBe('Novo no app')
  })

  it('liga ao lançamento igual (valor e até 2 dias), preferindo a mesma conta', () => {
    const s = sugerirAcao(
      item({ data: '2026-10-13' }),
      ctx({
        lancamentos: [
          lanc({ id: 'semconta', conta_id: null, data: '2026-10-12' }),
          lanc({ id: 'certo', data: '2026-10-14' }),
        ],
      })
    )
    expect(s).toMatchObject({ acao: 'ligar', lancamentos: ['certo'] })
  })

  it('não reaproveita lançamento já ligado', () => {
    const s = sugerirAcao(
      item({}),
      ctx({ lancamentos: [lanc({ id: 'usado' })], jaLigados: new Set(['usado']) })
    )
    expect(s.acao).toBe('lancar')
  })

  it('parcela do cartão liga ao lançamento parcelado do mesmo cartão', () => {
    const s = sugerirAcao(
      item({
        valor: 120,
        parcela: 3,
        parcelas: 10,
        data: '2026-10-05',
        contaBanco: { tipo: 'CREDIT', conta_id: null, cartao_id: 'nu' },
      }),
      ctx({
        lancamentos: [
          lanc({
            id: 'p3',
            valor: 120,
            cartao_id: 'nu',
            conta_id: null,
            parcela_total: 10,
            data: '2026-09-20',
          }),
        ],
      })
    )
    expect(s).toMatchObject({ acao: 'ligar', lancamentos: ['p3'] })
  })

  it('liga à nota fiscal registrada pelo valor pago', () => {
    const s = sugerirAcao(
      item({ valor: 287.43 }),
      ctx({
        notas: [{ id: 'n1', data: '2026-10-13', valor_pago: 287.43 }],
        lancamentos: [
          lanc({ id: 'i1', valor: 200, nota_fiscal_id: 'n1', conta_id: null }),
          lanc({ id: 'i2', valor: 90, nota_fiscal_id: 'n1', conta_id: null }),
        ],
      })
    )
    expect(s).toMatchObject({ acao: 'ligar', lancamentos: ['i1', 'i2'] })
    expect(s.motivo).toContain('Nota fiscal')
  })

  it('soma itens antigos do mesmo minuto, sem misturar com outra nota do dia', () => {
    const s = sugerirAcao(
      item({ valor: 30 }),
      ctx({
        lancamentos: [
          lanc({ id: 'a', valor: 10, conta_id: null, criado_em: '2026-10-24T10:00:05Z' }),
          lanc({ id: 'b', valor: 20.3, conta_id: null, criado_em: '2026-10-24T10:00:40Z' }),
          lanc({ id: 'c', valor: 5, conta_id: null, criado_em: '2026-10-24T11:15:00Z' }),
          lanc({ id: 'd', valor: 40, conta_id: null, criado_em: '2026-10-24T11:15:02Z' }),
        ],
      })
    )
    expect(s).toMatchObject({ acao: 'ligar', lancamentos: ['a', 'b'] })
    expect(s.diferenca).toBeCloseTo(-0.3)
  })

  it('o resto é lançar, com opção de detalhar por nota na despesa', () => {
    expect(
      sugerirAcao(item({ descricao: 'Pagamento de Pix QR Code TIM S A' }), ctx())
    ).toMatchObject({
      acao: 'lancar',
      detalharNota: true,
    })
    expect(
      sugerirAcao(item({ tipo: 'receita', descricao: 'Salário CEEE' }), ctx()).detalharNota
    ).toBe(false)
  })
})

describe('sugestaoContaApp', () => {
  it('casa pelo nome do banco, preferindo a conta do titular', () => {
    expect(sugestaoContaApp('itau', 'BANK', contas, [])).toBe('conta:itau')
    expect(sugestaoContaApp('C6 BANK', 'BANK', contas, [])).toBe('conta:c6')
    expect(
      sugestaoContaApp('Nu Pagamentos S.A. - Instituição de Pagamento', 'BANK', contas, [], 'fred')
    ).toBe('conta:nufred')
  })

  it('nome genérico de cartão fica sem sugestão', () => {
    expect(
      sugestaoContaApp('OUTROS', 'CREDIT', contas, [{ id: 'nu', nome: 'NuBank Fred' }])
    ).toBeNull()
  })
})
