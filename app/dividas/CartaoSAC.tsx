'use client'

import { dataBR, moeda } from '@/lib/formato'
import { resumoSAC, type DividaSAC } from '@/lib/divida'
import { QuadroObra } from './QuadroObra'
import type { Divida, ParcelaRegistrada } from './tipos'

/** Corpo do cartão de uma dívida em SAC: saldo, próxima parcela, juros e a obra */
export function CartaoSAC({
  divida,
  sac,
  pagas,
  onPagar,
  onVerParcelas,
}: {
  divida: Divida
  sac: DividaSAC
  pagas: ParcelaRegistrada[]
  onPagar: () => void
  onVerParcelas: () => void
}) {
  const r = resumoSAC(sac, pagas)
  const pagoPct = Math.min(100, ((sac.valor_total - r.saldoDevedor) / sac.valor_total) * 100)
  // A escola costuma repetir o que pagou na última; sem histórico, a amortização
  const ultima = pagas.reduce<ParcelaRegistrada | null>((m, p) => (!m || p.numero > m.numero ? p : m), null)
  const parteTerceiros = r.proxima ? (ultima ? Number(ultima.pago_terceiros) : r.proxima.amortizacao) : 0
  const parteFamilia = r.proxima ? Math.max(0, r.proxima.valor - parteTerceiros) : 0

  return (
    <>
      <div className="grid grid-cols-2 gap-3 border-t border-borda pt-3">
        <div>
          <p className="text-xs text-texto-suave">Saldo devedor</p>
          <p className="whitespace-nowrap font-semibold text-despesa">{moeda(r.saldoDevedor)}</p>
        </div>
        {r.proxima && (
          <div>
            <p className="text-xs text-texto-suave">
              Parcela {r.proxima.numero}/{sac.parcelas_total} · {dataBR(r.proxima.vencimento)}
            </p>
            <p className="whitespace-nowrap font-semibold text-texto">{moeda(r.proxima.valor)}</p>
            <p className="text-xs text-texto-suave">
              escola {moeda(parteTerceiros)} · você {moeda(parteFamilia)}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-texto-suave">Juros pagos</p>
          <p className="whitespace-nowrap font-semibold text-texto">{moeda(r.jurosPagos)}</p>
        </div>
        <div>
          <p className="text-xs text-texto-suave">Juros a pagar (estimado)</p>
          <p className="whitespace-nowrap font-semibold text-texto">{moeda(r.jurosAPagar)}</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-fundo">
          <div className="h-full rounded-full bg-receita transition-all" style={{ width: `${pagoPct}%` }} />
        </div>
        <p className="mt-1 text-xs text-texto-suave">
          {pagoPct.toFixed(0)}% quitado de {moeda(sac.valor_total)} · {r.parcelasPagas}/{sac.parcelas_total} parcelas
          {r.pagoPorTerceiros > 0 ? ` · escola já pagou ${moeda(r.pagoPorTerceiros)}` : ''}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {r.proxima && (
          <button
            onClick={onPagar}
            className="rounded-lg bg-primaria px-3 py-1.5 text-xs font-semibold text-sobre-cor hover:bg-primaria-escura"
          >
            Pagar parcela {r.proxima.numero}
          </button>
        )}
        <button
          onClick={onVerParcelas}
          className="rounded-lg border border-borda px-3 py-1.5 text-xs font-medium text-texto hover:bg-fundo"
        >
          Ver as {sac.parcelas_total} parcelas
        </button>
      </div>

      {(divida.conta_id || divida.subcategoria_obra_id) && <QuadroObra divida={divida} />}
    </>
  )
}
