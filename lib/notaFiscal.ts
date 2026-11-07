/**
 * Contas da nota fiscal que não dependem da leitura da imagem (essas ficam em
 * parseNfce.ts). Sem imports de propósito: o Vitest testa este arquivo direto.
 */

/**
 * Valor de cada item com o desconto da nota rateado proporcionalmente, para a
 * soma dos itens fechar com o valor pago — que é o que o banco mostra. A sobra
 * de centavos do arredondamento fica no item mais caro.
 */
export function ratearDesconto(valores: number[], valorPago: number | null): number[] {
  const centavos = valores.map((v) => Math.round(v * 100))
  const soma = centavos.reduce((s, c) => s + c, 0)
  if (valorPago == null || soma === 0) return [...valores]
  const desconto = soma - Math.round(valorPago * 100)
  if (desconto === 0) return [...valores]

  let usado = 0
  const liquidos = centavos.map((c) => {
    const parte = Math.floor((desconto * c) / soma)
    usado += parte
    return c - parte
  })
  const maior = liquidos.indexOf(Math.max(...liquidos))
  liquidos[maior] -= desconto - usado
  return liquidos.map((c) => c / 100)
}

/** Dígito verificador da chave de acesso: módulo 11, pesos 2 a 9 da direita para a esquerda */
function chaveValida(chave: string): boolean {
  let soma = 0
  for (let i = 42, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1) {
    soma += Number(chave[i]) * peso
  }
  const resto = soma % 11
  return (resto < 2 ? 0 : 11 - resto) === Number(chave[43])
}

/** Chave de acesso (44 dígitos) do QR Code da NFC-e: "...?p=<chave>|2|1|1|hash" */
export function chaveDaUrlNfce(url: string): string | null {
  let texto = url
  try {
    texto = decodeURIComponent(url)
  } catch {
    // URL com "%" solto: procura a chave no texto como veio
  }
  const chave = texto.match(/[?&](?:p|chNFe)=(\d{44})(?!\d)/)?.[1]
  return chave && chaveValida(chave) ? chave : null
}
