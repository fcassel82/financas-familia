import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BASE = 'https://parallelum.com.br/fipe/api/v1'

/** Só estes tipos existem na FIPE; evita montar URL com entrada arbitrária */
const TIPOS = ['carros', 'motos', 'caminhoes'] as const
type TipoVeiculo = (typeof TIPOS)[number]

/** Os códigos da FIPE são numéricos (o de ano vem como "2016-1": ano + combustível) */
function codigoValido(valor: string | null): valor is string {
  return !!valor && /^[0-9]{1,8}(-[0-9]{1,2})?$/.test(valor)
}

type ItemBruto = { codigo: string | number; nome: string }

/**
 * A FIPE devolve o código da marca como string ("22") e o do modelo como
 * número (4514). Padroniza em string para o cliente poder comparar com o
 * value do <select>, que é sempre string.
 */
function normalizarItens(itens: unknown): { codigo: string; nome: string }[] {
  if (!Array.isArray(itens)) return []
  return itens.map((item: ItemBruto) => ({ codigo: String(item.codigo), nome: item.nome }))
}

async function buscarFipe(caminho: string) {
  // A tabela muda uma vez por mês, então cache de um dia é folgado e evita
  // martelar a API pública a cada abertura da tela.
  const resposta = await fetch(`${BASE}/${caminho}`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 86_400 },
    signal: AbortSignal.timeout(15_000),
  })
  if (!resposta.ok) {
    throw new Error(`FIPE respondeu ${resposta.status}`)
  }
  return resposta.json()
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

  const params = request.nextUrl.searchParams
  const recurso = params.get('recurso')
  const tipoBruto = params.get('tipo') ?? 'carros'
  const tipo = (TIPOS as readonly string[]).includes(tipoBruto)
    ? (tipoBruto as TipoVeiculo)
    : 'carros'

  const marca = params.get('marca')
  const modelo = params.get('modelo')
  const ano = params.get('ano')

  try {
    if (recurso === 'marcas') {
      return NextResponse.json({ marcas: normalizarItens(await buscarFipe(`${tipo}/marcas`)) })
    }

    if (recurso === 'modelos') {
      if (!codigoValido(marca)) {
        return NextResponse.json({ error: 'Marca inválida.' }, { status: 400 })
      }
      const dados = await buscarFipe(`${tipo}/marcas/${marca}/modelos`)
      return NextResponse.json({ modelos: normalizarItens(dados.modelos) })
    }

    if (recurso === 'anos') {
      if (!codigoValido(marca) || !codigoValido(modelo)) {
        return NextResponse.json({ error: 'Marca ou modelo inválido.' }, { status: 400 })
      }
      return NextResponse.json({
        anos: normalizarItens(await buscarFipe(`${tipo}/marcas/${marca}/modelos/${modelo}/anos`)),
      })
    }

    if (recurso === 'valor') {
      if (!codigoValido(marca) || !codigoValido(modelo) || !codigoValido(ano)) {
        return NextResponse.json({ error: 'Marca, modelo ou ano inválido.' }, { status: 400 })
      }
      const dados = await buscarFipe(`${tipo}/marcas/${marca}/modelos/${modelo}/anos/${ano}`)
      // "R$ 45.678,00" → 45678.00
      const valor = Number(
        String(dados.Valor ?? '')
          .replace(/[^\d,]/g, '')
          .replace(',', '.')
      )
      return NextResponse.json({
        valor: Number.isFinite(valor) ? valor : null,
        codigoFipe: dados.CodigoFipe ?? null,
        descricao: [dados.Marca, dados.Modelo].filter(Boolean).join(' '),
        anoModelo: dados.AnoModelo ?? null,
        combustivel: dados.Combustivel ?? null,
        mesReferencia: dados.MesReferencia ?? null,
      })
    }

    return NextResponse.json({ error: 'Recurso desconhecido.' }, { status: 400 })
  } catch (err) {
    console.error('Falha ao consultar a FIPE:', err)
    return NextResponse.json(
      { error: 'Não foi possível consultar a tabela FIPE agora. Tente de novo em instantes.' },
      { status: 502 }
    )
  }
}
