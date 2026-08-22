'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Categoria = {
  id: string
  nome: string
  tipo: string
}

function LancamentoForm() {
  const searchParams = useSearchParams()
  const idEdicao = searchParams.get('id')
  const router = useRouter()

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [data, setData] = useState('')
  const [descricao, setDescricao] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [valor, setValor] = useState('')
  const [tipo, setTipo] = useState('despesa')
  const [escopo, setEscopo] = useState('pessoal')
  const [bancoCartao, setBancoCartao] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(!!idEdicao)

  useEffect(() => {
    async function carregarCategorias() {
      const { data, error } = await supabase
        .from('categorias')
        .select('id, nome, tipo')
        .order('nome')

      if (!error && data) {
        setCategorias(data)
      }
    }
    carregarCategorias()
  }, [])

  useEffect(() => {
    if (!idEdicao) return

    async function carregarTransacao() {
      const { data: transacao, error } = await supabase
        .from('transacoes')
        .select('data, descricao, categoria_id, valor, tipo, escopo, banco_cartao')
        .eq('id', idEdicao)
        .single()

      if (!error && transacao) {
        setData(transacao.data)
        setDescricao(transacao.descricao)
        setCategoriaId(transacao.categoria_id)
        setValor(String(transacao.valor))
        setTipo(transacao.tipo)
        setEscopo(transacao.escopo)
        setBancoCartao(transacao.banco_cartao ?? '')
      } else {
        setMensagem('Não foi possível carregar este lançamento.')
      }
      setCarregando(false)
    }
    carregarTransacao()
  }, [idEdicao])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMensagem('')
    setSalvando(true)

    if (idEdicao) {
      const { error } = await supabase
        .from('transacoes')
        .update({
          data,
          descricao,
          categoria_id: categoriaId,
          valor: parseFloat(valor),
          tipo,
          escopo,
          banco_cartao: bancoCartao || null,
        })
        .eq('id', idEdicao)

      setSalvando(false)

      if (error) {
        setMensagem('Erro ao salvar: ' + error.message)
        return
      }

      router.push('/transacoes')
      return
    }

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    const { error } = await supabase.from('transacoes').insert({
      data,
      descricao,
      categoria_id: categoriaId,
      valor: parseFloat(valor),
      tipo,
      escopo,
      banco_cartao: bancoCartao || null,
      dono_id: userId,
      lancado_por: userId,
    })

    setSalvando(false)

    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }

    setMensagem('Lançamento salvo com sucesso!')
    setDescricao('')
    setValor('')
    setBancoCartao('')
  }

  const categoriasFiltradas = categorias.filter((c) => c.tipo === tipo)

  if (carregando) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <p className="text-sm text-gray-500">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-md rounded-lg bg-white p-6 shadow-md">
        <h1 className="mb-6 text-xl font-semibold text-gray-800">
          {idEdicao ? 'Editar Lançamento' : 'Novo Lançamento'}
        </h1>

        <form onSubmit={handleSubmit}>
          <label className="mb-1 block text-sm text-gray-600">Tipo</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="despesa">Despesa</option>
            <option value="receita">Receita</option>
          </select>

          <label className="mb-1 block text-sm text-gray-600">Data</label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
            required
          />

          <label className="mb-1 block text-sm text-gray-600">Descrição</label>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
            placeholder="Ex: Supermercado"
            required
          />

          <label className="mb-1 block text-sm text-gray-600">Categoria</label>
          <select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
            required
          >
            <option value="">Selecione...</option>
            {categoriasFiltradas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>

          <label className="mb-1 block text-sm text-gray-600">Valor (R$)</label>
          <input
            type="number"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
            required
          />

          <label className="mb-1 block text-sm text-gray-600">
            Banco / Cartão (opcional)
          </label>
          <input
            type="text"
            value={bancoCartao}
            onChange={(e) => setBancoCartao(e.target.value)}
            className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
            placeholder="Ex: Itaú, Nubank, Dinheiro"
          />

          <label className="mb-1 block text-sm text-gray-600">
            Este gasto é...
          </label>
          <div className="mb-6 flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="escopo"
                value="familiar"
                checked={escopo === 'familiar'}
                onChange={(e) => setEscopo(e.target.value)}
              />
              Familiar (todos veem)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="escopo"
                value="pessoal"
                checked={escopo === 'pessoal'}
                onChange={(e) => setEscopo(e.target.value)}
              />
              Pessoal (só eu vejo)
            </label>
          </div>

          {mensagem && (
            <p
              className={`mb-4 text-sm ${
                mensagem.startsWith('Erro') || mensagem.startsWith('Não')
                  ? 'text-red-600'
                  : 'text-green-600'
              }`}
            >
              {mensagem}
            </p>
          )}

          <button
            type="submit"
            disabled={salvando}
            className="w-full rounded bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {salvando
              ? 'Salvando...'
              : idEdicao
                ? 'Salvar Alterações'
                : 'Salvar Lançamento'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LancamentosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-6">
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      }
    >
      <LancamentoForm />
    </Suspense>
  )
}
