import { resumoSAC, type DividaSAC, type ParcelaPaga } from '@/lib/divida'
import { supabase } from '@/lib/supabaseClient'

export type Divida = {
  id: string
  nome: string
  tipo: string
  credor: string | null
  valor_total: number | null
  saldo_devedor: number
  valor_parcela: number | null
  parcelas_total: number | null
  parcelas_pagas: number
  taxa_juros_am: number | null
  data_inicio: string | null
  data_fim: string | null
  imovel_id: string | null
  veiculo_id: string | null
  quitada: boolean
  observacoes: string | null
  escopo: string
  sistema: 'sac' | null
  data_primeira_parcela: string | null
  conta_id: string | null
  subcategoria_obra_id: string | null
  subcategoria_parcela_id: string | null
}

export type ParcelaRegistrada = ParcelaPaga & { id: string; divida_id: string; transacao_id: string | null }

/** Os dados mínimos para calcular a tabela SAC; null se a dívida não está completa */
export function dadosSAC(d: Divida): DividaSAC | null {
  if (d.sistema !== 'sac' || !d.valor_total || !d.parcelas_total || d.taxa_juros_am == null || !d.data_primeira_parcela)
    return null
  return {
    valor_total: Number(d.valor_total),
    parcelas_total: d.parcelas_total,
    taxa_juros_am: Number(d.taxa_juros_am),
    data_primeira_parcela: d.data_primeira_parcela,
  }
}

/**
 * Mantém saldo, parcelas pagas e valor da próxima parcela gravados na dívida:
 * o Patrimônio lê esses campos direto. A taxa acompanha a última parcela paga
 * (Selic + x% muda), para a estimativa das próximas seguir o valor real —
 * exceto ao salvar o formulário, onde vale a taxa que a pessoa digitou.
 */
export async function sincronizarDivida(
  d: Divida,
  sac: DividaSAC,
  pagas: ParcelaPaga[],
  { taxaDaUltimaPaga = true } = {}
) {
  const r = resumoSAC(sac, pagas)
  return supabase
    .from('dividas')
    .update({
      saldo_devedor: r.saldoDevedor,
      parcelas_pagas: r.parcelasPagas,
      valor_parcela: r.proxima?.valor ?? null,
      taxa_juros_am: (taxaDaUltimaPaga && r.taxaUltimaPaga) || sac.taxa_juros_am,
      quitada: r.saldoDevedor <= 0.005,
    })
    .eq('id', d.id)
}
