import { describe, expect, it } from 'vitest'
import {
  comerciante,
  normalizarDescricao,
  pareceCartao,
  sugerirCategoria,
  sugerirOrigem,
  sugerirSubcategoria,
  type Historico,
} from './sugestoes'

function hist(parcial: Partial<Historico>): Historico {
  return {
    descricao: 'X',
    tipo: 'despesa',
    dono_id: 'fred',
    conta_id: null,
    cartao_id: null,
    categoria_id: null,
    subcategoria_id: null,
    ...parcial,
  }
}

const contas = [
  { id: 'itau', nome: 'Itaú', tipo: 'corrente', ativo: true },
  { id: 'velha', nome: 'Conta antiga', tipo: 'corrente', ativo: false },
  { id: 'inv', nome: 'Itaú Investimento', tipo: 'investimento', ativo: true },
]
const cartoes = [
  { id: 'nu', nome: 'Nubank', ativo: true },
  { id: 'c6', nome: 'C6', ativo: true },
]
const categorias = [
  { id: 'assin', nome: 'Assinaturas', tipo: 'despesa' },
  { id: 'alim', nome: 'Alimentação', tipo: 'despesa' },
  { id: 'casa', nome: 'Casa', tipo: 'despesa' },
  { id: 'sal', nome: 'Salário', tipo: 'receita' },
]
const subcategorias = [
  { id: 'stream', nome: 'Streaming', categoria_id: 'assin' },
  { id: 'suco', nome: 'Suco / Água / Refri', categoria_id: 'alim' },
]

describe('normalizarDescricao', () => {
  it('ignora espaços, números, pontuação e acentos', () => {
    expect(normalizarDescricao('EBN*SPOTIFY')).toBe('ebn spotify')
    expect(normalizarDescricao('EBN         *SPOTIFY')).toBe('ebn spotify')
    expect(normalizarDescricao('Açougue 123')).toBe('acougue')
  })

  it('só números vira vazio', () => {
    expect(normalizarDescricao('123')).toBe('')
  })
})

describe('comerciante', () => {
  it('parte antes do asterisco, sem espaços', () => {
    expect(comerciante('MERCADOLIVRE*MERCADOI')).toBe('mercadolivre')
    expect(comerciante('MUELLER     *MUELLER')).toBe('mueller')
  })

  it('sem asterisco, a primeira palavra', () => {
    expect(comerciante('PADARIA BRASIL')).toBe('padaria')
  })

  it('curto demais não conta', () => {
    expect(comerciante('MP*LOJA')).toBeNull()
    expect(comerciante('123')).toBeNull()
  })
})

describe('pareceCartao', () => {
  it('asterisco ou parcela', () => {
    expect(pareceCartao('EBN*SPOTIFY')).toBe(true)
    expect(pareceCartao('MERC PECAS ACESSO(1/2)')).toBe(true)
    expect(pareceCartao('PADARIA BRASIL')).toBe(false)
  })
})

describe('sugerirOrigem', () => {
  const historico = [
    hist({ descricao: 'EBN *SPOTIFY', cartao_id: 'nu' }),
    hist({ descricao: 'EBN*SPOTIFY', cartao_id: 'nu' }),
    hist({ descricao: 'EBN*SPOTIFY', cartao_id: 'nu' }),
    hist({ descricao: 'EBN*NETFLIX', cartao_id: 'c6' }),
    hist({ descricao: 'Mercado', conta_id: 'itau' }),
    hist({ descricao: 'Outra', conta_id: 'velha' }),
    hist({ descricao: 'Aplicação', conta_id: 'inv' }),
  ]

  it('mesma descrição vem primeiro, com o motivo', () => {
    const s = sugerirOrigem(hist({ descricao: 'EBN*SPOTIFY' }), historico, contas, cartoes)
    expect(s[0]).toMatchObject({ tipo: 'cartao', id: 'nu', nome: 'Nubank' })
    expect(s[0].motivo).toBe('Mesma descrição: 3 vezes')
    expect(s.length).toBeLessThanOrEqual(3)
  })

  it('mesmo comerciante pontua quando a descrição muda', () => {
    const s = sugerirOrigem(hist({ descricao: 'EBN*DISNEY' }), historico, contas, cartoes)
    expect(s[0].id).toBe('nu')
    expect(s[0].motivo).toBe('Mesmo comerciante (ebn): 3 vezes')
  })

  it('nunca sugere conta inativa nem de investimento como reserva', () => {
    const s = sugerirOrigem(hist({ descricao: 'Algo novo' }), historico, contas, cartoes)
    expect(s.map((x) => x.id)).not.toContain('velha')
    expect(s.map((x) => x.id)).not.toContain('inv')
    expect(s.length).toBeGreaterThan(0)
  })

  it('ordena por pontos e devolve no máximo 3', () => {
    const s = sugerirOrigem(hist({ descricao: 'EBN*SPOTIFY' }), historico, contas, cartoes)
    const pontos = s.map((x) => x.pontos)
    expect([...pontos].sort((a, b) => b - a)).toEqual(pontos)
    expect(s.length).toBeLessThanOrEqual(3)
  })
})

