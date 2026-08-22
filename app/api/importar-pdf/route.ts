import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs'
import { parseData, parseValor } from '@/lib/parseExtrato'

// pdfjs-dist tenta localizar o worker via `import()` dinâmico, o que o Turbopack
// não consegue empacotar corretamente no bundle do servidor. Registrando o handler
// aqui diretamente, o pdfjs usa este global em vez de tentar o import dinâmico.
;(globalThis as unknown as { pdfjsWorker?: { WorkerMessageHandler: typeof WorkerMessageHandler } }).pdfjsWorker = {
  WorkerMessageHandler,
}

const REGEX_LINHA_DATA = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.*)$/
const REGEX_VALOR_FIM = /(-?R?\$?\s?-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d{1,3}(?:,\d{3})*\.\d{2})\s*$/

function parsearLinhasExtratoPdf(linhas: string[]) {
  const resultado: { data: string; descricao: string; valor: number }[] = []
  for (const linha of linhas) {
    const mData = linha.match(REGEX_LINHA_DATA)
    if (!mData) continue
    const resto = mData[2]
    const mValor = resto.match(REGEX_VALOR_FIM)
    if (!mValor || mValor.index === undefined) continue
    const descricao = resto.slice(0, mValor.index).trim()
    if (!descricao) continue
    const valor = Math.abs(parseValor(mValor[1]))
    if (!valor || isNaN(valor)) continue
    resultado.push({ data: parseData(mData[1]), descricao, valor })
  }
  return resultado
}

async function extrairLinhasDePdf(buffer: ArrayBuffer, senha: string | undefined) {
  const pdf = await pdfjsLib.getDocument({ data: buffer, password: senha }).promise

  const linhasTexto: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i)
    const conteudo = await pagina.getTextContent()

    const itens = conteudo.items
      .filter(
        (item): item is Extract<typeof item, { transform: number[] }> =>
          'transform' in item && 'str' in item
      )
      .map((item) => ({
        texto: item.str,
        x: item.transform[4],
        y: item.transform[5],
      }))
      .sort((a, b) => b.y - a.y || a.x - b.x)

    let linhaAtual: typeof itens = []
    let ultimoY: number | null = null
    for (const item of itens) {
      if (ultimoY === null || Math.abs(item.y - ultimoY) < 3) {
        linhaAtual.push(item)
      } else {
        linhasTexto.push(linhaAtual.map((it) => it.texto).join(' ').replace(/\s+/g, ' ').trim())
        linhaAtual = [item]
      }
      ultimoY = item.y
    }
    if (linhaAtual.length) {
      linhasTexto.push(linhaAtual.map((it) => it.texto).join(' ').replace(/\s+/g, ' ').trim())
    }
  }

  return parsearLinhasExtratoPdf(linhasTexto.filter(Boolean))
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: userData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const formData = await request.formData()
  const arquivo = formData.get('arquivo')
  const senha = formData.get('senha')
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 })
  }

  try {
    const buffer = await arquivo.arrayBuffer()
    const transacoes = await extrairLinhasDePdf(
      buffer,
      typeof senha === 'string' && senha ? senha : undefined
    )
    return NextResponse.json({ transacoes })
  } catch (err) {
    if (err instanceof Error && err.name === 'PasswordException') {
      const senhaFornecida = typeof senha === 'string' && senha
      return NextResponse.json(
        {
          error: senhaFornecida
            ? 'Senha incorreta. Tente novamente.'
            : 'Este PDF está protegido por senha.',
          precisaSenha: true,
        },
        { status: 401 }
      )
    }
    console.error('Falha ao processar PDF:', err)
    return NextResponse.json(
      { error: 'Não foi possível ler este PDF. Ele pode estar protegido ou ser uma imagem escaneada.' },
      { status: 422 }
    )
  }
}
