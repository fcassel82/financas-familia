import { describe, expect, it } from 'vitest'
import { chaveDaUrlNfce, ratearDesconto } from './notaFiscal'

const somaCentavos = (v: number[]) => v.reduce((s, x) => s + Math.round(x * 100), 0)

describe('ratearDesconto', () => {
  it('distribui o desconto e a soma fecha com o valor pago', () => {
    const liquidos = ratearDesconto([10.01, 7.33, 3.33], 20)
    expect(somaCentavos(liquidos)).toBe(2000)
    expect(liquidos).toEqual([9.67, 7.1, 3.23])
  })

  it('sem desconto ou sem valor pago devolve os valores impressos', () => {
    expect(ratearDesconto([5, 2.5], 7.5)).toEqual([5, 2.5])
    expect(ratearDesconto([5, 2.5], null)).toEqual([5, 2.5])
  })

  it('a sobra de centavos vai para o item mais caro', () => {
    const liquidos = ratearDesconto([1, 1, 1], 2)
    expect(somaCentavos(liquidos)).toBe(200)
    expect(liquidos.filter((v) => v !== 0.67)).toHaveLength(1)
  })
})

describe('chaveDaUrlNfce', () => {
  const chave = '35180645543915059232550020018187671618535259'

  it('lê a chave do parâmetro p do QR Code', () => {
    expect(
      chaveDaUrlNfce(`https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=${chave}|2|1|1|ABCDEF`)
    ).toBe(chave)
  })

  it('aceita a barra vertical codificada na URL', () => {
    expect(chaveDaUrlNfce(`https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=${chave}%7C2%7C1`)).toBe(
      chave
    )
  })

  it('recusa chave com dígito verificador errado', () => {
    const errada = chave.slice(0, 43) + '0'
    expect(chaveDaUrlNfce(`https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=${errada}|2`)).toBeNull()
  })

  it('URL sem chave devolve null', () => {
    expect(chaveDaUrlNfce('https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx')).toBeNull()
  })
})
