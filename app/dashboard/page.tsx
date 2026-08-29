'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '@/lib/supabaseClient'
import { moeda, rotuloMesCurto } from '@/lib/formato'
import { CabecalhoPagina, EstadoVazio, Pagina, SeletorMultiplo, classeInput } from '@/components/ui'

type TransacaoResumo = {
  data: string
  valor: number
  tipo: string
  escopo: string
  dono_id: string
  categorias: { nome: string } | null
  contas: { nome: string } | null
  cartoes_credito: { nome: string } | null
}

type Membro = { id: string; nome: string }
type Categoria = { id: string; nome: string }
type Subcategoria = { id: string; categoria_id: string; nome: string }
type Periodo = 'mes' | '3m' | '6m' | 'ano'
type Escopo = 'todos' | 'familiar' | 'pessoal'

const CORES_CATEGORICAS = [
  '#2a78d6',
  '#eb6834',
  '#159d76',
  '#eda100',
  '#e87ba4',
  '#7c4dcc',
  '#0e7490',
  '#dc4c4c',
]
const COR_OUTRAS = '#94a3b8'
const COR_RECEITA = '#0e9f6e'
const COR_DESPESA = '#dc4c4c'

const ROTULO_PERIODO: Record<Periodo, string> = {
  mes: 'Este mês',
  '3m': '3 meses',
  '6m': '6 meses',
  ano: 'Este ano',
}

function chaveDoMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function mesesDoPeriodo(periodo: Periodo): string[] {
  const hoje = new Date()
  const referencia = new Date(hoje.getFullYear(), hoje.getMonth(), 1)

  if (periodo === 'ano') {
    const chaves: string[] = []
    for (let m = 0; m <= referencia.getMonth(); m++) {
      chaves.push(chaveDoMes(new Date(referencia.getFullYear(), m, 1)))
    }
    return chaves
  }

  const quantidade = periodo === 'mes' ? 1 : periodo === '3m' ? 3 : 6
  const chaves: string[] = []
  for (let i = quantidade - 1; i >= 0; i--) {
    chaves.push(chaveDoMes(new Date(referencia.getFullYear(), referencia.getMonth() - i, 1)))
  }
  return chaves
}

/** Valores curtos para os eixos, para não estourar a largura no celular */
function moedaCompacta(valor: number): string {
  const abs = Math.abs(valor)
  if (abs >= 1_000_000) return `${(valor / 1_000_000).toFixed(1)}mi`
  if (abs >= 1_000) return `${Math.round(valor / 1_000)}mil`
  return String(Math.round(valor))
}

type ItemTooltip = {
  name?: string
  value?: number
  color?: string
  payload?: { fill?: string }
}

function TooltipMoeda({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: ItemTooltip[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-borda bg-superficie px-3 py-2 text-sm shadow-lg">
      {label && <p className="mb-1 font-medium text-texto">{label}</p>}
      {payload.map((item) => (
        <p key={item.name} style={{ color: item.color || item.payload?.fill }}>
          {item.name}: {moeda(item.value ?? 0)}
        </p>
      ))}
    </div>
  )
}

function CartaoKpi({
  titulo,
  valor,
  cor,
}: {
  titulo: string
  valor: string
  cor: string
}) {
  return (
    <div className="rounded-xl p-3 shadow-sm sm:p-4" style={{ backgroundColor: cor }}>
      <p className="text-[11px] font-medium uppercase leading-tight tracking-wide text-white/80">
        {titulo}
      </p>
      <p className="mt-1 text-lg font-bold leading-tight text-white sm:text-2xl">{valor}</p>
    </div>
  )
}

function BlocoGrafico({
  titulo,
  vazio,
  children,
  className = '',
}: {
  titulo: string
  vazio: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`cartao p-4 ${className}`}>
      <h2 className="mb-3 text-sm font-semibold text-texto">{titulo}</h2>
      {vazio ? (
        <p className="py-10 text-center text-sm text-texto-suave">
          Nenhum dado neste período.
        </p>
      ) : (
        children
      )}
    </section>
  )
}

