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
import { IconeMais, IconeSeta } from '@/components/Icones'
import {
  BotaoPrimario,
  CabecalhoPagina,
  Campo,
  EstadoVazio,
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
  categorias: { nome: string } | null
  subcategorias: { nome: string } | null
  contas: { nome: string; cor: string | null } | null
  cartoes_credito: { nome: string; cor: string | null } | null
}

type Categoria = { id: string; nome: string }
type Subcategoria = { id: string; categoria_id: string; nome: string }
type Membro = { id: string; nome: string }
type Conta = { id: string; nome: string }

export default function TransacoesPage() {
  const [aba, setAba] = useState<'familiar' | 'pessoal'>('familiar')
  const [transacoes, setTransacoes] = useState<Transacao[]>([])
  const [carregando, setCarregando] = useState(true)

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [contas, setContas] = useState<Conta[]>([])
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

  useEffect(() => {
    async function carregarListas() {
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData.user?.id
      if (uid) setUserId(uid)

      const [{ data: cats }, { data: subs }, { data: cts }, { data: perfil }] = await Promise.all([
        supabase.from('categorias').select('id, nome').order('nome'),
        supabase.from('subcategorias').select('id, categoria_id, nome').order('nome'),
        supabase.from('contas').select('id, nome').order('nome'),
        uid
          ? supabase.from('perfis').select('papel').eq('id', uid).single()
          : Promise.resolve({ data: null }),
      ])

      setCategorias((cats ?? []) as Categoria[])
      setSubcategorias((subs ?? []) as Subcategoria[])
      setContas((cts ?? []) as Conta[])

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
        'id, data, descricao, valor, tipo, escopo, dono_id, categorias(nome), subcategorias(nome), contas(nome, cor), cartoes_credito(nome, cor)'
      )
      .eq('escopo', aba)
      // Contas a pagar em aberto têm tela própria (/contas-pagar); aqui só o efetivado
      .eq('status', 'pago')
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
      <div className="mb-4 flex gap-2">
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
                          <Link
                            href={`/lancamentos?id=${t.id}`}
                            className="text-xs font-medium text-primaria hover:underline"
                          >
                            Editar
                          </Link>
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