describe('sugerirCategoria', () => {
  const historico = [
    hist({ descricao: 'EBN*SPOTIFY', categoria_id: 'assin', subcategoria_id: 'stream' }),
    hist({ descricao: 'EBN*SPOTIFY', categoria_id: 'assin', subcategoria_id: 'stream' }),
    hist({ descricao: 'Ferragem', categoria_id: 'casa' }),
    hist({ descricao: 'Salário', tipo: 'receita', categoria_id: 'sal' }),
  ]

  it('mesma descrição traz categoria e subcategoria', () => {
    const s = sugerirCategoria(
      hist({ descricao: 'EBN *SPOTIFY' }),
      historico,
      categorias,
      subcategorias
    )
    expect(s[0]).toMatchObject({
      categoria_id: 'assin',
      subcategoria_id: 'stream',
      nome: 'Assinaturas / Streaming',
    })
    expect(s[0].motivo).toBe('Mesma descrição: 2 vezes')
  })

  it('dicionário de produtos para nota fiscal', () => {
    const s = sugerirCategoria(
      hist({ descricao: 'SUCO DE UVA 1L' }),
      historico,
      categorias,
      subcategorias
    )
    expect(s[0]).toMatchObject({
      categoria_id: 'alim',
      subcategoria_id: 'suco',
      motivo: 'Pelo nome do produto',
    })
  })

  it('só sugere categorias do mesmo tipo', () => {
    const s = sugerirCategoria(
      hist({ descricao: 'Algo novo' }),
      historico,
      categorias,
      subcategorias
    )
    expect(s.map((x) => x.categoria_id)).not.toContain('sal')
    expect(s.length).toBeGreaterThan(0)
  })
})

describe('sugerirSubcategoria', () => {
  const subs = [
    { id: 'super', nome: 'Supermercado', categoria_id: 'alim' },
    { id: 'suco', nome: 'Suco / Água / Refri', categoria_id: 'alim' },
    { id: 'stream', nome: 'Streaming', categoria_id: 'assin' },
  ]
  const historico = [
    hist({ descricao: 'ZAFFARI', categoria_id: 'alim', subcategoria_id: 'super' }),
    hist({ descricao: 'ZAFFARI', categoria_id: 'alim', subcategoria_id: 'super' }),
    hist({ descricao: 'EBN*SPOTIFY', categoria_id: 'assin', subcategoria_id: 'stream' }),
  ]

  it('só sugere subcategorias da categoria do lançamento', () => {
    const s = sugerirSubcategoria(
      hist({ descricao: 'ZAFFARI', categoria_id: 'alim' }),
      historico,
      subs
    )
    expect(s[0]).toMatchObject({
      categoria_id: 'alim',
      subcategoria_id: 'super',
      nome: 'Supermercado',
    })
    expect(s[0].motivo).toBe('Mesma descrição: 2 vezes')
    expect(s.map((x) => x.subcategoria_id)).not.toContain('stream')
  })

  it('dicionário de produtos dentro da categoria', () => {
    const s = sugerirSubcategoria(
      hist({ descricao: 'SUCO DE UVA', categoria_id: 'alim' }),
      historico,
      subs
    )
    expect(s[0]).toMatchObject({ subcategoria_id: 'suco', motivo: 'Pelo nome do produto' })
  })

  it('sem categoria não sugere nada', () => {
    expect(sugerirSubcategoria(hist({ descricao: 'ZAFFARI' }), historico, subs)).toEqual([])
  })
})
