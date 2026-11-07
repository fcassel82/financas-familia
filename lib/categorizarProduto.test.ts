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

const PETS = { categoria: 'Pets', subcategoria: 'Ração e Petiscos' }
const CARNES = { categoria: 'Alimentação', subcategoria: 'Carnes' }

describe('sugerirCategoria — miúdos e ossos para a pet', () => {
  it('fígado, moela, pescoço, pé de galinha e ossos e sebo vão para Pets', () => {
    expect(sugerirCategoria('FIGADO FRANGO AGROSUL 1KG')).toEqual(PETS)
    expect(sugerirCategoria('FIGADO RESFRIADO - PCT')).toEqual(PETS)
    expect(sugerirCategoria('MOELA FGO CARRER RESF BDJ 750g')).toEqual(PETS)
    expect(sugerirCategoria('PESCOCO FGO AVE SERRA RESF BDJ 700g')).toEqual(PETS)
    expect(sugerirCategoria('PE DE GALINHA CONG KG')).toEqual(PETS)
    expect(sugerirCategoria('OSSOS E SEBO KG')).toEqual(PETS)
  })

  it('carnes da família seguem em Carnes, mesmo com osso', () => {
    expect(sugerirCategoria('ACEM BOV (AGULHA) C/OSSO kg')).toEqual(CARNES)
    expect(sugerirCategoria('PALETA BOV C/OSSO kg')).toEqual(CARNES)
    expect(sugerirCategoria('PEITO C/ OSSO RESFRIADO - PCT')).not.toEqual(PETS)
    expect(sugerirCategoria('COXA E SOBRECOXA RESFRIADA - PCT')).toEqual(CARNES)
  })

  it('pé de moleque não é pé de galinha', () => {
    expect(sugerirCategoria('PE DE MOLEQUE 250G')).not.toEqual(PETS)
  })
})

describe('sugerirCategoria — higiene', () => {
  it('sabonete líquido continua em higiene', () => {
    expect(sugerirCategoria('SABT LIQ NEF COCO 1L')).toEqual({
      categoria: 'Mercado',
      subcategoria: 'Produtos de Higiene',
    })
  })
})
