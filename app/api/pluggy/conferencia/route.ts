import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  dataLocal,
  idsDasConexoes,
  listarContas,
  listarTransacoes,
  pluggyConfigurada,
} from '@/lib/pluggy'

// Conferência: só LÊ da Pluggy e devolve um resumo. Não grava nada no banco.
const DIAS = 60

function isoDiasAtras(dias: number): string {
  const d = new Date(Date.now() - dias * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  // Cliente com o token da pessoa: a leitura de perfis passa pelas regras de acesso
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  )
  const { data: userData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !userData.user)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('perfis')
    .select('papel')
    .eq('id', userData.user.id)
    .single()
  if (perfil?.papel !== 'admin') {
    return NextResponse.json(
      { error: 'Só o administrador pode conferir os bancos.' },
      { status: 403 }
    )
  }

  if (!pluggyConfigurada()) {
    return NextResponse.json(
      { error: 'As variáveis da Pluggy não estão cadastradas na Vercel para este ambiente.' },
      { status: 500 }
    )
  }

  const de = isoDiasAtras(DIAS)
  const ate = isoDiasAtras(0)

  const itens = await Promise.all(
    idsDasConexoes().map(async (itemId) => {
      try {
        const contas = await listarContas(itemId)
        const comTransacoes = await Promise.all(
          contas.map(async (conta) => {
            try {
              const transacoes = await listarTransacoes(conta.id, de, ate)
              return {
                id: conta.id,
                nome: conta.marketingName || conta.name,
                tipo: conta.type,
                subtipo: conta.subtype,
                numero: conta.number,
                saldo: conta.balance,
                transacoes: transacoes.map((t) => ({
                  id: t.id,
                  data: dataLocal(t.date),
                  descricao: t.description,
                  valor: t.amount,
                  tipo: t.type,
                  status: t.status,
                  categoria: t.category,
                  comerciante: t.merchant?.businessName || t.merchant?.name || null,
                  parcela: t.creditCardMetadata?.installmentNumber ?? null,
                  parcelas: t.creditCardMetadata?.totalInstallments ?? null,
                })),
              }
            } catch (e) {
              return {
                id: conta.id,
                nome: conta.marketingName || conta.name,
                tipo: conta.type,
                subtipo: conta.subtype,
                numero: conta.number,
                saldo: conta.balance,
                transacoes: [],
                erro: (e as Error).message,
              }
            }
          })
        )
        return { itemId, contas: comTransacoes }
      } catch (e) {
        return { itemId, contas: [], erro: (e as Error).message }
      }
    })
  )

  return NextResponse.json({ de, ate, itens })
}