function agruparDespesas(
  transacoes: TransacaoResumo[],
  chaveDe: (t: TransacaoResumo) => string,
  rotuloSemValor: string
) {
  const totais = new Map<string, number>()
  for (const t of transacoes) {
    if (t.tipo !== 'despesa') continue
    const chave = chaveDe(t) || rotuloSemValor
    totais.set(chave, (totais.get(chave) ?? 0) + Number(t.valor))
  }
  const ordenado = Array.from(totais.entries())
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor)

  const principais = ordenado.slice(0, 6)
  const restante = ordenado.slice(6).reduce((soma, c) => soma + c.valor, 0)
  if (restante > 0) principais.push({ nome: 'Outras', valor: restante })

  return principais.map((c, i) => ({
    ...c,
    cor: c.nome === 'Outras' ? COR_OUTRAS : CORES_CATEGORICAS[i % CORES_CATEGORICAS.length],
  }))
}

export default function DashboardPage() {
  const [transacoes, setTransacoes] = useState<TransacaoResumo[]>([])
  const [carregando, setCarregando] = useState(true)

  const [periodo, setPeriodo] = useState<Periodo>('6m')
  const [escopoFiltro, setEscopoFiltro] = useState<Escopo>('todos')
  const [membroFiltro, setMembroFiltro] = useState('')
  const [membros, setMembros] = useState<Membro[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [categoriasFiltro, setCategoriasFiltro] = useState<string[]>([])
  const [subcategoriasFiltro, setSubcategoriasFiltro] = useState<string[]>([])

  useEffect(() => {
    async function carregarPerfil() {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return

      const { data: perfilData } = await supabase
        .from('perfis')
        .select('papel')
        .eq('id', userId)
        .single()

      const admin = perfilData?.papel === 'admin'
      setIsAdmin(admin)

      if (admin) {
        const { data: membrosData } = await supabase.from('perfis').select('id, nome').order('nome')
        if (membrosData) setMembros(membrosData)
      }
    }
    async function carregarCategorias() {
      const [{ data: cats }, { data: subs }] = await Promise.all([
        supabase.from('categorias').select('id, nome').order('nome'),
        supabase.from('subcategorias').select('id, categoria_id, nome').order('nome'),
      ])
      if (cats) setCategorias(cats)
      if (subs) setSubcategorias(subs)
    }
    carregarPerfil()
    carregarCategorias()
  }, [])

  // Escolher uma categoria e depois trocá-la não deve deixar uma subcategoria
  // da categoria antiga presa no filtro sem que ela apareça em lugar nenhum
  function atualizarCategoriasFiltro(ids: string[]) {
    setCategoriasFiltro(ids)
    if (ids.length === 0) return
    setSubcategoriasFiltro((atual) =>
      atual.filter((subId) => {
        const sub = subcategorias.find((s) => s.id === subId)
        return sub && ids.includes(sub.categoria_id)
      })
    )
  }

  const subcategoriasDisponiveis = useMemo(
    () =>
      categoriasFiltro.length === 0
        ? subcategorias
        : subcategorias.filter((s) => categoriasFiltro.includes(s.categoria_id)),
    [subcategorias, categoriasFiltro]
  )

  const mesesChaves = useMemo(() => mesesDoPeriodo(periodo), [periodo])

  const carregar = useCallback(async () => {
    const dataInicio = `${mesesChaves[0]}-01`

    let query = supabase
      .from('transacoes')
      .select(
        'data, valor, tipo, escopo, dono_id, categoria_id, subcategoria_id, categorias(nome), contas(nome), cartoes_credito(nome)'
      )
      // Só o que já foi efetivado: contas a pagar em aberto não são gasto realizado
      .eq('status', 'pago')
      // Transferência entre contas próprias não é receita nem despesa
      .is('transferencia_id', null)
      .gte('data', dataInicio)
      .order('data')

    if (escopoFiltro !== 'todos') query = query.eq('escopo', escopoFiltro)
    if (isAdmin && membroFiltro) query = query.eq('dono_id', membroFiltro)
    if (categoriasFiltro.length > 0) query = query.in('categoria_id', categoriasFiltro)
    if (subcategoriasFiltro.length > 0) query = query.in('subcategoria_id', subcategoriasFiltro)

    const { data, error } = await query

    if (!error && data) setTransacoes(data as unknown as TransacaoResumo[])
    setCarregando(false)
  }, [mesesChaves, escopoFiltro, membroFiltro, isAdmin, categoriasFiltro, subcategoriasFiltro])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const evolucaoMensal = useMemo(() => {
    const porMes = new Map(mesesChaves.map((chave) => [chave, { receitas: 0, despesas: 0 }]))
    for (const t of transacoes) {
      const bucket = porMes.get(t.data.slice(0, 7))
      if (!bucket) continue
      if (t.tipo === 'receita') bucket.receitas += Number(t.valor)
      else bucket.despesas += Number(t.valor)
    }
    return mesesChaves.map((chave) => ({
      mes: rotuloMesCurto(chave),
      Receitas: porMes.get(chave)!.receitas,
      Despesas: porMes.get(chave)!.despesas,
    }))
  }, [transacoes, mesesChaves])

  const gastosPorCategoria = useMemo(
    () => agruparDespesas(transacoes, (t) => t.categorias?.nome ?? '', 'Sem categoria'),
    [transacoes]
  )

  const gastosPorOrigem = useMemo(
    () =>
      agruparDespesas(
        transacoes,
        (t) => t.contas?.nome ?? t.cartoes_credito?.nome ?? '',
        'Não informado'
      ),
    [transacoes]
  )

  const familiarVsPessoal = useMemo(() => {
    let familiar = 0
    let pessoal = 0
    for (const t of transacoes) {
      if (t.tipo !== 'despesa') continue
      if (t.escopo === 'familiar') familiar += Number(t.valor)
      else pessoal += Number(t.valor)
    }
    return [
      { escopo: 'Familiar', valor: familiar, cor: CORES_CATEGORICAS[0] },
      { escopo: 'Pessoal', valor: pessoal, cor: CORES_CATEGORICAS[1] },
    ]
  }, [transacoes])

  const totalReceitas = transacoes
    .filter((t) => t.tipo === 'receita')
    .reduce((soma, t) => soma + Number(t.valor), 0)
  const totalDespesas = transacoes
    .filter((t) => t.tipo === 'despesa')
    .reduce((soma, t) => soma + Number(t.valor), 0)
  const saldo = totalReceitas - totalDespesas

  const classeBotao = (ativo: boolean) =>
    `shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      ativo
        ? 'bg-primaria text-white'
        : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
    }`

  const legendaRodape = {
    fontSize: 11,
    color: 'var(--texto-suave)',
    paddingTop: 8,
  } as const

  return (
    <Pagina>
      <CabecalhoPagina titulo="Relatórios" />

      {/* Filtros — rolam na horizontal no celular em vez de quebrar */}
      <div className="cartao mb-5 space-y-3 p-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-texto-suave">Período</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {(Object.keys(ROTULO_PERIODO) as Periodo[]).map((p) => (
              <button key={p} onClick={() => setPeriodo(p)} className={classeBotao(periodo === p)}>
                {ROTULO_PERIODO[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-texto-suave">Escopo</p>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {(['todos', 'familiar', 'pessoal'] as Escopo[]).map((e) => (
                <button
                  key={e}
                  onClick={() => setEscopoFiltro(e)}
                  className={classeBotao(escopoFiltro === e)}
                >
                  {e === 'todos' ? 'Todos' : e === 'familiar' ? 'Familiar' : 'Pessoal'}
                </button>
              ))}
            </div>
          </div>

          {isAdmin && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-texto-suave">Membro</p>
              <select
                className={classeInput}
                value={membroFiltro}
                onChange={(e) => setMembroFiltro(e.target.value)}
              >
                <option value="">Todos</option>
                {membros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SeletorMultiplo
            rotulo="Categoria"
            opcoes={categorias}
            selecionados={categoriasFiltro}
            onChange={atualizarCategoriasFiltro}
          />
          <SeletorMultiplo
            rotulo="Subcategoria"
            opcoes={subcategoriasDisponiveis}
            selecionados={subcategoriasFiltro}
            onChange={setSubcategoriasFiltro}
          />
        </div>
      </div>

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {!carregando && transacoes.length === 0 && (
        <EstadoVazio
          titulo="Nenhum lançamento no período"
          descricao="Escolha outro período nos filtros acima ou registre lançamentos."
        />
      )}

      {!carregando && transacoes.length > 0 && (
        <>
          {/* Resumo */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CartaoKpi titulo="Receitas" valor={moeda(totalReceitas)} cor={COR_RECEITA} />
            <CartaoKpi titulo="Despesas" valor={moeda(totalDespesas)} cor={COR_DESPESA} />
            <CartaoKpi titulo="Saldo" valor={moeda(saldo)} cor="#1c3a52" />
            <CartaoKpi titulo="Lançamentos" valor={String(transacoes.length)} cor="#159d76" />
          </div>

          {/* Centros de custo: onde o dinheiro mais some */}
          <section className="cartao mb-5 p-4">
            <h2 className="mb-1 text-sm font-semibold text-texto">Centros de Custo</h2>
            <p className="mb-4 text-xs text-texto-suave">
              Categorias que concentram os maiores gastos no período.
            </p>

            {gastosPorCategoria.length === 0 ? (
              <p className="py-6 text-center text-sm text-texto-suave">
                Nenhuma despesa neste período.
              </p>
            ) : (
              <ul className="space-y-3">
                {gastosPorCategoria.map((c) => {
                  const fatia = totalDespesas > 0 ? (c.valor / totalDespesas) * 100 : 0
                  return (
                    <li key={c.nome}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-texto">{c.nome}</span>
                        <span className="flex shrink-0 items-baseline gap-2">
                          <span className="text-xs text-texto-suave">{fatia.toFixed(1)}%</span>
                          <span className="font-semibold text-texto">{moeda(c.valor)}</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-fundo">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${fatia}%`, backgroundColor: c.cor }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Gráficos */}
          <div className="grid gap-5 lg:grid-cols-2">
            <BlocoGrafico
              titulo="Gastos por Categoria"
              vazio={gastosPorCategoria.length === 0}
            >
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={gastosPorCategoria}
                    dataKey="valor"
                    nameKey="nome"
                    innerRadius="45%"
                    outerRadius="72%"
                    paddingAngle={2}
                  >
                    {gastosPorCategoria.map((c) => (
                      <Cell key={c.nome} fill={c.cor} stroke="var(--superficie)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip content={<TooltipMoeda />} />
                  <Legend verticalAlign="bottom" height={48} wrapperStyle={legendaRodape} />
                </PieChart>
              </ResponsiveContainer>
            </BlocoGrafico>

            <BlocoGrafico
              titulo="Gastos por Conta / Cartão"
              vazio={gastosPorOrigem.length === 0}
            >
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={gastosPorOrigem}
                    dataKey="valor"
                    nameKey="nome"
                    innerRadius="45%"
                    outerRadius="72%"
                    paddingAngle={2}
                  >
                    {gastosPorOrigem.map((c) => (
                      <Cell key={c.nome} fill={c.cor} stroke="var(--superficie)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip content={<TooltipMoeda />} />
                  <Legend verticalAlign="bottom" height={48} wrapperStyle={legendaRodape} />
                </PieChart>
              </ResponsiveContainer>
            </BlocoGrafico>

            {escopoFiltro === 'todos' && (
              <BlocoGrafico titulo="Familiar vs. Pessoal" vazio={totalDespesas === 0}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={familiarVsPessoal} layout="vertical">
                    <CartesianGrid horizontal={false} stroke="var(--borda)" />
                    <XAxis
                      type="number"
                      tickFormatter={moedaCompacta}
                      tick={{ fontSize: 11, fill: 'var(--texto-suave)' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="escopo"
                      tick={{ fontSize: 11, fill: 'var(--texto-suave)' }}
                      width={64}
                    />
                    <Tooltip content={<TooltipMoeda />} cursor={{ fill: 'var(--fundo)' }} />
                    <Bar dataKey="valor" name="Gasto" radius={[0, 4, 4, 0]} barSize={28}>
                      {familiarVsPessoal.map((f) => (
                        <Cell key={f.escopo} fill={f.cor} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </BlocoGrafico>
            )}

            <BlocoGrafico
              titulo="Evolução Mensal"
              vazio={evolucaoMensal.length === 0}
              className={escopoFiltro === 'todos' ? '' : 'lg:col-span-2'}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={evolucaoMensal} margin={{ left: -12, right: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--borda)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--texto-suave)' }} />
                  <YAxis
                    tickFormatter={moedaCompacta}
                    tick={{ fontSize: 11, fill: 'var(--texto-suave)' }}
                    width={52}
                  />
                  <Tooltip content={<TooltipMoeda />} cursor={{ fill: 'var(--fundo)' }} />
                  <Legend wrapperStyle={legendaRodape} />
                  <Bar dataKey="Receitas" fill={COR_RECEITA} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Despesas" fill={COR_DESPESA} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </BlocoGrafico>
          </div>
        </>
      )}
    </Pagina>
  )
}
