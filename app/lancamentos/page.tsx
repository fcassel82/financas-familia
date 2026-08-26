'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { hojeISO } from '@/lib/formato'
import { IconeLixeira } from '@/components/Icones'
import {
  BotaoPrimario,
  BotaoSecundario,
  CabecalhoPagina,
  Campo,
  Mensagem,
  Pagina,
  classeInput,
} from '@/components/ui'

type Categoria = { id: string; nome: string; tipo: string }
type Subcategoria = { id: string; categoria_id: string; nome: string }
type Conta = { id: string; nome: string }
type Cartao = { id: string; nome: string }

function FormularioLancamento() {
  const searchParams = useSearchParams()
  const idEdicao = searchParams.get('id')
  const router = useRouter()

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])

  const [tipo, setTipo] = useState('despesa')
  const [data, setData] = useState(hojeISO())
  const [descricao, setDescricao] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [subcategoriaId, setSubcategoriaId] = useState('')
  const [valor, setValor] = useState('')
  const [pagoCom, setPagoCom] = useState<'conta' | 'cartao'>('conta')
  const [contaId, setContaId] = useState('')
  const [cartaoId, setCartaoId] = useState('')
  const [escopo, setEscopo] = useState('pessoal')

  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const [carregando, setCarregando] = useState(!!idEdicao)

  useEffect(() => {
    async function carregarListas() {
      const [{ data: cats }, { data: subs }, { data: cts }, { data: crts }] = await Promise.all([
        supabase.from('categorias').select('id, nome, tipo').order('nome'),
        supabase.from('subcategorias').select('id, categoria_id, nome').order('nome'),
        supabase.from('contas').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('cartoes_credito').select('id, nome').eq('ativo', true).order('nome'),
      ])
      setCategorias((cats ?? []) as Categoria[])
      setSubcategorias((subs ?? []) as Subcategoria[])
      setContas((cts ?? []) as Conta[])
      setCartoes((crts ?? []) as Cartao[])
    }
    carregarListas()
  }, [])

  useEffect(() => {
    if (!idEdicao) return

    async function carregarTransacao() {
      const { data: t, error } = await supabase
        .from('transacoes')
        .select(
          'data, descricao, categoria_id, subcategoria_id, valor, tipo, escopo, conta_id, cartao_id'
        )
        .eq('id', idEdicao)
        .single()

      if (!error && t) {
        setData(t.data)
        setDescricao(t.descricao)
        setCategoriaId(t.categoria_id ?? '')
        setSubcategoriaId(t.subcategoria_id ?? '')
        setValor(String(t.valor))
        setTipo(t.tipo)
        setEscopo(t.escopo)
        setContaId(t.conta_id ?? '')
        setCartaoId(t.cartao_id ?? '')
        setPagoCom(t.cartao_id ? 'cartao' : 'conta')
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

    const registro = {
      data,
      descricao,
      categoria_id: categoriaId || null,
      subcategoria_id: subcategoriaId || null,
      valor: parseFloat(valor),
      tipo,
      escopo,
      conta_id: pagoCom === 'conta' ? contaId || null : null,
      cartao_id: pagoCom === 'cartao' ? cartaoId || null : null,
    }

    if (idEdicao) {
      const { error } = await supabase.from('transacoes').update(registro).eq('id', idEdicao)
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

    const { error } = await supabase
      .from('transacoes')
      .insert({ ...registro, dono_id: userId, lancado_por: userId })

    setSalvando(false)
    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }

    setMensagem('Lançamento salvo com sucesso!')
    setDescricao('')
    setValor('')
  }

  async function apagar() {
    if (!idEdicao) return
    const confirmado = window.confirm(
      `Apagar o lançamento "${descricao}"?\n\nEsta ação não pode ser desfeita.`
    )
    if (!confirmado) return

    setApagando(true)
    const { error } = await supabase.from('transacoes').delete().eq('id', idEdicao)
    setApagando(false)

    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    router.push('/transacoes')
  }

  const categoriasFiltradas = categorias.filter((c) => c.tipo === tipo)
  const subcategoriasFiltradas = subcategorias.filter((s) => s.categoria_id === categoriaId)

  if (carregando) {
    return (
      <Pagina>
        <p className="text-sm text-texto-suave">Carregando...</p>
      </Pagina>
    )
  }

  const classeSeletorTipo = (valorTipo: string) =>
    `flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
      tipo === valorTipo
        ? valorTipo === 'receita'
          ? 'bg-receita text-white'
          : 'bg-despesa text-white'
        : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
    }`

  return (
    <Pagina>
      <CabecalhoPagina titulo={idEdicao ? 'Editar Lançamento' : 'Novo Lançamento'} />

      <form onSubmit={handleSubmit} className="cartao mx-auto max-w-2xl space-y-5 p-5">
        {/* Tipo */}
        <div className="flex gap-2">
          <button type="button" onClick={() => setTipo('despesa')} className={classeSeletorTipo('despesa')}>
            Despesa
          </button>
          <button type="button" onClick={() => setTipo('receita')} className={classeSeletorTipo('receita')}>
            Receita
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Data">
            <input
              type="date"
              className={classeInput}
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
            />
          </Campo>

          <Campo rotulo="Valor (R$)">
            <input
              type="number"
              step="0.01"
              className={classeInput}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              required
            />
          </Campo>
        </div>

        <Campo rotulo="Descrição">
          <input
            className={classeInput}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Supermercado"
            required
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Categoria">
            <select
              className={classeInput}
              value={categoriaId}
              onChange={(e) => {
                setCategoriaId(e.target.value)
                setSubcategoriaId('')
              }}
            >
              <option value="">Sem categoria</option>
              {categoriasFiltradas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Subcategoria">
            <select
              className={classeInput}
              value={subcategoriaId}
              onChange={(e) => setSubcategoriaId(e.target.value)}
              disabled={!categoriaId}
            >
              <option value="">Nenhuma</option>
              {subcategoriasFiltradas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {/* Forma de pagamento */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-texto">Pago com</span>
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setPagoCom('conta')}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                pagoCom === 'conta'
                  ? 'bg-marinho text-white'
                  : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
              }`}
            >
              Conta
            </button>
            <button
              type="button"
              onClick={() => setPagoCom('cartao')}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                pagoCom === 'cartao'
                  ? 'bg-marinho text-white'
                  : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
              }`}
            >
              Cartão de crédito
            </button>
          </div>

          {pagoCom === 'conta' ? (
            <select
              className={classeInput}
              value={contaId}
              onChange={(e) => setContaId(e.target.value)}
            >
              <option value="">Selecione a conta...</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          ) : (
            <select
              className={classeInput}
              value={cartaoId}
              onChange={(e) => setCartaoId(e.target.value)}
            >
              <option value="">Selecione o cartão...</option>
              {cartoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}

          {pagoCom === 'conta' && contas.length === 0 && (
            <p className="mt-2 text-xs text-texto-suave">
              Nenhuma conta cadastrada ainda —{' '}
              <a href="/contas" className="font-medium text-primaria hover:underline">
                cadastrar agora
              </a>
            </p>
          )}
          {pagoCom === 'cartao' && cartoes.length === 0 && (
            <p className="mt-2 text-xs text-texto-suave">
              Nenhum cartão cadastrado ainda —{' '}
              <a href="/cartoes" className="font-medium text-primaria hover:underline">
                cadastrar agora
              </a>
            </p>
          )}
        </div>

        <Campo rotulo="Este lançamento é...">
          <select
            className={classeInput}
            value={escopo}
            onChange={(e) => setEscopo(e.target.value)}
          >
            <option value="familiar">Familiar (todos veem)</option>
            <option value="pessoal">Pessoal (só eu vejo)</option>
          </select>
        </Campo>

        <Mensagem texto={mensagem} />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borda pt-4">
          {idEdicao ? (
            <button
              type="button"
              onClick={apagar}
              disabled={apagando}
              className="inline-flex items-center gap-2 rounded-lg border border-despesa/30 px-4 py-2.5 text-sm font-medium text-despesa transition-colors hover:bg-despesa/10 disabled:opacity-50"
            >
              <IconeLixeira className="h-4 w-4" />
              {apagando ? 'Apagando...' : 'Apagar lançamento'}
            </button>
          ) : (
            <span />
          )}

          <div className="ml-auto flex gap-2">
            <BotaoSecundario type="button" onClick={() => router.push('/transacoes')}>
              Cancelar
            </BotaoSecundario>
            <BotaoPrimario type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : idEdicao ? 'Salvar alterações' : 'Salvar lançamento'}
            </BotaoPrimario>
          </div>
        </div>
      </form>
    </Pagina>
  )
}

export default function LancamentosPage() {
  return (
    <Suspense
      fallback={
        <Pagina>
          <p className="text-sm text-texto-suave">Carregando...</p>
        </Pagina>
      }
    >
      <FormularioLancamento />
    </Suspense>
  )
}
