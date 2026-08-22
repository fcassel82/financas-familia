'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Transacao = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  escopo: string
  banco_cartao: string | null
  categorias: { nome: string } | null
  subcategorias: { nome: string } | null
}

type Categoria = { id: string; nome: string }
type Subcategoria = { id: string; categoria_id: string; nome: string }
type Membro = { id: string; nome: string }

function formatarDataBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export default function TransacoesPage() {
  const [aba, setAba] = useState<'familiar' | 'pessoal'>('familiar')
  const [transacoes, setTransacoes] = useState<Transacao[]>([])
  const [carregando, setCarregando] = useState(true)

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [membros, setMembros] = useState<Membro[]>([])
  const [isAdmin, setIsAdmin] = useState(false)

  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')
  const [subcategoriaFiltro, setSubcategoriaFiltro] = useState('')
  const [bancoCartaoFiltro, setBancoCartaoFiltro] = useState('')
  const [membroFiltro, setMembroFiltro] = useState('')

  useEffect(() => {
    async function carregarFiltros() {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id

      const [{ data: categoriasData }, { data: subcategoriasData }, { data: perfilData }] =
        await Promise.all([
          supabase.from('categorias').select('id, nome').order('nome'),
          supabase.from('subcategorias').select('id, categoria_id, nome').order('nome'),
          userId ? supabase.from('perfis').select('papel').eq('id', userId).single() : Promise.resolve({ data: null }),
        ])

      if (categoriasData) setCategorias(categoriasData)
      if (subcategoriasData) setSubcategorias(subcategoriasData)

      const admin = perfilData?.papel === 'admin'
      setIsAdmin(admin)

      if (admin) {
        const { data: membrosData } = await supabase.from('perfis').select('id, nome').order('nome')
        if (membrosData) setMembros(membrosData)
      }
    }
    carregarFiltros()
  }, [])

  useEffect(() => {
    async function carregar() {
      setCarregando(true)
      let query = supabase
        .from('transacoes')
        .select('id, data, descricao, valor, tipo, escopo, banco_cartao, categorias(nome), subcategorias(nome)')
        .eq('escopo', aba)
        .order('data', { ascending: false })

      if (dataInicio) query = query.gte('data', dataInicio)
      if (dataFim) query = query.lte('data', dataFim)
      if (categoriaFiltro) query = query.eq('categoria_id', categoriaFiltro)
      if (subcategoriaFiltro) query = query.eq('subcategoria_id', subcategoriaFiltro)
      if (bancoCartaoFiltro) query = query.ilike('banco_cartao', `%${bancoCartaoFiltro}%`)
      if (isAdmin && membroFiltro) query = query.eq('dono_id', membroFiltro)

      const { data, error } = await query

      if (!error && data) {
        setTransacoes(data as unknown as Transacao[])
      }
      setCarregando(false)
    }
    carregar()
  }, [aba, dataInicio, dataFim, categoriaFiltro, subcategoriaFiltro, bancoCartaoFiltro, membroFiltro, isAdmin])

  const subcategoriasFiltradas = useMemo(
    () => subcategorias.filter((s) => s.categoria_id === categoriaFiltro),
    [subcategorias, categoriaFiltro]
  )

  function limparFiltros() {
    setDataInicio('')
    setDataFim('')
    setCategoriaFiltro('')
    setSubcategoriaFiltro('')
    setBancoCartaoFiltro('')
    setMembroFiltro('')
  }

  const filtrosAtivos =
    !!dataInicio || !!dataFim || !!categoriaFiltro || !!subcategoriaFiltro || !!bancoCartaoFiltro || !!membroFiltro

  const total = transacoes.reduce((soma, t) => {
    return t.tipo === 'receita' ? soma + Number(t.valor) : soma - Number(t.valor)
  }, 0)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-800">Lançamentos</h1>
          <Link
            href="/lancamentos"
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            + Novo lançamento
          </Link>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setAba('familiar')}
            className={`rounded px-4 py-2 text-sm ${
              aba === 'familiar'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300'
            }`}
          >
            Gastos Familiares
          </button>
          <button
            onClick={() => setAba('pessoal')}
            className={`rounded px-4 py-2 text-sm ${
              aba === 'pessoal'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300'
            }`}
          >
            Meus Lançamentos Pessoais
          </button>
        </div>

        <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Filtros</p>
            {filtrosAtivos && (
              <button onClick={limparFiltros} className="text-xs text-blue-600 hover:underline">
                Limpar filtros
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">De</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Até</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Banco / Cartão</label>
              <input
                type="text"
                value={bancoCartaoFiltro}
                onChange={(e) => setBancoCartaoFiltro(e.target.value)}
                placeholder="Ex: Nubank"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Categoria</label>
              <select
                value={categoriaFiltro}
                onChange={(e) => {
                  setCategoriaFiltro(e.target.value)
                  setSubcategoriaFiltro('')
                }}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">Todas</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Subcategoria</label>
              <select
                value={subcategoriaFiltro}
                onChange={(e) => setSubcategoriaFiltro(e.target.value)}
                disabled={!categoriaFiltro}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
              >
                <option value="">Todas</option>
                {subcategoriasFiltradas.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>
            {isAdmin && (
              <div>
                <label className="mb-1 block text-xs text-gray-500">Membro</label>
                <select
                  value={membroFiltro}
                  onChange={(e) => setMembroFiltro(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
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

        <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Saldo do período</p>
          <p className={`text-2xl font-semibold ${total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            R$ {total.toFixed(2)}
          </p>
        </div>

        <div className="rounded-lg bg-white shadow-sm">
          {carregando && <p className="p-4 text-sm text-gray-500">Carregando...</p>}

          {!carregando && transacoes.length === 0 && (
            <p className="p-4 text-sm text-gray-500">Nenhum lançamento encontrado.</p>
          )}

          {!carregando &&
            transacoes.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between border-b border-gray-100 p-4 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{t.descricao}</p>
                  <p className="text-xs text-gray-500">
                    {formatarDataBR(t.data)} · {t.categorias?.nome ?? 'Sem categoria'}
                    {t.subcategorias?.nome ? ` / ${t.subcategorias.nome}` : ''}
                    {t.banco_cartao ? ` · ${t.banco_cartao}` : ''}
                  </p>
                </div>
                <p
                  className={`text-sm font-semibold ${
                    t.tipo === 'receita' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {t.tipo === 'receita' ? '+' : '-'} R$ {Number(t.valor).toFixed(2)}
                </p>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
