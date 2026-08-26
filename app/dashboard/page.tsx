'use client'

import { useEffect, useMemo, useState } from 'react'
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

type TransacaoResumo = {
  data: string
  valor: number
  tipo: string
  escopo: string
  banco_cartao: string | null
  dono_id: string
  categorias: { nome: string } | null
}

type Membro = { id: string; nome: string }
type Periodo = 'mes' | '3m' | '6m' | 'ano'
type Escopo = 'todos' | 'familiar' | 'pessoal'

const CORES_CATEGORICAS = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
]
const COR_OUTRAS = '#898781'
const COR_RECEITA = '#0e9f6e'
const COR_DESPESA = '#dc4c4c'
const COR_TEAL = '#159d76'
const COR_MARINHO = '#1c3a52'

const formatoMoeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

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

function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split('-').map(Number)
  const d = new Date(ano, mes - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
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
    <div className="rounded border border-gray-200 bg-white px-3 py-2 text-sm shadow-md">
      {label && <p className="mb-1 font-medium text-gray-800">{label}</p>}
      {payload.map((item) => (
        <p key={item.name} style={{ color: item.color || item.payload?.fill }}>
          {item.name}: {formatoMoeda.format(item.value ?? 0)}
        </p>
      ))}
    </div>
  )
}

function KpiCard({
  titulo,
  valor,
  cor,
}: {
  titulo: string
  valor: string
  cor: string
}) {
  return (
    <div className="rounded-lg p-4 shadow-sm" style={{ backgroundColor: cor }}>
      <p className="text-xs font-medium uppercase tracking-wide text-white/80">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-white">{valor}</p>
    </div>
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

  const principais = ordenado.slice(0, 7)
  const restante = ordenado.slice(7).reduce((soma, c) => soma + c.valor, 0)
  if (restante > 0) principais.push({ nome: 'Outras', valor: restante })

  return principais.map((c, i) => ({
    ...c,
    cor: c.nome === 'Outras' ? COR_OUTRAS : CORES_CATEGORICAS[i % CORES_CATEGORICAS.length],
  }))
}

const ROTULO_PERIODO: Record<Periodo, string> = {
  mes: 'Este mês',
  '3m': 'Últimos 3 meses',
  '6m': 'Últimos 6 meses',
  ano: 'Este ano',
}

export default function DashboardPage() {
  const [transacoes, setTransacoes] = useState<TransacaoResumo[]>([])
  const [carregando, setCarregando] = useState(true)

  const [periodo, setPeriodo] = useState<Periodo>('6m')
  const [escopoFiltro, setEscopoFiltro] = useState<Escopo>('todos')
  const [membroFiltro, setMembroFiltro] = useState('')
  const [membros, setMembros] = useState<Membro[]>([])
  const [isAdmin, setIsAdmin] = useState(false)

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
    carregarPerfil()
  }, [])

  const mesesChaves = useMemo(() => mesesDoPeriodo(periodo), [periodo])

  useEffect(() => {
    async function carregar() {
      setCarregando(true)
      const dataInicio = `${mesesChaves[0]}-01`

      let query = supabase
        .from('transacoes')
        .select('data, valor, tipo, escopo, banco_cartao, dono_id, categorias(nome)')
        .gte('data', dataInicio)
        .order('data')

      if (escopoFiltro !== 'todos') query = query.eq('escopo', escopoFiltro)
      if (isAdmin && membroFiltro) query = query.eq('dono_id', membroFiltro)

      const { data, error } = await query

      if (!error && data) {
        setTransacoes(data as unknown as TransacaoResumo[])
      }
      setCarregando(false)
    }
    carregar()
  }, [mesesChaves, escopoFiltro, membroFiltro, isAdmin])

  const evolucaoMensal = useMemo(() => {
    const porMes = new Map(mesesChaves.map((chave) => [chave, { receitas: 0, despesas: 0 }]))
    for (const t of transacoes) {
      const bucket = porMes.get(t.data.slice(0, 7))
      if (!bucket) continue
      if (t.tipo === 'receita') bucket.receitas += Number(t.valor)
      else bucket.despesas += Number(t.valor)
    }
    return mesesChaves.map((chave) => ({
      mes: rotuloMes(chave),
      Receitas: porMes.get(chave)!.receitas,
      Despesas: porMes.get(chave)!.despesas,
    }))
  }, [transacoes, mesesChaves])

  const gastosPorCategoria = useMemo(
    () => agruparDespesas(transacoes, (t) => t.categorias?.nome ?? '', 'Sem categoria'),
    [transacoes]
  )

  const gastosPorBanco = useMemo(
    () => agruparDespesas(transacoes, (t) => t.banco_cartao ?? '', 'Não informado'),
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

  const botaoClasse = (ativo: boolean) =>
    `rounded px-3 py-1.5 text-sm ${
      ativo ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300'
    }`

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-xl font-semibold text-gray-800">Dashboard</h1>

        <div className="mb-6 rounded-lg bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-medium text-gray-700">Filtros</p>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="mb-1 text-xs text-gray-500">Período</p>
              <div className="flex gap-1">
                {(Object.keys(ROTULO_PERIODO) as Periodo[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriodo(p)}
                    className={botaoClasse(periodo === p)}
                  >
                    {ROTULO_PERIODO[p]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs text-gray-500">Escopo</p>
              <div className="flex gap-1">
                <button
                  onClick={() => setEscopoFiltro('todos')}
                  className={botaoClasse(escopoFiltro === 'todos')}
                >
                  Todos
                </button>
                <button
                  onClick={() => setEscopoFiltro('familiar')}
                  className={botaoClasse(escopoFiltro === 'familiar')}
                >
                  Familiar
                </button>
                <button
                  onClick={() => setEscopoFiltro('pessoal')}
                  className={botaoClasse(escopoFiltro === 'pessoal')}
                >
                  Pessoal
                </button>
              </div>
            </div>

            {isAdmin && (
              <div>
                <p className="mb-1 text-xs text-gray-500">Membro</p>
                <select
                  value={membroFiltro}
                  onChange={(e) => setMembroFiltro(e.target.value)}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-800"
                >
                  <option value="">Todos</option>
                  {membros.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {carregando && <p className="text-sm text-gray-500">Carregando...</p>}

        {!carregando && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard titulo="Total de Receitas" valor={formatoMoeda.format(totalReceitas)} cor={COR_RECEITA} />
              <KpiCard titulo="Total de Despesas" valor={formatoMoeda.format(totalDespesas)} cor={COR_DESPESA} />
              <KpiCard titulo="Saldo" valor={formatoMoeda.format(saldo)} cor={COR_MARINHO} />
              <KpiCard titulo="Lançamentos" valor={String(transacoes.length)} cor={COR_TEAL} />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-lg bg-white p-4 shadow-sm">
                <h2 className="mb-1 text-sm font-medium text-gray-700">
                  Gastos por Categoria — {ROTULO_PERIODO[periodo]}
                </h2>
                {gastosPorCategoria.length === 0 ? (
                  <p className="py-12 text-center text-sm text-gray-400">
                    Nenhuma despesa neste período.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={gastosPorCategoria}
                        dataKey="valor"
                        nameKey="nome"
                        innerRadius={55}
                        outerRadius={95}
                        paddingAngle={2}
                      >
                        {gastosPorCategoria.map((c) => (
                          <Cell key={c.nome} fill={c.cor} stroke="#fcfcfb" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip content={<TooltipMoeda />} />
                      <Legend
                        layout="vertical"
                        align="right"
                        verticalAlign="middle"
                        wrapperStyle={{ fontSize: 12, color: '#52514e' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="rounded-lg bg-white p-4 shadow-sm">
                <h2 className="mb-1 text-sm font-medium text-gray-700">
                  Gastos por Banco/Cartão — {ROTULO_PERIODO[periodo]}
                </h2>
                {gastosPorBanco.length === 0 ? (
                  <p className="py-12 text-center text-sm text-gray-400">
                    Nenhuma despesa neste período.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={gastosPorBanco}
                        dataKey="valor"
                        nameKey="nome"
                        innerRadius={55}
                        outerRadius={95}
                        paddingAngle={2}
                      >
                        {gastosPorBanco.map((c) => (
                          <Cell key={c.nome} fill={c.cor} stroke="#fcfcfb" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip content={<TooltipMoeda />} />
                      <Legend
                        layout="vertical"
                        align="right"
                        verticalAlign="middle"
                        wrapperStyle={{ fontSize: 12, color: '#52514e' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              {escopoFiltro === 'todos' && (
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <h2 className="mb-1 text-sm font-medium text-gray-700">
                    Familiar vs. Pessoal — {ROTULO_PERIODO[periodo]}
                  </h2>
                  {totalDespesas === 0 ? (
                    <p className="py-12 text-center text-sm text-gray-400">
                      Nenhuma despesa neste período.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={familiarVsPessoal} layout="vertical" margin={{ left: 16 }}>
                        <CartesianGrid horizontal={false} stroke="#e1e0d9" />
                        <XAxis
                          type="number"
                          tickFormatter={(v) => formatoMoeda.format(v)}
                          tick={{ fontSize: 12, fill: '#898781' }}
                        />
                        <YAxis
                          type="category"
                          dataKey="escopo"
                          tick={{ fontSize: 12, fill: '#52514e' }}
                          width={70}
                        />
                        <Tooltip content={<TooltipMoeda />} cursor={{ fill: '#f9f9f7' }} />
                        <Bar dataKey="valor" name="Gasto" radius={[0, 4, 4, 0]} barSize={32}>
                          {familiarVsPessoal.map((f) => (
                            <Cell key={f.escopo} fill={f.cor} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}

              <div className={`rounded-lg bg-white p-4 shadow-sm ${escopoFiltro === 'todos' ? '' : 'lg:col-span-2'}`}>
                <h2 className="mb-1 text-sm font-medium text-gray-700">
                  Evolução Mensal — {ROTULO_PERIODO[periodo]}
                </h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={evolucaoMensal}>
                    <CartesianGrid vertical={false} stroke="#e1e0d9" />
                    <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#898781' }} />
                    <YAxis
                      tickFormatter={(v) => formatoMoeda.format(v)}
                      tick={{ fontSize: 12, fill: '#898781' }}
                      width={80}
                    />
                    <Tooltip content={<TooltipMoeda />} cursor={{ fill: '#f9f9f7' }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#52514e' }} />
                    <Bar dataKey="Receitas" fill={COR_RECEITA} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Despesas" fill={COR_DESPESA} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
