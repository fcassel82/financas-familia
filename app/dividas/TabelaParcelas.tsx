'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { dataBR, moeda } from '@/lib/formato'
import { tabelaSAC, type DividaSAC } from '@/lib/divida'
import { Mensagem, Modal } from '@/components/ui'
import { sincronizarDivida, type Divida, type ParcelaRegistrada } from './tipos'

export function TabelaParcelas({
  divida,
  sac,
  pagas,
  onFechar,
  onAlterado,
}: {
  divida: Divida
  sac: DividaSAC
  pagas: ParcelaRegistrada[]
  onFechar: () => void
  onAlterado: () => void
}) {
  const [mensagem, setMensagem] = useState('')
  const linhas = tabelaSAC(sac, pagas)
  const ultimaPaga = pagas.reduce<ParcelaRegistrada | null>((m, p) => (!m || p.numero > m.numero ? p : m), null)

  async function desfazer(p: ParcelaRegistrada) {
    if (
      !window.confirm(
        `Desfazer o pagamento da parcela ${p.numero}?\n\nO lançamento da sua parte continua em Lançamentos; apague lá se não quiser mais.`
      )
    )
      return
    const { error } = await supabase.from('parcelas_divida').delete().eq('id', p.id)
    if (error) {
      setMensagem('Erro ao desfazer: ' + error.message)
      return
    }
    await sincronizarDivida(divida, sac, pagas.filter((x) => x.id !== p.id))
    onAlterado()
  }

  return (
    <Modal aberto titulo={`Parcelas: ${divida.nome}`} onFechar={onFechar}>
      <p className="mb-3 text-xs text-texto-suave">
        Pagas com o valor real; as próximas são estimadas com {String(sac.taxa_juros_am).replace('.', ',')}% ao
        mês sobre o saldo.
      </p>
      <Mensagem texto={mensagem} />
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="border-b border-borda text-left text-texto-suave">
              <th className="py-1.5 pr-2 font-medium">Nº</th>
              <th className="py-1.5 pr-2 font-medium">Vence</th>
              <th className="py-1.5 pr-2 text-right font-medium">Amortiz.</th>
              <th className="py-1.5 pr-2 text-right font-medium">Juros</th>
              <th className="py-1.5 pr-2 text-right font-medium">Parcela</th>
              <th className="py-1.5 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.numero} className={`border-b border-borda/60 ${l.paga ? 'text-texto-suave' : 'text-texto'}`}>
                <td className="py-1.5 pr-2">
                  {l.numero}
                  {l.paga && <span className="ml-1 text-receita">✓</span>}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-2">{dataBR(l.pagoEm ?? l.vencimento)}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right">{moeda(l.amortizacao)}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right">{moeda(l.juros)}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right font-medium">{moeda(l.valor)}</td>
                <td className="whitespace-nowrap py-1.5 text-right">
                  {moeda(l.saldoDepois)}
                  {ultimaPaga?.numero === l.numero && (
                    <button
                      onClick={() => desfazer(ultimaPaga)}
                      className="ml-2 text-primaria hover:underline"
                    >
                      desfazer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
