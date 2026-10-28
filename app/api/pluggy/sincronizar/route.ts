import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin } from '@/lib/apiAdmin'
import { tipoDaTransacao } from '@/lib/conciliacao'
import {
  dataLocal,
  idsDasConexoes,
  listarContas,
  listarInvestimentos,
  listarTransacoes,
  variaveisFaltando,
} from '@/lib/pluggy'

// Primeira busca: 60 dias; depois, a partir da última busca com folga de 5
// dias (a Pluggy atualiza uma vez por dia e o banco pode lançar com atraso)
const DIAS_PRIMEIRA_BUSCA = 60
const FOLGA_DIAS = 5

function diaEmBrasilia(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

export async function POST(request: NextRequest) {
  const admin = await exigirAdmin(request)
  if (admin instanceof NextResponse) return admin
  const { supabase } = admin

  const faltando = variaveisFaltando()
  if (faltando.length > 0) {
    return NextResponse.json(
      { error: `Faltam na Vercel, para este ambiente: ${faltando.join(', ')}.` },
      { status: 500 }
    )
  }

  const { data: existentes } = await supabase.from('contas_banco').select('id, ultima_busca')
  const ultimaBusca = new Map(
    (existentes ?? []).map((c) => [c.id as string, c.ultima_busca as string | null])
  )
  const hoje = diaEmBrasilia(new Date())

  let novas = 0
  let contas = 0
  let investimentos = 0
  const erros: string[] = []

  for (const itemId of idsDasConexoes()) {
    let contasDoItem
    try {
      contasDoItem = await listarContas(itemId)
    } catch (e) {
      erros.push(`Conexão ${itemId.slice(0, 8)}…: ${(e as Error).message}`)
      continue
    }

    // Só os dados do banco; a ligação com a conta do app (conta_id/cartao_id) fica como está
    const { error: erroContas } = await supabase.from('contas_banco').upsert(
      contasDoItem.map((c) => ({
        id: c.id,
        item_id: itemId,
        nome: c.marketingName || c.name,
        tipo: c.type,
        subtipo: c.subtype,
        numero: c.number,
        saldo: c.balance,
      })),
      { onConflict: 'id' }
    )
    if (erroContas) {
      erros.push(`Não foi possível guardar as contas da conexão ${itemId.slice(0, 8)}….`)
      continue
    }

    // Saldo dos investimentos; a ligação com a conta do app (conta_id) e o
    // "Não acompanhar" (acompanhar) não vão no payload, então ficam como estão
    try {
      const doItem = await listarInvestimentos(itemId)
      if (doItem.length > 0) {
        const { error } = await supabase.from('investimentos_banco').upsert(
          doItem.map((i) => ({
            id: i.id,
            item_id: itemId,
            nome: i.name,
            tipo: i.type,
            subtipo: i.subtype,
            saldo: Number(i.balance ?? 0),
            data_saldo: i.date ? dataLocal(i.date) : hoje,
            situacao: i.status,
            atualizado_em: new Date().toISOString(),
          })),
          { onConflict: 'id' }
        )
        if (error) throw new Error('Não foi possível guardar os investimentos.')
      }
      investimentos += doItem.length
    } catch (e) {
      erros.push(`Investimentos da conexão ${itemId.slice(0, 8)}…: ${(e as Error).message}`)
    }

    for (const conta of contasDoItem) {
      contas++
      const anterior = ultimaBusca.get(conta.id)
      const de = anterior
        ? diaEmBrasilia(new Date(Date.parse(anterior) - FOLGA_DIAS * 86_400_000))
        : diaEmBrasilia(new Date(Date.now() - DIAS_PRIMEIRA_BUSCA * 86_400_000))
      try {
        const transacoes = await listarTransacoes(conta.id, de, hoje)
        const linhas = transacoes
          // Compra pendente no cartão pode mudar de valor; entra quando o banco confirmar
          .filter((t) => t.status !== 'PENDING' && Number(t.amount) !== 0)
          .map((t) => {
            const { tipo, pagamentoCartao } = tipoDaTransacao(
              conta.type,
              Number(t.amount),
              t.type,
              t.description
            )
            return {
              id: t.id,
              conta_banco_id: conta.id,
              data: dataLocal(t.date),
              descricao: t.description,
              valor: Math.abs(Number(t.amount)),
              tipo,
              pagamento_cartao: pagamentoCartao,
              categoria_banco: t.category,
              comerciante: t.merchant?.businessName || t.merchant?.name || null,
              parcela: t.creditCardMetadata?.installmentNumber ?? null,
              parcelas: t.creditCardMetadata?.totalInstallments ?? null,
            }
          })
        for (let i = 0; i < linhas.length; i += 500) {
          // ignoreDuplicates: o que já está na caixa não volta para "revisar"
          const { data, error } = await supabase
            .from('transacoes_banco')
            .upsert(linhas.slice(i, i + 500), { onConflict: 'id', ignoreDuplicates: true })
            .select('id')
          if (error) throw new Error('Não foi possível guardar as transações.')
          novas += data?.length ?? 0
        }
        await supabase
          .from('contas_banco')
          .update({ ultima_busca: new Date().toISOString() })
          .eq('id', conta.id)
      } catch (e) {
        erros.push(`${conta.marketingName || conta.name}: ${(e as Error).message}`)
      }
    }
  }

  return NextResponse.json({ novas, contas, investimentos, erros })
}
