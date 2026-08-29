'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import {
  chaveMes,
  dataBR,
  deslocarMes,
  limitesDoMes,
  moeda,
  normalizar,
  rotuloMesLongo,
} from '@/lib/formato'
import { sugerirCategoriaLancamento } from '@/lib/sugerirCategoriaHistorico'
import { IconeLixeira, IconeMais, IconeSeta } from '@/components/Icones'
import {
  BotaoPrimario,
  BotaoSecundario,
  CabecalhoPagina,
  Campo,
  EstadoVazio,
  Mensagem,
  Pagina,
  classeInput,
} from '@/components/ui'

type Transacao = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  escopo: string
  dono_id: string
  categoria_id: string | null
  subcategoria_id: string | null
  conta_id: string | null
  cartao_id: string | null
  categorias: { nome: string } | null
  subcategorias: { nome: string } | null
  contas: { nome: string; cor: string | null } | null
  cartoes_credito: { nome: string; cor: string | null } | null
}

type Categoria = { id: string; nome: string; tipo: string }
type Subcategoria = { id: string; categoria_id: string; nome: string }
type Membro = { id: string; nome: string }
type Conta = { id: string; nome: string }
type Cartao = { id: string; nome: string }

type FormEdicao = {
  tipo: string
  data: string
  descricao: string
  categoria_id: string
  subcategoria_id: string
  valor: string
  pago_com: 'conta' | 'cartao'
  conta_id: string
  cartao_id: string
  escopo: string
}

function formularioEdicaoDe(t: Transacao): FormEdicao {
  return {
    tipo: t.tipo,
    data: t.data,
    descricao: t.descricao,
    categoria_id: t.categoria_id ?? '',
    subcategoria_id: t.subcategoria_id ?? '',
    valor: String(t.valor),
    pago_com: t.cartao_id ? 'cartao' : 'conta',
    conta_id: t.conta_id ?? '',
    cartao_id: t.cartao_id ?? '',
    escopo: t.escopo,
  }
}

