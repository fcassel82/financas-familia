/**
 * Reduz uma foto antes de enviá-la ao servidor.
 *
 * Foto de celular vem com 12 MP e 3–8 MB. Isso esbarra no limite de corpo da
 * Vercel (~4,5 MB numa function), e o erro que chega ao usuário é opaco. Como
 * o servidor já reduz a imagem para 1400 px antes de procurar o QR Code, mandar
 * o arquivo original é desperdício puro: reduzir aqui não perde nada de
 * legibilidade do QR e derruba o upload para algumas centenas de KB.
 *
 * Se o navegador não conseguir decodificar (HEIC costuma falhar), devolve o
 * arquivo original — aí o limite de tamanho do servidor produz uma mensagem
 * clara em vez de um erro genérico.
 */
export async function reduzirImagem(arquivo: File, ladoMaximo = 1600): Promise<File> {
  if (!arquivo.type.startsWith('image/')) return arquivo

  try {
    const bitmap = await createImageBitmap(arquivo)
    const maior = Math.max(bitmap.width, bitmap.height)

    if (maior <= ladoMaximo) {
      bitmap.close()
      return arquivo
    }

    const escala = ladoMaximo / maior
    const largura = Math.round(bitmap.width * escala)
    const altura = Math.round(bitmap.height * escala)

    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = altura
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return arquivo
    }
    ctx.drawImage(bitmap, 0, 0, largura, altura)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    )
    if (!blob || blob.size >= arquivo.size) return arquivo

    return new File([blob], arquivo.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
    })
  } catch {
    // Formato que o navegador não decodifica — deixa o servidor responder
    return arquivo
  }
}
