import { describe, expect, it } from 'vitest'
import { sugerirCategoria } from './categorizarProduto'

const COSMETICOS = { categoria: 'Cuidados Pessoais', subcategoria: 'Cosméticos, Perfumaria e Maquiagem' }

describe('sugerirCategoria — desodorantes e cosméticos', () => {
  it('desodorante vai para Cuidados Pessoais, inclusive abreviado no cupom', () => {
    expect(sugerirCategoria('DES AER ABOVE M EXTREME INVISIB')).toEqual(COSMETICOS)
    expect(sugerirCategoria('DES REXONA CLINICAL S/PERF 150ML')).toEqual(COSMETICOS)
    expect(sugerirCategoria('DESODORANTE NIVEA ROLL ON 50ML')).toEqual(COSMETICOS)
  })

  it('desinfetante continua em produtos de limpeza', () => {
    expect(sugerirCategoria('DESINFETANTE PINHO SOL 500ML')).toEqual({
      categoria: 'Mercado',
      subcategoria: 'Produtos de limpeza',
    })
  })

  it('limpador perfumado continua em limpeza, não em perfumaria', () => {
    expect(sugerirCategoria('LIMP PERF CASA PERFUME SENSUALI')).toEqual({
      categoria: 'Mercado',
      subcategoria: 'Produtos de limpeza',
    })
  })

  it('cosméticos usam o nome de categoria que existe no banco', () => {
    expect(sugerirCategoria('ESMALTE RISQUE VERMELHO')).toEqual(COSMETICOS)
  })

  it('sabonete continua em higiene', () => {
    expect(sugerirCategoria('SABT PALMOLIVE OLEO NUTR CAM/AM')).toEqual({
      categoria: 'Mercado',
      subcategoria: 'Produtos de Higiene',
    })
  })
})
