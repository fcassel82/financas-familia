import { describe, expect, it } from 'vitest'
import {
  caminhoVoltarSeguro,
  entraNoResumo,
  lerFiltroResumo,
  linkResumo,
  mesesDoIntervalo,
  type ContextoResumo,
  type FiltroResumo,
  type LancamentoResumo,
} from './resumo'

function lanc(parcial: Partial<LancamentoResumo>): LancamentoResumo {
  return {
    id: 'x',
    data: '2026-10-10',
    descricao: 'Teste',
    valor: 10,
    tipo: 'despesa',
    status: 'pago',
    escopo: 'familiar',
    dono_id: 'fred',
    categoria_id: 'alim',
    subcategoria_id: 'super',
    conta_id: 'itau',
    cartao_id: null,
    transferencia_id: null,
    fatura_cartao_id: null,
    neutro: false,
    movimento_investimento: null,
    ...parcial,
  }
}

const ctx: ContextoResumo = {
  grupoDaSubcategoria: new Map([
    ['super', 'necessidade'],
    ['cinema', 'desejo'],
    ['semgrupo', null],
  ]),
  tipoDaConta: new Map([
    ['itau', 'corrente'],
    ['itauinv', 'investimento'],
  ]),
  contaDaTransferencia: new Map([
    ['apl', { origem: 'itau', destino: 'itauinv' }],
    ['resg', { origem: 'itauinv', destino: 'itau' }],
  ]),
  categoriasSalario: new Set(['salario']),
}

const base: FiltroResumo = { de: '2026-09-26', ate: '2026-10-25', regra: 'resultado' }

describe('linkResumo e lerFiltroResumo', () => {
  it('ida e volta mantém o filtro', () => {
    const f: FiltroResumo = {
      ...base,
      regra: '503020',
      tipo: 'despesa',
      categoria: 'sem',
      categorias: ['a', 'b'],
      subcategorias: ['s1', '__sem_subcategoria__'],
      dono: 'gisa',
      grupo: 'investimento',
      escopo: 'familiar',
      membros: ['fred', '__familiar__'],
      conta: 'itau',
      tipoConta: 'investimento',
      movimento: 'aplicado',
      titulo: 'Alimentação & mercado',
    }
    const link = linkResumo(f)
    expect(link.startsWith('/resumo?')).toBe(true)
    expect(lerFiltroResumo(new URLSearchParams(link.split('?')[1]))).toEqual(f)
  })

  it('sem período não há filtro', () => {
    expect(lerFiltroResumo(new URLSearchParams('tipo=despesa'))).toBeNull()
  })

  it('regra desconhecida vira resultado', () => {
    expect(
      lerFiltroResumo(new URLSearchParams('de=2026-10-01&ate=2026-10-31&regra=xyz'))?.regra
    ).toBe('resultado')
  })
})

