'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { dataBR, moeda } from '@/lib/formato'
import type { Divida } from './tipos'

type Movimento = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  status: string
  conta_id: string | null
  subcategoria_id: string | null
  contas: { nome: string } | null
  cartoes_credito: { nome: string } | null
}

/**
 * Para onde foi o dinheiro do empréstimo: saldo que sobra na conta da obra e
 * as compras na subcategoria da obra, separadas entre as que saíram da conta
 * da obra (material, pela escola) e as que saíram das contas da família
 * (mão de obra).
 */
export function QuadroObra({ divida }: { divida: Divida }) {
  const [movimentos, setMovimentos] = useState<Movimento[] | null>(null)
  const [verTodas, setVerTodas] = useState(false)

  useEffect(() => {
    const filtros = [
      divida.conta_id ? `conta_id.eq.${divida.conta_id}` : null,
      divida.subcategoria_obra_id ? `subcategoria_id.eq.${divida.subcategoria_obra_id}` : null,
    ].filter(Boolean)
    if (filtros.length === 0) return
    supabase
      .from('transacoes')
      .select('id, data, descricao, valor, tipo, status, conta_id, subcategoria_id, contas(nome), cartoes_credito!cartao_id(nome)')
      .or(filtros.join(','))
      .order('data', { ascending: false })
      .then(({ data }) => setMovimentos((data ?? []) as unknown as Movimento[]))
  }, [divida.conta_id, divida.subcategoria_obra_id])

  if (!movimentos) return null

  const sinal = (m: Movimento) => (m.tipo === 'receita' ? Number(m.valor) : -Number(m.valor))
  const saldoConta = movimentos
    .filter((m) => m.conta_id === divida.conta_id && m.status === 'pago')
    .reduce((s, m) => s + sinal(m), 0)
  const compras = movimentos.filter((m) => m.subcategoria_id === divida.subcategoria_obra_id)
  const gasto = (lista: Movimento[]) => lista.reduce((s, m) => s - sinal(m), 0)
  const pelaObra = gasto(compras.filter((m) => m.conta_id === divida.conta_id))
  const pelaFamilia = gasto(compras.filter((m) => m.conta_id !== divida.conta_id))
  const listadas = verTodas ? compras : compras.slice(0, 5)

  return (
    <div className="mt-3 rounded-lg border border-borda p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-suave">Obra</p>
      <div className="grid grid-cols-3 gap-2 text-sm">
        {divida.conta_id && (
          <div>
            <p className="text-xs text-texto-suave">Sobra na conta da obra</p>
            <p className="whitespace-nowrap font-semibold text-texto">{moeda(saldoConta)}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-texto-suave">Material (escola)</p>
          <p className="whitespace-nowrap font-semibold text-texto">{moeda(pelaObra)}</p>
        </div>
        <div>
          <p className="text-xs text-texto-suave">Suas contas</p>
          <p className="whitespace-nowrap font-semibold text-texto">{moeda(pelaFamilia)}</p>
        </div>
      </div>

      {compras.length === 0 ? (
        <p className="mt-2 text-xs text-texto-suave">
          Nenhuma compra ainda. Lance as compras na subcategoria da obra; elas entram neutras, fora do 50/30/20.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs">
          {listadas.map((m) => (
            <li key={m.id} className="flex justify-between gap-2">
              <span className="min-w-0 truncate text-texto">
                {dataBR(m.data)} · {m.descricao}
                <span className="text-texto-suave"> · {m.contas?.nome ?? m.cartoes_credito?.nome ?? 'sem conta'}</span>
              </span>
              <span className="whitespace-nowrap tabular-nums text-texto">{moeda(-sinal(m))}</span>
            </li>
          ))}
          {compras.length > 5 && (
            <li>
              <button onClick={() => setVerTodas(!verTodas)} className="font-medium text-primaria hover:underline">
                {verTodas ? 'Ver menos' : `Ver todas as ${compras.length} compras`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
