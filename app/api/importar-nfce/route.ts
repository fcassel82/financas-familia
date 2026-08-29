import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decodificarQrDeImagem, parsearPaginaNfce, validarUrlNfce } from '@/lib/parseNfce'

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
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ error: 'Imagem não enviada.' }, { status: 400 })
  }

  let urlQr: string | null
  try {
    urlQr = await decodificarQrDeImagem(await arquivo.arrayBuffer())
  } catch (err) {
    console.error('Falha ao ler imagem da nota:', err)
    return NextResponse.json(
      { error: 'Não foi possível ler esta imagem. Envie uma foto (JPG ou PNG) do cupom.' },
      { status: 422 }
    )
  }

  if (!urlQr) {
    return NextResponse.json(
      {
        error:
          'Não encontrei um QR Code nesta foto. Tente enquadrar melhor, com boa luz e o QR sem cortes.',
      },
      { status: 422 }
    )
  }

  const url = validarUrlNfce(urlQr)
  if (!url) {
    return NextResponse.json(
      {
        error:
          'Este QR Code não é de uma nota fiscal do Rio Grande do Sul — por enquanto só esse estado é suportado.',
      },
      { status: 422 }
    )
  }

  let html: string
  try {
    const resposta = await fetch(url.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!resposta.ok) {
      return NextResponse.json(
        { error: 'A Receita Estadual não respondeu para esta nota. Tente novamente em instantes.' },
        { status: 502 }
      )
    }
    html = await resposta.text()
  } catch (err) {
    console.error('Falha ao consultar a nota na SEFAZ:', err)
    return NextResponse.json(
      { error: 'Não foi possível consultar esta nota na Receita Estadual agora.' },
      { status: 502 }
    )
  }

  const nota = parsearPaginaNfce(html)
  if (nota.itens.length === 0) {
    return NextResponse.json(
      { error: 'A nota foi encontrada, mas nenhum item pôde ser lido dela.' },
      { status: 422 }
    )
  }

  return NextResponse.json({ nota })
}