describe('entraNoResumo', () => {
  it('respeita o período e só conta pagos', () => {
    expect(entraNoResumo(lanc({}), base, ctx)).toBe(true)
    expect(entraNoResumo(lanc({ data: '2026-09-25' }), base, ctx)).toBe(false)
    expect(entraNoResumo(lanc({ status: 'pendente' }), base, ctx)).toBe(false)
  })

  it('regra resultado tira neutro, transferência e fatura agregada', () => {
    expect(entraNoResumo(lanc({ neutro: true }), base, ctx)).toBe(false)
    expect(entraNoResumo(lanc({ transferencia_id: 'apl' }), base, ctx)).toBe(false)
    expect(entraNoResumo(lanc({ fatura_cartao_id: 'nubank' }), base, ctx)).toBe(false)
  })

  it('regra conta inclui transferência e neutro da conta', () => {
    const f: FiltroResumo = { ...base, regra: 'conta', conta: 'itauinv' }
    expect(
      entraNoResumo(lanc({ conta_id: 'itauinv', transferencia_id: 'apl', tipo: 'receita' }), f, ctx)
    ).toBe(true)
    expect(
      entraNoResumo(lanc({ conta_id: 'itauinv', neutro: true, tipo: 'receita' }), f, ctx)
    ).toBe(true)
    expect(entraNoResumo(lanc({ conta_id: 'itau' }), f, ctx)).toBe(false)
  })

  it('categoria sem pega só os sem categoria', () => {
    const f: FiltroResumo = { ...base, categoria: 'sem' }
    expect(entraNoResumo(lanc({ categoria_id: null }), f, ctx)).toBe(true)
    expect(entraNoResumo(lanc({}), f, ctx)).toBe(false)
  })

  it('filtro de várias categorias aceita sem categoria pelo marcador dos Relatórios', () => {
    const f: FiltroResumo = { ...base, categorias: ['alim', '__sem_categoria__'] }
    expect(entraNoResumo(lanc({}), f, ctx)).toBe(true)
    expect(entraNoResumo(lanc({ categoria_id: null }), f, ctx)).toBe(true)
    expect(entraNoResumo(lanc({ categoria_id: 'lazer' }), f, ctx)).toBe(false)
  })

  it('várias subcategorias e quem lançou, como nos Relatórios', () => {
    const f: FiltroResumo = {
      ...base,
      subcategorias: ['super', '__sem_subcategoria__'],
      dono: 'fred',
    }
    expect(entraNoResumo(lanc({}), f, ctx)).toBe(true)
    expect(entraNoResumo(lanc({ subcategoria_id: null }), f, ctx)).toBe(true)
    expect(entraNoResumo(lanc({ subcategoria_id: 'cinema' }), f, ctx)).toBe(false)
    expect(entraNoResumo(lanc({ dono_id: 'gisa' }), f, ctx)).toBe(false)
  })

  it('grupo investimento inclui a aplicação e não o resgate', () => {
    const f: FiltroResumo = { ...base, regra: '503020', grupo: 'investimento' }
    // ponta de saída da aplicação: sai do Itaú (corrente) para o investimento
    expect(entraNoResumo(lanc({ transferencia_id: 'apl', conta_id: 'itau' }), f, ctx)).toBe(true)
    // ponta de chegada da aplicação não conta (seria contar duas vezes)
    expect(
      entraNoResumo(lanc({ transferencia_id: 'apl', conta_id: 'itauinv', tipo: 'receita' }), f, ctx)
    ).toBe(false)
    expect(entraNoResumo(lanc({ transferencia_id: 'resg', conta_id: 'itauinv' }), f, ctx)).toBe(
      false
    )
  })

  it('regra 503020 tira neutro e fatura agregada', () => {
    const f: FiltroResumo = { ...base, regra: '503020', grupo: 'necessidade' }
    expect(entraNoResumo(lanc({}), f, ctx)).toBe(true)
    expect(entraNoResumo(lanc({ neutro: true }), f, ctx)).toBe(false)
    expect(entraNoResumo(lanc({ fatura_cartao_id: 'nubank' }), f, ctx)).toBe(false)
  })

  it('grupo sem pega despesa sem subcategoria ou com subcategoria sem grupo', () => {
    const f: FiltroResumo = { ...base, regra: '503020', grupo: 'sem' }
    expect(entraNoResumo(lanc({ subcategoria_id: 'semgrupo' }), f, ctx)).toBe(true)
    expect(entraNoResumo(lanc({ subcategoria_id: null }), f, ctx)).toBe(true)
    expect(entraNoResumo(lanc({}), f, ctx)).toBe(false)
    expect(entraNoResumo(lanc({ tipo: 'receita', subcategoria_id: null }), f, ctx)).toBe(false)
  })

  it('membros: familiar pelo marcador, pessoal pelo dono', () => {
    const f: FiltroResumo = { ...base, membros: ['gisa', '__familiar__'] }
    expect(entraNoResumo(lanc({ escopo: 'familiar' }), f, ctx)).toBe(true)
    expect(entraNoResumo(lanc({ escopo: 'pessoal', dono_id: 'gisa' }), f, ctx)).toBe(true)
    expect(entraNoResumo(lanc({ escopo: 'pessoal', dono_id: 'fred' }), f, ctx)).toBe(false)
  })

  it('movimento aplicado e resgatado dentro da conta de investimento', () => {
    const aplicado: FiltroResumo = {
      ...base,
      regra: 'conta',
      conta: 'itauinv',
      movimento: 'aplicado',
    }
    const resgatado: FiltroResumo = { ...aplicado, movimento: 'resgatado' }
    const chegada = lanc({ conta_id: 'itauinv', transferencia_id: 'apl', tipo: 'receita' })
    const saida = lanc({ conta_id: 'itauinv', transferencia_id: 'resg', tipo: 'despesa' })
    expect(entraNoResumo(chegada, aplicado, ctx)).toBe(true)
    expect(entraNoResumo(saida, aplicado, ctx)).toBe(false)
    expect(entraNoResumo(saida, resgatado, ctx)).toBe(true)
  })

  it('aplicado na regra 50/30/20 é a saída da conta comum', () => {
    const f: FiltroResumo = {
      ...base,
      regra: '503020',
      grupo: 'investimento',
      movimento: 'aplicado',
    }
    expect(entraNoResumo(lanc({ transferencia_id: 'apl', conta_id: 'itau' }), f, ctx)).toBe(true)
    expect(entraNoResumo(lanc({ subcategoria_id: 'super' }), f, ctx)).toBe(false)
  })

  it('tipo de conta: aplicações em todos os investimentos, sem o resgate que chega na corrente', () => {
    const f: FiltroResumo = {
      ...base,
      regra: 'conta',
      tipoConta: 'investimento',
      movimento: 'aplicado',
    }
    expect(
      entraNoResumo(lanc({ conta_id: 'itauinv', transferencia_id: 'apl', tipo: 'receita' }), f, ctx)
    ).toBe(true)
    expect(
      entraNoResumo(lanc({ conta_id: 'itau', transferencia_id: 'resg', tipo: 'receita' }), f, ctx)
    ).toBe(false)
  })

  it('movimento rendimento', () => {
    const f: FiltroResumo = { ...base, regra: 'conta', conta: 'itauinv', movimento: 'rendimento' }
    const rend = lanc({
      conta_id: 'itauinv',
      neutro: true,
      tipo: 'receita',
      movimento_investimento: 'rendimento',
    })
    expect(entraNoResumo(rend, f, ctx)).toBe(true)
    expect(entraNoResumo({ ...rend, movimento_investimento: 'aporte_empresa' }, f, ctx)).toBe(false)
  })
})