export default function TransacoesPage() {
  const [aba, setAba] = useState<'familiar' | 'pessoal' | 'todos'>('familiar')
  const [transacoes, setTransacoes] = useState<Transacao[]>([])
  const [carregando, setCarregando] = useState(true)

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [membros, setMembros] = useState<Membro[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState('')

  const [mes, setMes] = useState(chaveMes(new Date()))
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')
  const [subcategoriaFiltro, setSubcategoriaFiltro] = useState('')
  const [contaFiltro, setContaFiltro] = useState('')
  const [membroFiltro, setMembroFiltro] = useState('')
  const [filtrosVisiveis, setFiltrosVisiveis] = useState(false)

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [formEdicao, setFormEdicao] = useState<FormEdicao | null>(null)
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [apagandoEdicao, setApagandoEdicao] = useState(false)
  const [mensagemEdicao, setMensagemEdicao] = useState('')

  useEffect(() => {
    async function carregarListas() {
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData.user?.id
      if (uid) setUserId(uid)

      const [{ data: cats }, { data: subs }, { data: cts }, { data: crts }, { data: perfil }] =
        await Promise.all([
          supabase.from('categorias').select('id, nome, tipo').order('nome'),
          supabase.from('subcategorias').select('id, categoria_id, nome').order('nome'),
          supabase.from('contas').select('id, nome').order('nome'),
          supabase.from('cartoes_credito').select('id, nome').order('nome'),
          uid
            ? supabase.from('perfis').select('papel').eq('id', uid).single()
            : Promise.resolve({ data: null }),
        ])

      setCategorias((cats ?? []) as Categoria[])
      setSubcategorias((subs ?? []) as Subcategoria[])
      setContas((cts ?? []) as Conta[])
      setCartoes((crts ?? []) as Cartao[])

      const admin = perfil?.papel === 'admin'
      setIsAdmin(admin)

      if (admin) {
        const { data: membrosData } = await supabase.from('perfis').select('id, nome').order('nome')
        setMembros((membrosData ?? []) as Membro[])
      }
    }
    carregarListas()
  }, [])

  const carregar = useCallback(async () => {
    const { inicio, fim } = limitesDoMes(mes)

    let query = supabase
      .from('transacoes')
      .select(
        'id, data, descricao, valor, tipo, escopo, dono_id, categoria_id, subcategoria_id, conta_id, cartao_id, categorias(nome), subcategorias(nome), contas(nome, cor), cartoes_credito(nome, cor)'
      )

    // "Todos" junta familiar + meus pessoais; as duas abas isoladas filtram por escopo
    if (aba !== 'todos') query = query.eq('escopo', aba)

    query = query
      // Contas a pagar em aberto têm tela própria (/contas-pagar); aqui só o efetivado
      .eq('status', 'pago')
      // Transferências entre contas próprias têm tela própria e não são receita/despesa
      .is('transferencia_id', null)
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: false })

    if (categoriaFiltro) query = query.eq('categoria_id', categoriaFiltro)
    if (subcategoriaFiltro) query = query.eq('subcategoria_id', subcategoriaFiltro)
    if (contaFiltro) query = query.eq('conta_id', contaFiltro)
    if (isAdmin && membroFiltro) query = query.eq('dono_id', membroFiltro)

    const { data, error } = await query

    if (!error && data) setTransacoes(data as unknown as Transacao[])
    setCarregando(false)
  }, [aba, mes, categoriaFiltro, subcategoriaFiltro, contaFiltro, membroFiltro, isAdmin])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const subcategoriasFiltradas = useMemo(
    () => subcategorias.filter((s) => s.categoria_id === categoriaFiltro),
    [subcategorias, categoriaFiltro]
  )

  // Busca rápida: filtra em memória para resposta instantânea.
  // Ignora acentos, para que "dizimo" encontre "Dízimo".
  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim())
    if (!termo) return transacoes
    return transacoes.filter((t) =>
      normalizar(
        `${t.descricao} ${t.categorias?.nome ?? ''} ${t.subcategorias?.nome ?? ''}`
      ).includes(termo)
    )
  }, [transacoes, busca])

  function limparFiltros() {
    setBusca('')
    setCategoriaFiltro('')
    setSubcategoriaFiltro('')
    setContaFiltro('')
    setMembroFiltro('')
  }

  const temFiltro =
    !!busca || !!categoriaFiltro || !!subcategoriaFiltro || !!contaFiltro || !!membroFiltro

  const receitas = visiveis.filter((t) => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0)
  const despesas = visiveis.filter((t) => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0)
  const saldo = receitas - despesas

  // Agrupa por dia para exibição
  const porDia = useMemo(() => {
    const mapa = new Map<string, Transacao[]>()
    for (const t of visiveis) {
      if (!mapa.has(t.data)) mapa.set(t.data, [])
      mapa.get(t.data)!.push(t)
    }
    return Array.from(mapa.entries())
  }, [visiveis])

  const classeAba = (valor: string) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
      aba === valor
        ? 'bg-primaria text-white'
        : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
    }`

  function abrirEdicao(t: Transacao) {
    setEditandoId(t.id)
    setFormEdicao(formularioEdicaoDe(t))
    setMensagemEdicao('')
  }

  function cancelarEdicao() {
    setEditandoId(null)
    setFormEdicao(null)
  }

  async function sugerirAoSairDaDescricaoEdicao() {
    if (!formEdicao || formEdicao.categoria_id || !formEdicao.descricao.trim()) return
    const descricaoConsultada = formEdicao.descricao
    const sugestao = await sugerirCategoriaLancamento(
      descricaoConsultada,
      formEdicao.tipo,
      categorias,
      subcategorias
    )
    if (!sugestao) return
    // Só aplica se, enquanto a busca rodava, a categoria continuou vazia e a
    // descrição não mudou de novo — evita pisar numa escolha feita nesse meio-tempo
    setFormEdicao((atual) => {
      if (!atual || atual.categoria_id || atual.descricao !== descricaoConsultada) return atual
      return {
        ...atual,
        categoria_id: sugestao.categoriaId,
        subcategoria_id: sugestao.subcategoriaId || atual.subcategoria_id,
      }
    })
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault()
    if (!editandoId || !formEdicao) return
    setSalvandoEdicao(true)
    setMensagemEdicao('')

    const registro = {
      data: formEdicao.data,
      descricao: formEdicao.descricao,
      categoria_id: formEdicao.categoria_id || null,
      subcategoria_id: formEdicao.subcategoria_id || null,
      valor: parseFloat(formEdicao.valor),
      tipo: formEdicao.tipo,
      escopo: formEdicao.escopo,
      conta_id: formEdicao.pago_com === 'conta' ? formEdicao.conta_id || null : null,
      cartao_id: formEdicao.pago_com === 'cartao' ? formEdicao.cartao_id || null : null,
    }

    const { error } = await supabase.from('transacoes').update(registro).eq('id', editandoId)

    setSalvandoEdicao(false)
    if (error) {
      setMensagemEdicao('Erro ao salvar: ' + error.message)
      return
    }

    cancelarEdicao()
    carregar()
  }

  async function apagarEdicao() {
    if (!editandoId || !formEdicao) return
    if (!window.confirm(`Apagar o lançamento "${formEdicao.descricao}"?`)) return

    setApagandoEdicao(true)
    const { error } = await supabase.from('transacoes').delete().eq('id', editandoId)
    setApagandoEdicao(false)

    if (error) {
      setMensagemEdicao('Erro ao apagar: ' + error.message)
      return
    }

    cancelarEdicao()
    carregar()
  }

  const categoriasDaEdicao = formEdicao
    ? categorias.filter((c) => c.tipo === formEdicao.tipo)
    : []
  const subcategoriasDaEdicao = formEdicao
    ? subcategorias.filter((s) => s.categoria_id === formEdicao.categoria_id)
    : []

  const classeSeletorTipo = (ativo: boolean, valorTipo: string) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      ativo
        ? valorTipo === 'receita'
          ? 'bg-receita text-white'
          : 'bg-despesa text-white'
        : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
    }`

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Lançamentos"
        acao={
          <Link
            href="/lancamentos"
            className="inline-flex items-center gap-2 rounded-lg bg-primaria px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaria-escura"
          >
            <IconeMais className="h-4 w-4" />
            Novo lançamento
          </Link>
        }
      />

      {/* Seletor de mês */}
      <div className="cartao mb-4 flex items-center justify-between p-2">
        <button
          onClick={() => setMes(deslocarMes(mes, -1))}
          aria-label="Mês anterior"
          className="rounded-lg p-2 text-texto-suave transition-colors hover:bg-fundo"
        >
          <IconeSeta direcao="esquerda" />
        </button>
        <span className="text-sm font-semibold text-texto">{rotuloMesLongo(mes)}</span>
        <button
          onClick={() => setMes(deslocarMes(mes, 1))}
          aria-label="Próximo mês"
          className="rounded-lg p-2 text-texto-suave transition-colors hover:bg-fundo"
        >
          <IconeSeta direcao="direita" />
        </button>
      </div>

      {/* Abas de escopo */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setAba('todos')} className={classeAba('todos')}>
          Todos
        </button>
        <button onClick={() => setAba('familiar')} className={classeAba('familiar')}>
          Familiares
        </button>
        <button onClick={() => setAba('pessoal')} className={classeAba('pessoal')}>
          Meus pessoais
        </button>
      </div>

      {/* Busca + filtros */}
      <div className="cartao mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${classeInput} flex-1 min-w-48`}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por descrição ou categoria..."
            aria-label="Busca rápida"
          />
          <button
            onClick={() => setFiltrosVisiveis((v) => !v)}
            className="rounded-lg border border-borda px-4 py-2 text-sm font-medium text-texto transition-colors hover:bg-fundo"
          >
            {filtrosVisiveis ? 'Ocultar filtros' : 'Filtros'}
          </button>
          {temFiltro && (
            <button
              onClick={limparFiltros}
              className="text-sm font-medium text-primaria hover:underline"
            >
              Limpar
            </button>
          )}
        </div>

        {filtrosVisiveis && (
          <div className="mt-4 grid gap-3 border-t border-borda pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Categoria">
              <select
                className={classeInput}
                value={categoriaFiltro}
                onChange={(e) => {
                  setCategoriaFiltro(e.target.value)
                  setSubcategoriaFiltro('')
                }}
              >
                <option value="">Todas</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo rotulo="Subcategoria">
              <select
                className={classeInput}
                value={subcategoriaFiltro}
                onChange={(e) => setSubcategoriaFiltro(e.target.value)}
                disabled={!categoriaFiltro}
              >
                <option value="">Todas</option>
                {subcategoriasFiltradas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo rotulo="Conta">
              <select
                className={classeInput}
                value={contaFiltro}
                onChange={(e) => setContaFiltro(e.target.value)}
              >
                <option value="">Todas</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>

            {isAdmin && (
              <Campo rotulo="Membro">
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
              </Campo>
            )}
          </div>
        )}
      </div>

      {/* Resumo do período */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="cartao p-3">
          <p className="text-xs text-texto-suave">Receitas</p>
          <p className="whitespace-nowrap text-lg font-semibold text-receita">{moeda(receitas)}</p>
        </div>
        <div className="cartao p-3">
          <p className="text-xs text-texto-suave">Despesas</p>
          <p className="whitespace-nowrap text-lg font-semibold text-despesa">{moeda(despesas)}</p>
        </div>
        <div className="cartao p-3">
          <p className="text-xs text-texto-suave">Saldo</p>
          <p
            className={`whitespace-nowrap text-lg font-semibold ${
              saldo >= 0 ? 'text-receita' : 'text-despesa'
            }`}
          >
            {moeda(saldo)}
          </p>
        </div>
      </div>

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {!carregando && visiveis.length === 0 && (
        <EstadoVazio
          titulo="Nenhum lançamento encontrado"
          descricao={
            temFiltro
              ? 'Tente ajustar a busca ou os filtros.'
              : `Nenhum lançamento em ${rotuloMesLongo(mes).toLowerCase()}.`
          }
          acao={
            temFiltro ? (
              <BotaoPrimario onClick={limparFiltros}>Limpar filtros</BotaoPrimario>
            ) : undefined
          }
        />
      )}

      {!carregando && visiveis.length > 0 && (
        <div className="space-y-4">
          {porDia.map(([dia, itens]) => (
            <div key={dia} className="cartao overflow-hidden">
              <div className="border-b border-borda bg-fundo/60 px-4 py-2">
                <span className="text-xs font-semibold text-texto-suave">{dataBR(dia)}</span>
              </div>
              <ul className="divide-y divide-borda">
                {itens.map((t) => {
                  const receita = t.tipo === 'receita'
                  const origem = t.contas?.nome ?? t.cartoes_credito?.nome
                  const cor = t.contas?.cor ?? t.cartoes_credito?.cor
                  const podeEditar = isAdmin || t.dono_id === userId
                  const emEdicao = editandoId === t.id && formEdicao

                  if (emEdicao) {
                    return (
                      <li key={t.id} className="px-4 py-4">
                        <form onSubmit={salvarEdicao} className="space-y-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setFormEdicao({ ...formEdicao, tipo: 'despesa' })}
                              className={classeSeletorTipo(formEdicao.tipo === 'despesa', 'despesa')}
                            >
                              Despesa
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormEdicao({ ...formEdicao, tipo: 'receita' })}
                              className={classeSeletorTipo(formEdicao.tipo === 'receita', 'receita')}
                            >
                              Receita
                            </button>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <Campo rotulo="Data">
                              <input
                                type="date"
                                className={classeInput}
                                value={formEdicao.data}
                                onChange={(e) =>
                                  setFormEdicao({ ...formEdicao, data: e.target.value })
                                }
                                required
                              />
                            </Campo>
                            <Campo rotulo="Valor (R$)">
                              <input
                                type="number"
                                step="0.01"
                                className={classeInput}
                                value={formEdicao.valor}
                                onChange={(e) =>
                                  setFormEdicao({ ...formEdicao, valor: e.target.value })
                                }
                                required
                              />
                            </Campo>
                          </div>

                          <Campo rotulo="Descrição">
                            <input
                              className={classeInput}
                              value={formEdicao.descricao}
                              onChange={(e) =>
                                setFormEdicao({ ...formEdicao, descricao: e.target.value })
                              }
                              onBlur={sugerirAoSairDaDescricaoEdicao}
                              required
                            />
                          </Campo>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <Campo rotulo="Categoria">
                              <select
                                className={classeInput}
                                value={formEdicao.categoria_id}
                                onChange={(e) =>
                                  setFormEdicao({
                                    ...formEdicao,
                                    categoria_id: e.target.value,
                                    subcategoria_id: '',
                                  })
                                }
                              >
                                <option value="">Sem categoria</option>
                                {categoriasDaEdicao.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nome}
                                  </option>
                                ))}
                              </select>
                            </Campo>
                            <Campo rotulo="Subcategoria">
                              <select
                                className={classeInput}
                                value={formEdicao.subcategoria_id}
                                onChange={(e) =>
                                  setFormEdicao({ ...formEdicao, subcategoria_id: e.target.value })
                                }
                                disabled={!formEdicao.categoria_id}
                              >
                                <option value="">Nenhuma</option>
                                {subcategoriasDaEdicao.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.nome}
                                  </option>
                                ))}
                              </select>
                            </Campo>
                          </div>

                          <div>
                            <span className="mb-1.5 block text-sm font-medium text-texto">
                              Pago com
                            </span>
                            <div className="mb-2 flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setFormEdicao({ ...formEdicao, pago_com: 'conta' })
                                }
                                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                  formEdicao.pago_com === 'conta'
                                    ? 'bg-marinho text-white'
                                    : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
                                }`}
                              >
                                Conta
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setFormEdicao({ ...formEdicao, pago_com: 'cartao' })
                                }
                                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                  formEdicao.pago_com === 'cartao'
                                    ? 'bg-marinho text-white'
                                    : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
                                }`}
                              >
                                Cartão de crédito
                              </button>
                            </div>
                            {formEdicao.pago_com === 'conta' ? (
                              <select
                                className={classeInput}
                                value={formEdicao.conta_id}
                                onChange={(e) =>
                                  setFormEdicao({ ...formEdicao, conta_id: e.target.value })
                                }
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
                                value={formEdicao.cartao_id}
                                onChange={(e) =>
                                  setFormEdicao({ ...formEdicao, cartao_id: e.target.value })
                                }
                              >
                                <option value="">Selecione o cartão...</option>
                                {cartoes.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nome}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>

                          <Campo rotulo="Este lançamento é...">
                            <select
                              className={classeInput}
                              value={formEdicao.escopo}
                              onChange={(e) =>
                                setFormEdicao({ ...formEdicao, escopo: e.target.value })
                              }
                            >
                              <option value="familiar">Familiar (todos veem)</option>
                              <option value="pessoal">Pessoal (só eu vejo)</option>
                            </select>
                          </Campo>

                          <Mensagem texto={mensagemEdicao} />

                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borda pt-3">
                            <button
                              type="button"
                              onClick={apagarEdicao}
                              disabled={apagandoEdicao}
                              className="inline-flex items-center gap-2 rounded-lg border border-despesa/30 px-3 py-2 text-xs font-medium text-despesa transition-colors hover:bg-despesa/10 disabled:opacity-50"
                            >
                              <IconeLixeira className="h-4 w-4" />
                              {apagandoEdicao ? 'Apagando...' : 'Apagar'}
                            </button>
                            <div className="flex gap-2">
                              <BotaoSecundario type="button" onClick={cancelarEdicao}>
                                Cancelar
                              </BotaoSecundario>
                              <BotaoPrimario type="submit" disabled={salvandoEdicao}>
                                {salvandoEdicao ? 'Salvando...' : 'Salvar'}
                              </BotaoPrimario>
                            </div>
                          </div>
                        </form>
                      </li>
                    )
                  }

                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="h-8 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: cor ?? 'var(--borda)' }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-texto">{t.descricao}</p>
                          <p className="truncate text-xs text-texto-suave">
                            {t.categorias?.nome ?? 'Sem categoria'}
                            {t.subcategorias?.nome ? ` / ${t.subcategorias.nome}` : ''}
                            {origem ? ` · ${origem}` : ''}
                            {aba === 'todos'
                              ? ` · ${t.escopo === 'familiar' ? 'Familiar' : 'Pessoal'}`
                              : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={`whitespace-nowrap text-sm font-semibold ${
                            receita ? 'text-receita' : 'text-despesa'
                          }`}
                        >
                          {receita ? '+' : '−'} {moeda(t.valor)}
                        </span>
                        {podeEditar && (
                          <button
                            onClick={() => abrirEdicao(t)}
                            className="text-xs font-medium text-primaria hover:underline"
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Pagina>
  )
}
