import { describe, expect, it } from 'vitest'
import {
  linhaDeSaldoAnterior,
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
  it('débito automático de fatura sem fatura no app é ignorado, mesmo com categoria de investimento', () => {
    const s = sugerirAcao(
      item({
        descricao: 'Débito automático Fatura Uniclass Signature',
        valor: 4915.67,
        categoria_banco: 'Automatic investment',
      }),
      ctx()
    )
    expect(s).toMatchObject({
      acao: 'ignorar',
      motivo: 'Pagamento de fatura (fatura não está no app)',
    })
  })

  it('saldo da fatura anterior no cartão é ignorado; juros não', () => {
    const cartao = { tipo: 'CREDIT', conta_id: null, cartao_id: 'nu' }
    expect(
      sugerirAcao(
        item({ descricao: 'Valor pendente do mês anterior', valor: 436.6, contaBanco: cartao }),
        ctx()
      )
    ).toMatchObject({
      acao: 'ignorar',
      motivo: 'Saldo da fatura anterior',
    })
    expect(
      sugerirAcao(
        item({ descricao: 'Juros por fatura atrasada', valor: 4.48, contaBanco: cartao }),
        ctx()
      ).acao
    ).toBe('lancar')
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

describe('linhaDeSaldoAnterior', () => {
  it('reconhece as linhas de saldo e de pagamento da fatura', () => {
    expect(linhaDeSaldoAnterior('Valor pendente do mês anterior')).toBe(true)
    expect(linhaDeSaldoAnterior('Saldo anterior')).toBe(true)
    expect(linhaDeSaldoAnterior('Pagamento recebido')).toBe(true)
    expect(linhaDeSaldoAnterior('Multa por fatura atrasada')).toBe(false)
  })
})

// Contracheque de 28/08 como está no app: folha, saúde, previdência (transferência) e o adiantamento neutro
const FOLHA = new Set(['sal', 'desc'])
const contracheque: LancamentoApp[] = [
  lanc({ id: 'base', data: '2026-08-28', tipo: 'receita', valor: 8454.03, categoria_id: 'sal' }),
  lanc({ id: 'peric', data: '2026-08-28', tipo: 'receita', valor: 2536.21, categoria_id: 'sal' }),
  lanc({ id: 'anuenio', data: '2026-08-28', tipo: 'receita', valor: 1465.07, categoria_id: 'sal' }),
  lanc({ id: 'irrf', data: '2026-08-28', valor: 1951.34, categoria_id: 'desc' }),
  lanc({ id: 'inss', data: '2026-08-28', valor: 988.07, categoria_id: 'desc' }),
  lanc({ id: 'odonto', data: '2026-08-28', valor: 19.2, categoria_id: 'saude' }),
  lanc({ id: 'aux', data: '2026-08-28', valor: 10, categoria_id: 'desc' }),
  lanc({ id: 'convenio', data: '2026-08-28', valor: 366.89, categoria_id: 'saude' }),
  lanc({ id: 'prev', data: '2026-08-28', valor: 498.21, transferencia_id: 'tp' }),
  lanc({
    id: 'adiant',
    data: '2026-08-28',
    valor: 2536.21,
    categoria_id: 'desc',
    subcategoria_id: 'adiantamento',
    neutro: true,
  }),
]
const SALARIO = 'Salário COMPANHIA ESTADUAL DE DISTRIBUICAO DE ENERGIA ELETRICA - CEEE-D'

describe('sugerirAcao: salário e adiantamento', () => {
  it('liga ao contracheque já detalhado quando as linhas somam o líquido', () => {
    const s = sugerirAcao(
      item({ data: '2026-08-29', descricao: SALARIO, valor: 6085.39, tipo: 'receita' }),
      ctx({ lancamentos: contracheque, categoriasFolha: FOLHA })
    )
    expect(s.acao).toBe('ligar')
    expect(s.lancamentos?.sort()).toEqual(contracheque.map((l) => l.id).sort())
  })

  it('linha já ligada a outra transação não entra na soma', () => {
    const s = sugerirAcao(
      item({ data: '2026-08-29', descricao: SALARIO, valor: 6085.39, tipo: 'receita' }),
      ctx({ lancamentos: contracheque, categoriasFolha: FOLHA, jaLigados: new Set(['odonto']) })
    )
    expect(s.acao).not.toBe('ligar')
  })

  it('adiantamento do dia 15 vira lançamento neutro com a categoria do histórico', () => {
    const s = sugerirAcao(
      item({ data: '2026-10-15', descricao: SALARIO, valor: 2536.21, tipo: 'receita' }),
      ctx({
        lancamentos: [
          lanc({
            id: 'ad8',
            data: '2026-08-14',
            tipo: 'receita',
            valor: 2536.21,
            categoria_id: 'desc',
            subcategoria_id: 'adiantamento',
            neutro: true,
          }),
        ],
        categoriasFolha: FOLHA,
      })
    )
    expect(s).toMatchObject({ acao: 'lancar', neutro: true, categoria: 'desc|adiantamento' })
  })

  it('adiantamento sem histórico neutro é um lançamento comum', () => {
    const s = sugerirAcao(
      item({ data: '2026-10-15', descricao: SALARIO, valor: 2536.21, tipo: 'receita' }),
      ctx({ categoriasFolha: FOLHA })
    )
    expect(s.acao).toBe('lancar')
    expect(s.neutro).toBeFalsy()
  })

  it('salário do fim do mês sem linhas no app sugere detalhar', () => {
    const s = sugerirAcao(
      item({ data: '2026-09-30', descricao: SALARIO, valor: 6202.22, tipo: 'receita' }),
      ctx({ lancamentos: contracheque, categoriasFolha: FOLHA })
    )
    expect(s).toMatchObject({ acao: 'lancar', detalharSalario: true })
  })

  it('despesa com "salário" na descrição segue as regras comuns', () => {
    const s = sugerirAcao(
      item({ data: '2026-09-30', descricao: 'PIX SALARIO DIARISTA', valor: 300 }),
      ctx({ categoriasFolha: FOLHA })
    )
    expect(s.detalharSalario).toBeFalsy()
    expect(s.neutro).toBeFalsy()
  })
})

// Cartões como estão no app: o C6 não tem conta de pagamento cadastrada
const cartoes = [
  { id: 'c6card', nome: 'C6', dia_fechamento: 4, dia_vencimento: 10, conta_pagamento_id: null },
  {
    id: 'itaucard',
    nome: 'Itaú Visa',
    dia_fechamento: 3,
    dia_vencimento: 10,
    conta_pagamento_id: 'itau',
  },
  {
    id: 'nucard',
    nome: 'NuBank Fred',
    dia_fechamento: 31,
    dia_vencimento: 8,
    conta_pagamento_id: 'nufred',
  },
]
function fatura(parcial: Partial<LancamentoApp>): LancamentoApp {
  return lanc({
    conta_id: null,
    status: 'pendente',
    fatura_cartao_id: 'c6card',
    fatura_competencia: '2026-10-01',
    data: '2026-10-10',
    data_vencimento: '2026-10-10',
    ...parcial,
  })
}
const compraC6 = (valor: number, data = '2026-09-20') =>
  lanc({ id: `compra${valor}`, data, valor, conta_id: null, cartao_id: 'c6card' })

describe('sugerirAcao: pagamento de fatura', () => {
  const boletoC6 = (data: string, valor: number) =>
    item({
      data,
      descricao: 'Pagamento de boleto BANCO C6 S.A.',
      valor,
      categoria_banco: 'Credit card payment',
    })

  it('boleto do C6 liga à fatura já paga com o mesmo valor', () => {
    const paga = fatura({
      id: 'fset',
      status: 'pago',
      conta_id: 'itau',
      valor: 273.72,
      data: '2026-09-10',
      data_vencimento: '2026-09-10',
      fatura_competencia: '2026-09-01',
    })
    const s = sugerirAcao(boletoC6('2026-09-11', 273.72), ctx({ lancamentos: [paga], cartoes }))
    expect(s).toMatchObject({ acao: 'ligar', lancamentos: ['fset'] })
  })

  it('débito automático Uniclass vai para a fatura do Itaú Visa', () => {
    const f = fatura({ id: 'fitau', fatura_cartao_id: 'itaucard', valor: 100 })
    const compra = lanc({
      id: 'ci',
      data: '2026-09-20',
      valor: 100,
      conta_id: null,
      cartao_id: 'itaucard',
    })
    const s = sugerirAcao(
      item({
        data: '2026-10-13',
        descricao: 'Débito automático Fatura Uniclass Signature',
        valor: 100,
      }),
      ctx({ lancamentos: [f, compra, fatura({ id: 'fc6', valor: 100 })], cartoes })
    )
    expect(s).toMatchObject({ acao: 'pagar', fatura: 'fitau', bloqueada: false })
  })

  it('"Pagamento de fatura" sem nome de banco usa o cartão pago por aquela conta', () => {
    const f = fatura({
      id: 'fnu',
      fatura_cartao_id: 'nucard',
      valor: 50,
      data_vencimento: '2026-10-08',
    })
    const compra = lanc({
      id: 'cn',
      data: '2026-09-15',
      valor: 50,
      conta_id: null,
      cartao_id: 'nucard',
    })
    const s = sugerirAcao(
      item({
        data: '2026-10-07',
        descricao: 'Pagamento de fatura',
        valor: 50,
        contaBanco: { tipo: 'BANK', conta_id: 'nufred', cartao_id: null },
      }),
      ctx({ lancamentos: [f, compra], cartoes })
    )
    expect(s).toMatchObject({ acao: 'pagar', fatura: 'fnu', bloqueada: false })
  })

  it('pendente com as compras batendo libera o pagamento', () => {
    const s = sugerirAcao(
      boletoC6('2026-10-08', 148.52),
      ctx({
        lancamentos: [
          fatura({ id: 'f', valor: 40.9 }),
          compraC6(40.9),
          compraC6(107.62, '2026-10-02'),
        ],
        cartoes,
      })
    )
    expect(s).toMatchObject({ acao: 'pagar', fatura: 'f', compras: 148.52, bloqueada: false })
  })

  it('pendente com compras faltando fica bloqueada', () => {
    const s = sugerirAcao(
      boletoC6('2026-10-08', 148.52),
      ctx({
        lancamentos: [
          fatura({ id: 'f', valor: 40.9 }),
          compraC6(40.9),
          compraC6(500, '2026-10-20'),
        ],
        cartoes,
      })
    )
    expect(s).toMatchObject({ acao: 'pagar', compras: 40.9, bloqueada: true })
  })

  it('fatura já ligada a outra transação não é reaproveitada', () => {
    const s = sugerirAcao(
      item({
        data: '2026-10-13',
        descricao: 'Débito automático Fatura Uniclass Signature',
        valor: 100,
      }),
      ctx({
        lancamentos: [fatura({ id: 'fitau', fatura_cartao_id: 'itaucard' })],
        cartoes,
        jaLigados: new Set(['fitau']),
      })
    )
    expect(s).toMatchObject({ acao: 'ignorar' })
  })

  it('"fatura" sem fatura no app continua ignorada', () => {
    const s = sugerirAcao(item({ descricao: 'Pagamento de fatura', valor: 80 }), ctx({ cartoes }))
    expect(s.acao).toBe('ignorar')
  })

  it('boleto de outra empresa segue as regras comuns', () => {
    const s = sugerirAcao(
      item({ descricao: 'Pagamento de boleto VERO SANTO ANTONIO DA PATRULHA', valor: 124.68 }),
      ctx({ lancamentos: [fatura({ id: 'f', valor: 124.68 })], cartoes })
    )
    expect(s.acao).toBe('lancar')
  })
})