describe('meses pela regra do salário', () => {
  const maio: FiltroResumo = { de: '2026-04-26', ate: '2026-05-31', meses: ['2026-05'], regra: 'resultado' }

  it('compra de 29/04 fica em abril; salário de 28/04 vai para maio', () => {
    expect(entraNoResumo(lanc({ data: '2026-04-29' }), maio, ctx)).toBe(false)
    expect(entraNoResumo(lanc({ data: '2026-05-29' }), maio, ctx)).toBe(true)
    expect(entraNoResumo(lanc({ data: '2026-04-28', tipo: 'receita', categoria_id: 'salario' }), maio, ctx)).toBe(true)
    expect(entraNoResumo(lanc({ data: '2026-05-28', tipo: 'receita', categoria_id: 'salario' }), maio, ctx)).toBe(false)
  })

  it('ida e volta do link mantém os meses', () => {
    expect(lerFiltroResumo(new URLSearchParams(linkResumo(maio).split('?')[1]))).toEqual(maio)
  })
})

describe('mesesDoIntervalo', () => {
  it('conta meses do calendário', () => {
    expect(mesesDoIntervalo('2026-01-01', '2026-12-31')).toBe(12)
    expect(mesesDoIntervalo('2026-10-01', '2026-10-31')).toBe(1)
    expect(mesesDoIntervalo('2026-04-15', '2026-06-10')).toBe(3)
  })
})

describe('caminhoVoltarSeguro', () => {
  it('só aceita caminho interno', () => {
    expect(caminhoVoltarSeguro('/resumo?de=1')).toBe('/resumo?de=1')
    expect(caminhoVoltarSeguro('//site.com')).toBe('/transacoes')
    expect(caminhoVoltarSeguro('https://site.com')).toBe('/transacoes')
    expect(caminhoVoltarSeguro(null)).toBe('/transacoes')
  })
})
