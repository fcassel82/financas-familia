export type LancamentoOfx = {
  data: string
  descricao: string
  valor: number
  /** 'receita' quando o valor no arquivo é positivo, 'despesa' quando negativo */
  tipo: 'receita' | 'despesa'
  /** Identificador do banco, usado para não importar a mesma transação duas vezes */
  idBanco: string
}

/**
 * Extrai o valor de uma tag OFX. O formato é SGML: as tags de dado normalmente
 * não são fechadas, e o valor vai do fim da tag até a próxima tag ou quebra de
 * linha. Ex.: "<TRNAMT>-150.30" ou "<MEMO>MERCADO</MEMO>".
 */
function tag(bloco: string, nome: string): string {
  const re = new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i')
  return bloco.match(re)?.[1]?.trim() ?? ''
}

/** "20260615120000[-3:BRT]" ou "20260615" → "2026-06-15" */
function dataOfxParaISO(bruta: string): string {
  const digitos = bruta.replace(/[^\d]/g, '')
  if (digitos.length < 8) return ''
  return `${digitos.slice(0, 4)}-${digitos.slice(4, 6)}-${digitos.slice(6, 8)}`
}

/**
 * Arquivos OFX brasileiros costumam vir em ISO-8859-1 (Latin-1), não UTF-8.
 * Lidos como UTF-8, acentos viram caracteres quebrados. Aqui o cabeçalho é
 * consultado para escolher a decodificação certa.
 */
export function decodificarOfx(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)

  // O cabeçalho é sempre ASCII, então pode ser lido byte a byte com segurança
  const inicio = String.fromCharCode(...bytes.slice(0, 512))
  const charset = inicio.match(/CHARSET:\s*([^\s]+)/i)?.[1]?.toUpperCase() ?? ''
  const encoding = inicio.match(/ENCODING:\s*([^\s]+)/i)?.[1]?.toUpperCase() ?? ''

  const ehLatin1 =
    charset.includes('1252') ||
    charset.includes('8859') ||
    encoding.includes('USASCII') ||
    charset === 'NONE'

  const rotulo = ehLatin1 ? 'windows-1252' : 'utf-8'

  try {
    return new TextDecoder(rotulo).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** Lê os lançamentos (<STMTTRN>) de um arquivo OFX já decodificado */
export function parsearOfx(conteudo: string): LancamentoOfx[] {
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? []

  const lancamentos: LancamentoOfx[] = []

  for (const bloco of blocos) {
    const data = dataOfxParaISO(tag(bloco, 'DTPOSTED'))
    if (!data) continue

    const valorBruto = parseFloat(tag(bloco, 'TRNAMT').replace(',', '.'))
    if (!Number.isFinite(valorBruto) || valorBruto === 0) continue

    // MEMO costuma ser mais descritivo; NAME é o campo alternativo
    const descricao = tag(bloco, 'MEMO') || tag(bloco, 'NAME') || 'Lançamento importado'

    lancamentos.push({
      data,
      descricao: descricao.replace(/\s+/g, ' ').trim(),
      valor: Math.abs(valorBruto),
      tipo: valorBruto >= 0 ? 'receita' : 'despesa',
      idBanco: tag(bloco, 'FITID'),
    })
  }

  return lancamentos
}

export type ItemConciliacao = {
  chave: string
  data: string
  descricao: string
  valor: number
  tipo: 'receita' | 'despesa'
  transacaoId: string | null
}

export type ExistenteParaConciliar = { id: string; data: string; valor: number; tipo: string }

/**
 * Casa cada linha de um extrato importado (conta ou fatura de cartão) com um
 * lançamento já cadastrado (mesma data, mesmo valor, mesmo tipo). Um
 * lançamento já usado não é reaproveitado para casar com uma segunda linha.
 */
export function conciliarComExistentes(
  itensOfx: LancamentoOfx[],
  existentes: ExistenteParaConciliar[]
): ItemConciliacao[] {
  const usados = new Set<string>()
  return itensOfx.map((item, indice) => {
    const encontrado = existentes.find(
      (e) =>
        !usados.has(e.id) &&
        e.data === item.data &&
        e.tipo === item.tipo &&
        Math.abs(Number(e.valor) - item.valor) < 0.005
    )
    if (encontrado) usados.add(encontrado.id)
    return {
      chave: item.idBanco || `${item.data}-${item.valor}-${item.tipo}-${indice}`,
      data: item.data,
      descricao: item.descricao,
      valor: item.valor,
      tipo: item.tipo,
      transacaoId: encontrado?.id ?? null,
    }
  })
}
