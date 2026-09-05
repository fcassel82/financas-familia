import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * IVG-R: Índice de Valores de Garantia de Imóveis Residenciais Financiados,
 * publicado mensalmente pelo Banco Central (série 21340 do SGS). É o índice
 * oficial e gratuito mais próximo de "quanto o mercado imobiliário andou".
 */
const SERIE_IVGR = 21340
const BASE = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${SERIE_IVGR}/dados`

type PontoSerie = { data: string; valor: string }

/** "01/06/2026" → "2026-06" */
function paraChaveMes(dataBr: string): string {
  const [, mes, ano] = dataBr.split('/')
  return `${ano}-${mes}`
}

export async function GET(request: NextRequest) {
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

  try {
    const resposta = await fetch(`${BASE}?formato=json`, {
      // O BCB devolve uma página de erro quando não reconhece o cliente
      headers: { Accept: 'application/json', 'User-Agent': 'financas-familia/1.0' },
      // Série mensal: um dia de cache é mais do que suficiente
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(15_000),
    })

    if (!resposta.ok) {
      throw new Error(`BCB respondeu ${resposta.status}`)
    }

    const serie = (await resposta.json()) as PontoSerie[]
    if (!Array.isArray(serie) || serie.length === 0) {
      throw new Error('Série vazia')
    }

    // Devolve o índice mês a mês para o cliente conseguir achar a base de
    // cada imóvel (mês da compra) sem precisar de uma consulta por imóvel.
    const porMes: Record<string, number> = {}
    for (const ponto of serie) {
      const valor = Number(ponto.valor)
      if (Number.isFinite(valor)) porMes[paraChaveMes(ponto.data)] = valor
    }

    const ultimo = serie[serie.length - 1]
    return NextResponse.json({
      indice: 'IVG-R (BCB)',
      atual: Number(ultimo.valor),
      mesAtual: paraChaveMes(ultimo.data),
      porMes,
    })
  } catch (err) {
    console.error('Falha ao consultar o IVG-R no BCB:', err)
    return NextResponse.json(
      { error: 'Não foi possível consultar o índice de imóveis do Banco Central agora.' },
      { status: 502 }
    )
  }
}
