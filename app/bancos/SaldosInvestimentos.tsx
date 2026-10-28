'use client'

import { useState } from 'react'
import { dataBR, moeda } from '@/lib/formato'
import { MOTIVO_BLOQUEIO, type SugestaoRendimento } from '@/lib/saldoInvestimentos'
import { BotaoPrimario } from '@/components/ui'

/** Diferença entre o saldo do banco e o do app, por conta de investimento, para lançar como rendimento */
export default function SaldosInvestimentos({
  sugestoes,
  onLancar,
}: {
  sugestoes: SugestaoRendimento[]
  onLancar: (s: SugestaoRendimento) => Promise<void>
}) {
  const [lancando, setLancando] = useState<string | null>(null)

  if (sugestoes.length === 0) return null

  async function lancar(s: SugestaoRendimento) {
    setLancando(s.contaId)
    await onLancar(s)
    setLancando(null)
  }

  return (
    <section className="cartao mb-5 p-4">
      <h2 className="text-base font-semibold text-texto">Saldos dos investimentos</h2>
      <ul className="divide-y divide-borda">
        {sugestoes.map((s) => (
          <li key={s.contaId} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <span>
              <span className="block font-medium text-texto">{s.nome}</span>
              <span className="block text-sm text-texto-suave">
                Saldo no banco em {dataBR(s.data)}: {moeda(s.saldoBanco)}. No app:{' '}
                {moeda(s.saldoApp)}.
              </span>
              <span className="block text-sm text-texto">
                {s.diferenca > 0 ? 'Rendimento' : 'Desvalorização'} de{' '}
                <strong>{moeda(Math.abs(s.diferenca))}</strong>
                {s.desde ? `, desde ${dataBR(s.desde)}` : ''}
              </span>
              {s.bloqueada && (
                <span className="mt-1 block text-sm text-alerta">{MOTIVO_BLOQUEIO}</span>
              )}
            </span>
            {!s.bloqueada && (
              <BotaoPrimario
                type="button"
                onClick={() => lancar(s)}
                disabled={lancando !== null}
                className="min-h-11"
              >
                {lancando === s.contaId ? 'Lançando...' : 'Lançar rendimento'}
              </BotaoPrimario>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
