'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { buscarTudo } from '@/lib/buscarTudo'
import { moeda, rotuloDia } from '@/lib/formato'
import { ROTULO_GRUPO, type Grupo } from '@/lib/regra503020'
import {
  CAMPOS_LANCAMENTO_RESUMO,
  entraNoResumo,
  lerFiltroResumo,
  linkResumo,
  mesesDoIntervalo,
  type ContextoResumo,
  type FiltroResumo,
  type LancamentoResumo,
} from '@/lib/resumo'
import { IconeSeta } from '@/components/Icones'
import { EstadoVazio, LinhaLink, Pagina } from '@/components/ui'

type Nome = { id: string; nome: string }
type Conta = Nome & { tipo: string }
type Subcategoria = Nome & { categoria_id: string; grupo_503020: string | null }

const ROTULO_MOVIMENTO: Record<string, string> = {
  rendimento: 'Rendimento',
  aporte_empresa: 'Aporte da empresa',
  aplicado: 'Aplicações',
  resgatado: 'Resgates',
}

function rotuloGrupo(g: string): string {
  if (g === 'sem') return 'Sem grupo 50/30/20'
  if (g === 'deducao') return 'Deduções'
  return ROTULO_GRUPO[g as Grupo] ?? g
}

/** "2026-04-26" → "26 de abr." (com o ano quando não é o corrente) */
function diaEMes(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'short',
    ...(ano !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  })
}

function valorComSinal(l: LancamentoResumo): number {
  return l.tipo === 'receita' ? Number(l.valor) : -Number(l.valor)
}

function moedaComSinal(valor: number): string {
  return `${valor >= 0 ? '+' : '−'}${moeda(Math.abs(valor))}`
}

