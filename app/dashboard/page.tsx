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
  categorias: { nome: string } | null
}

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
const COR_RECEITA = '#0ca30c'
const COR_DESPESA = '#e34948'

const formatoMoeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function chavesDosUltimosMeses(quantidade: number): string[] {
  const chaves: string[] = []
  const referencia = new Date()
  referencia.setDate(1)
  for (let i = quantidade - 1; i >= 0; i--) {
    const d = new Date(referencia.getFullYear(), referencia.getMonth() - i, 1)
    chaves.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return chaves
}

function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split('-').map(Number)
  const d = new Date(ano, mes - 1, 1)
  const rotulo = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
  return rotulo.replace('.', '')
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

export default function DashboardPage() {
  const [transacoes, setTransacoes] = useState<TransacaoResumo[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregar() {
      setCarregando(true)
      const chaves = chavesDosUltimosMeses(6)
      const dataInicio = `${chaves[0]}-01`

      const { data, error } = await supabase
        .from('transacoes')
        .select('data, valor, tipo, escopo, categorias(nome)')
        .gte('data', dataInicio)
        .order('data')

      if (!error && data) {
        setTransacoes(data as unknown as TransacaoResumo[])
      }
      setCarregando(false)
    }
    carregar()
  }, [])

  const mesesChaves = useMemo(() => chavesDosUltimosMeses(6), [])
  const mesAtual = mesesChaves[mesesChaves.length - 1]

  const evolucaoMensal = useMemo(() => {
    const porMes = new Map(mesesChaves.map((chave) => [chave, { receitas: 0, despesas: 0 }]))
    for (const t of transacoes) {
      const chave = t.data.slice(0, 7)
      const bucket = porMes.get(chave)
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

  const gastosPorCategoria = useMemo(() => {
    const totais = new Map<string, number>()
    for (const t of transacoes) {
      if (t.tipo !== 'despesa' || t.data.slice(0, 7) !== mesAtual) continue
      const nome = t.categorias?.nome ?? 'Sem categoria'
      totais.set(nome, (totais.get(nome) ?? 0) + Number(t.valor))
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
  }, [transacoes, mesAtual])

  const familiarVsPessoal = useMemo(() => {
    let familiar = 0
    let pessoal = 0
    for (const t of transacoes) {
      if (t.tipo !== 'despesa' || t.data.slice(0, 7) !== mesAtual) continue
      if (t.escopo === 'familiar') familiar += Number(t.valor)
      else pessoal += Number(t.valor)
    }
    return [
      { escopo: 'Familiar', valor: familiar, cor: CORES_CATEGORICAS[0] },
      { escopo: 'Pessoal', valor: pessoal, cor: CORES_CATEGORICAS[1] },
    ]
  }, [transacoes, mesAtual])

  const totalGastosMes = gastosPorCategoria.reduce((soma, c) => soma + c.valor, 0)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-xl font-semibold text-gray-800">Dashboard</h1>

        {carregando && <p className="text-sm text-gray-500">Carregando...</p>}

        {!carregando && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <h2 className="mb-1 text-sm font-medium text-gray-700">
                Gastos por Categoria — {rotuloMes(mesAtual)}
              </h2>
              {totalGastosMes === 0 ? (
                <p className="py-12 text-center text-sm text-gray-400">
                  Nenhuma despesa lançada este mês.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={gastosPorCategoria}
                      dataKey="valor"
                      nameKey="nome"
                      innerRadius={60}
                      outerRadius={100}
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
                Familiar vs. Pessoal — {rotuloMes(mesAtual)}
              </h2>
              {totalGastosMes === 0 ? (
                <p className="py-12 text-center text-sm text-gray-400">
                  Nenhuma despesa lançada este mês.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
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

            <div className="rounded-lg bg-white p-4 shadow-sm lg:col-span-2">
              <h2 className="mb-1 text-sm font-medium text-gray-700">
                Evolução Mensal — últimos 6 meses
              </h2>
              <ResponsiveContainer width="100%" height={300}>
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
        )}
      </div>
    </div>
  )
}
