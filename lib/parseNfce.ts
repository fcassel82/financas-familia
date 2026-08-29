import { Jimp } from 'jimp'
import jsQR from 'jsqr'

/**
 * Domínios oficiais da SEFAZ que sabemos processar. O QR code de uma nota
 * fiscal aponta para uma URL — antes de o servidor buscar essa URL, ela
 * precisa estar nesta lista, ou um QR malicioso poderia fazer o servidor
 * buscar qualquer endereço (SSRF). Hoje só o Rio Grande do Sul foi testado;
 * adicionar outro estado é só incluir o domínio aqui.
 */
const DOMINIOS_PERMITIDOS = ['www.sefaz.rs.gov.br', 'sefaz.rs.gov.br']

export function validarUrlNfce(url: string): URL | null {
  try {
    const analisada = new URL(url)
    if (analisada.protocol !== 'https:' && analisada.protocol !== 'http:') return null
    if (!DOMINIOS_PERMITIDOS.includes(analisada.hostname)) return null
    return analisada
  } catch {
    return null
  }
}

/**
 * Tenta decodificar um QR Code a partir de uma foto de cupom fiscal.
 *
 * Fotos de cupom são um caso difícil: a nota é impressa em impressora
 * térmica (textura granulada, baixo contraste) e a foto costuma vir
 * rotacionada (celular na horizontal/vertical) e com iluminação irregular.
 * Por isso tentamos várias rotações e, em cada uma, aplicamos escala de
 * cinza + contraste antes de procurar o QR — na prática o jsQR raramente
 * decodifica a imagem original sem esse realce.
 */
export async function decodificarQrDeImagem(buffer: ArrayBuffer): Promise<string | null> {
  const lida = await Jimp.read(Buffer.from(buffer))

  // Fotos de celular vêm em altíssima resolução (12MP+), o que deixa o jsQR
  // muito lento sem necessidade — o QR ainda fica perfeitamente legível bem
  // menor. Reduzir antes de tudo é o que faz essa função rodar em segundos
  // em vez de dezenas de segundos.
  const maiorLado = Math.max(lida.bitmap.width, lida.bitmap.height)
  const original = maiorLado > 1400 ? lida.scale(1400 / maiorLado) : lida

  for (const graus of [0, 90, 180, 270]) {
    const rotacionada = graus === 0 ? original.clone() : original.clone().rotate(graus)

    // Ordenado do que mais costuma funcionar pro que menos costuma, já que a
    // primeira tentativa que decodificar interrompe a busca
    const tentativas = [
      rotacionada.clone().greyscale().contrast(0.6),
      rotacionada.clone().greyscale().contrast(0.3),
      rotacionada.clone().greyscale().contrast(0.9),
      rotacionada.clone().greyscale(),
      rotacionada,
    ]

    for (const tentativa of tentativas) {
      const { width, height, data } = tentativa.bitmap
      const resultado = jsQR(new Uint8ClampedArray(data), width, height, {
        inversionAttempts: 'attemptBoth',
      })
      if (resultado?.data) return resultado.data
    }
  }

  return null
}

export type ItemNfce = {
  descricao: string
  codigo: string
  quantidade: number
  unidade: string
  valorUnitario: number
  valorTotal: number
}

export type NotaFiscal = {
  loja: string | null
  cnpj: string | null
  /** ISO (AAAA-MM-DD); null quando a página não trouxe a data de emissão */
  dataEmissao: string | null
  quantidadeItens: number
  valorTotal: number | null
  desconto: number | null
  valorPago: number | null
  formaPagamento: string | null
  itens: ItemNfce[]
}

function paraNumero(texto: string): number {
  return parseFloat(texto.trim().replace(/\./g, '').replace(',', '.'))
}

const PADRAO_ITEM =
  /<tr id="Item \+ \d+"><td valign="top"><span class="txtTit">([^<]+)<\/span>\s*<span class="RCod">\s*\(\s*Código:\s*([^<)]+?)\s*\)\s*<\/span>\s*<br\s*\/>\s*<span class="Rqtd"><strong>Qtde\.:<\/strong>([^<]+)<\/span>\s*<span class="RUN"><strong>UN:\s*<\/strong>([^<]+)<\/span>\s*<span class="RvlUnit"><strong>Vl\. Unit\.:<\/strong>\s*([^<]+?)\s*<\/span><\/td>\s*<td[^>]*>\s*Vl\. Total\s*<br\s*\/>\s*<span class="valor">([^<]+)<\/span>\s*<\/td><\/tr>/g

/** "29/08/2026" → "2026-08-29" */
function dataBrParaIso(data: string): string | null {
  const m = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

/**
 * Extrai os itens e totais do HTML retornado pela consulta pública da NFC-e.
 * O formato abaixo é o da SEFAZ-RS; outros estados usam páginas diferentes.
 */
export function parsearPaginaNfce(html: string): NotaFiscal {
  const itens: ItemNfce[] = []
  for (const m of html.matchAll(PADRAO_ITEM)) {
    itens.push({
      descricao: m[1].replace(/\s+/g, ' ').trim(),
      codigo: m[2].trim(),
      quantidade: paraNumero(m[3]),
      unidade: m[4].trim(),
      valorUnitario: paraNumero(m[5]),
      valorTotal: paraNumero(m[6]),
    })
  }

  const loja = html.match(/class="txtTopo">([^<]+)</)?.[1]?.trim() ?? null
  const cnpj = html.match(/CNPJ:\s*([\d./-]{18})/)?.[1] ?? null
  const emissao = html.match(/Emissão:\s*<\/strong>\s*(\d{2}\/\d{2}\/\d{4})/)?.[1]
  const qtdItens = html.match(/Qtd\. total de itens:<\/label><span class="totalNumb">(\d+)<\/span>/)
  const valorTotal = html.match(/Valor total R\$:<\/label><span class="totalNumb">([\d.,]+)<\/span>/)
  const desconto = html.match(/Descontos R\$:<\/label><span class="totalNumb">([\d.,]+)<\/span>/)
  const valorPagar = html.match(
    /Valor a pagar R\$:<\/label><span class="totalNumb txtMax">([\d.,]+)<\/span>/
  )
  const formaPagamento = html.match(
    /<label class="tx">\s*([^<]+?)\s*<\/label><span class="totalNumb">[\d.,]+<\/span>/
  )

  return {
    loja,
    cnpj,
    dataEmissao: emissao ? dataBrParaIso(emissao) : null,
    quantidadeItens: qtdItens ? parseInt(qtdItens[1], 10) : itens.length,
    valorTotal: valorTotal ? paraNumero(valorTotal[1]) : null,
    desconto: desconto ? paraNumero(desconto[1]) : null,
    valorPago: valorPagar ? paraNumero(valorPagar[1]) : null,
    formaPagamento: formaPagamento ? formaPagamento[1].trim() : null,
    itens,
  }
}
