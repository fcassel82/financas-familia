import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin } from '@/lib/apiAdmin'
import { tipoDaTransacao } from '@/lib/conciliacao'
import { mesclarTransacoesBanco, type ExistenteBanco, type LinhaBanco } from '@/lib/mesclarBanco'
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
// Cartão: a compra da fatura aberta só é confirmada quando a fatura fecha, com a
// data original; a busca precisa sempre cobrir a fatura anterior inteira
const DIAS_CARTAO = 45

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
            nome: i.name || i.subtype || i.type || 'Investimento',
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
      const ehCartao = conta.type === 'CREDIT'
      const diasAtras = !anterior
        ? DIAS_PRIMEIRA_BUSCA
        : ehCartao
          ? DIAS_CARTAO
          : null
      const de =
        diasAtras !== null
          ? diaEmBrasilia(new Date(Date.now() - diasAtras * 86_400_000))
          : diaEmBrasilia(new Date(Date.parse(anterior!) - FOLGA_DIAS * 86_400_000))
      try {
        const transacoes = await listarTransacoes(conta.id, de, hoje)
        const linhas: LinhaBanco[] = transacoes
          // Na conta, pendente é agendamento que pode não acontecer; no cartão é a
          // compra da fatura aberta, que entra marcada como "pendente no banco"
          .filter((t) => (ehCartao || t.status !== 'PENDING') && Number(t.amount) !== 0)
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
              pendente_banco: t.status === 'PENDING',
              provider_id: t.providerId ?? null,
            }
          })

        // O que já está na caixa no mesmo período: a mesma compra não entra duas vezes
        const { data: jaNaCaixa, error: erroCaixa } = await supabase
          .from('transacoes_banco')
          .select('id, data, descricao, valor, tipo, situacao, pendente_banco, provider_id')
          .eq('conta_banco_id', conta.id)
          .gte('data', de)
          .limit(5000)
        if (erroCaixa) throw new Error('Não foi possível ler a caixa de entrada.')
        const plano = mesclarTransacoesBanco(linhas, (jaNaCaixa ?? []) as ExistenteBanco[])

        for (const { idAtual, mudanca } of plano.atualizar) {
          const { error } = await supabase
            .from('transacoes_banco')
            .update(mudanca)
            .eq('id', idAtual)
          if (error) throw new Error('Não foi possível atualizar as transações.')
        }
        for (let i = 0; i < plano.inserir.length; i += 500) {
          // ignoreDuplicates: proteção extra; o plano já separou o que é novo
          const { data, error } = await supabase
            .from('transacoes_banco')
            .upsert(plano.inserir.slice(i, i + 500), { onConflict: 'id', ignoreDuplicates: true })
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