function ConteudoResumo() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const busca = searchParams.toString()
  const filtro = useMemo(() => lerFiltroResumo(new URLSearchParams(busca)), [busca])

  const [carregando, setCarregando] = useState(true)
  const [lancamentos, setLancamentos] = useState<LancamentoResumo[]>([])
  const [categorias, setCategorias] = useState<Nome[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [cartoes, setCartoes] = useState<Nome[]>([])

  useEffect(() => {
    if (!filtro) return
    let cancelado = false
    async function carregar(f: FiltroResumo) {
      setCarregando(true)
      // Busca o período inteiro: as duas pontas de cada transferência são
      // necessárias para saber se ela é uma aplicação (Futuro na 50/30/20)
      const [{ data: lancs }, { data: cats }, { data: subs }, { data: cts }, { data: crts }] =
        await Promise.all([
          buscarTudo((de, ate) =>
            supabase
              .from('transacoes')
              .select(CAMPOS_LANCAMENTO_RESUMO)
              .eq('status', 'pago')
              .gte('data', f.de)
              .lte('data', f.ate)
              .order('id')
              .range(de, ate)
          ),
          supabase.from('categorias').select('id, nome'),
          supabase.from('subcategorias').select('id, nome, categoria_id, grupo_503020'),
          supabase.from('contas').select('id, nome, tipo'),
          supabase.from('cartoes_credito').select('id, nome'),
        ])
      if (cancelado) return
      // O Supabase tipa as junções (categorias, contas…) como listas; aqui vem um objeto só
      setLancamentos(lancs as unknown as LancamentoResumo[])
      setCategorias((cats ?? []) as Nome[])
      setSubcategorias((subs ?? []) as Subcategoria[])
      setContas((cts ?? []) as Conta[])
      setCartoes((crts ?? []) as Nome[])
      setCarregando(false)
    }
    carregar(filtro)
    return () => {
      cancelado = true
    }
  }, [filtro])

  const itens = useMemo(() => {
    if (!filtro) return []
    const contaDaTransferencia: ContextoResumo['contaDaTransferencia'] = new Map()
    for (const l of lancamentos) {
      if (!l.transferencia_id) continue
      const pontas = contaDaTransferencia.get(l.transferencia_id) ?? { origem: null, destino: null }
      if (l.tipo === 'despesa') pontas.origem = l.conta_id
      else pontas.destino = l.conta_id
      contaDaTransferencia.set(l.transferencia_id, pontas)
    }
    const ctx: ContextoResumo = {
      grupoDaSubcategoria: new Map(subcategorias.map((s) => [s.id, s.grupo_503020])),
      tipoDaConta: new Map(contas.map((c) => [c.id, c.tipo])),
      contaDaTransferencia,
    }
    return lancamentos
      .filter((l) => entraNoResumo(l, filtro, ctx))
      .sort((a, b) => b.data.localeCompare(a.data) || a.descricao.localeCompare(b.descricao))
  }, [filtro, lancamentos, subcategorias, contas])

  // Divisão por categoria (ou por subcategoria, quando o filtro já é de uma categoria)
  const divisao = useMemo(() => {
    if (!filtro) return []
    const porSub = !!filtro.categoria
    const mapa = new Map<string, { id: string; nome: string; valor: number }>()
    for (const l of itens) {
      const id = (porSub ? l.subcategoria_id : l.categoria_id) ?? 'sem'
      const nome =
        (porSub ? l.subcategorias?.nome : l.categorias?.nome) ??
        (l.transferencia_id ? 'Aplicações' : porSub ? 'Sem subcategoria' : 'Sem categoria')
      const atual = mapa.get(id) ?? { id, nome, valor: 0 }
      atual.valor += Math.abs(Number(l.valor))
      mapa.set(id, atual)
    }
    return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor)
  }, [filtro, itens])

  const porDia = useMemo(() => {
    const mapa = new Map<string, LancamentoResumo[]>()
    for (const l of itens) {
      const lista = mapa.get(l.data)
      if (lista) lista.push(l)
      else mapa.set(l.data, [l])
    }
    return Array.from(mapa.entries())
  }, [itens])

  if (!filtro) {
    return (
      <Pagina>
        <EstadoVazio
          titulo="Resumo sem período"
          descricao="Abra o resumo tocando numa soma do Início, dos Relatórios ou de outra tela."
        />
      </Pagina>
    )
  }

  const somaComSinal = itens.reduce((s, l) => s + valorComSinal(l), 0)
  const total = filtro.tipo ? Math.abs(somaComSinal) : somaComSinal
  const corTotal =
    filtro.tipo === 'receita' || (!filtro.tipo && total >= 0) ? 'text-receita' : 'text-despesa'
  const meses = mesesDoIntervalo(filtro.de, filtro.ate)
  const totalDivisao = divisao.reduce((s, d) => s + d.valor, 0)

  const nomeCategoria = categorias.find((c) => c.id === filtro.categoria)?.nome
  const nomeSub = subcategorias.find((s) => s.id === filtro.subcategoria)?.nome
  const titulo = filtro.titulo ?? nomeSub ?? nomeCategoria ?? 'Lançamentos'

  const etiquetas = [
    filtro.tipo === 'receita' ? 'Receitas' : filtro.tipo === 'despesa' ? 'Despesas' : null,
    filtro.escopo === 'familiar' ? 'Familiar' : filtro.escopo === 'pessoal' ? 'Pessoal' : null,
    filtro.grupo ? rotuloGrupo(filtro.grupo) : null,
    filtro.conta ? (contas.find((c) => c.id === filtro.conta)?.nome ?? null) : null,
    filtro.cartao ? (cartoes.find((c) => c.id === filtro.cartao)?.nome ?? null) : null,
    filtro.movimento ? ROTULO_MOVIMENTO[filtro.movimento] : null,
    filtro.membros ? 'Filtro de quem' : null,
    filtro.categorias ? `${filtro.categorias.length} categoria${filtro.categorias.length > 1 ? 's' : ''}` : null,
  ].filter((e): e is string => !!e && e !== titulo)

  const aqui = `${pathname}?${busca}`

  function voltar() {
    // Aberto direto pelo endereço não há para onde voltar
    if (window.history.length > 1) router.back()
    else router.push('/')
  }

  return (
    <Pagina>
      <button
        type="button"
        onClick={voltar}
        className="-ml-1 mb-3 inline-flex min-h-11 items-center gap-1 px-1 text-sm font-semibold text-primaria"
      >
        <IconeSeta className="h-4 w-4" />
        Voltar
      </button>

      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-texto sm:text-3xl">{titulo}</h1>
        <p className="mt-1 text-sm text-texto-suave">
          De {diaEMes(filtro.de)} a {diaEMes(filtro.ate)}
        </p>
        {etiquetas.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {etiquetas.map((e) => (
              <span key={e} className="rounded-full border border-borda bg-superficie px-2.5 py-0.5 text-sm text-texto-suave">
                {e}
              </span>
            ))}
          </div>
        )}
      </div>

      {carregando ? (
        <p className="text-sm text-texto-suave">Carregando...</p>
      ) : itens.length === 0 ? (
        <EstadoVazio titulo="Nenhum lançamento encontrado para este filtro." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-1">
            <section className="cartao p-4" aria-label="Totais">
              <p className="text-sm text-texto-suave">Total</p>
              <p className={`text-3xl font-extrabold tracking-tight ${corTotal}`}>
                {filtro.tipo ? moeda(total) : moedaComSinal(total)}
              </p>
              <p className="mt-2 text-sm text-texto-suave">
                {itens.length} lançamento{itens.length > 1 ? 's' : ''}
                {meses > 1 ? `, média de ${moeda(Math.abs(total) / meses)} por mês` : ''}
              </p>
            </section>

            {divisao.length > 1 && (
              <section className="cartao p-4">
                <h2 className="mb-1 text-base font-semibold text-texto">
                  {filtro.categoria ? 'Por subcategoria' : 'Por categoria'}
                </h2>
                <ul className="divide-y divide-borda">
                  {divisao.map((d) => {
                    const pct = totalDivisao > 0 ? (d.valor / totalDivisao) * 100 : 0
                    const destino = filtro.categoria
                      ? { ...filtro, subcategoria: d.id, titulo: d.nome }
                      : { ...filtro, categoria: d.id, titulo: d.nome }
                    return (
                      <li key={d.id}>
                        <LinhaLink href={linkResumo(destino)}>
                          <span className="min-w-0 truncate text-texto">{d.nome}</span>
                          <span className="flex shrink-0 items-baseline gap-2">
                            <span className="text-sm text-texto-suave">
                              {pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                            </span>
                            <span className="font-semibold text-texto">{moeda(d.valor)}</span>
                          </span>
                        </LinhaLink>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </div>

          <section className="space-y-3 lg:col-span-2" aria-label="Lançamentos">
            {porDia.map(([dia, lista]) => (
              <div key={dia}>
                <div className="flex items-baseline justify-between px-1 pb-1 text-sm font-medium text-texto-suave">
                  <span>{rotuloDia(dia)}</span>
                  <span>{moedaComSinal(lista.reduce((s, l) => s + valorComSinal(l), 0))}</span>
                </div>
                <ul className="cartao divide-y divide-borda px-4">
                  {lista.map((l) => {
                    const detalhe = [
                      [l.categorias?.nome, l.subcategorias?.nome].filter(Boolean).join(' / ') ||
                        (l.transferencia_id ? 'Transferência' : 'Sem categoria'),
                      l.contas?.nome ?? l.cartoes_credito?.nome,
                    ]
                      .filter(Boolean)
                      .join(', ')
                    return (
                      <li key={l.id} className="flex min-h-16 items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-texto">{l.descricao}</p>
                          <p className="truncate text-sm text-texto-suave">{detalhe}</p>
                        </div>
                        <span
                          className={`shrink-0 font-semibold whitespace-nowrap ${
                            l.tipo === 'receita' ? 'text-receita' : 'text-despesa'
                          }`}
                        >
                          {moedaComSinal(valorComSinal(l))}
                        </span>
                        {/* Transferência se corrige na tela de Transferências */}
                        <Link
                          href={
                            l.transferencia_id
                              ? '/transferencias'
                              : `/lancamentos?id=${l.id}&voltar=${encodeURIComponent(aqui)}`
                          }
                          className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-borda px-3 text-sm font-semibold text-primaria hover:bg-fundo"
                        >
                          Editar
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </section>
        </div>
      )}
    </Pagina>
  )
}

export default function ResumoPage() {
  return (
    <Suspense
      fallback={
        <Pagina>
          <p className="text-sm text-texto-suave">Carregando...</p>
        </Pagina>
      }
    >
      <ConteudoResumo />
    </Suspense>
  )
}
