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
import { buscarTudo } from '@/lib/buscarTudo'
import {
  chaveCompetencia,
  dataBR,
  deslocarMes,
  hojeISO,
  limitesCompetencia,
  moeda,
  rotuloMesCurto,
} from '@/lib/formato'
import {
  BotaoPrimario,
  BotaoSecundario,
  CabecalhoPagina,
  Campo,
  EstadoVazio,
  InputMoeda,
  Mensagem,
  Modal,
  Pagina,
  SeletorMultiplo,
  classeInput,
} from '@/components/ui'

type TransacaoResumo = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  escopo: string
  dono_id: string
  categoria_id: string | null
  subcategoria_id: string | null
  categorias: { nome: string } | null
  subcategorias: { nome: string } | null
  contas: { nome: string } | null
  cartoes_credito: { nome: string } | null
}

type Membro = { id: string; nome: string }
type Categoria = { id: string; nome: string; tipo: string }
type Subcategoria = { id: string; categoria_id: string; nome: string }
type Periodo = 'mes' | '3m' | '6m' | 'ano' | 'personalizado'
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

// Valores artificiais pro filtro — não são um id real de categorias/subcategorias,
// representam "esse lançamento não tem categoria/subcategoria definida"
const SEM_CATEGORIA_ID = '__sem_categoria__'
const SEM_SUBCATEGORIA_ID = '__sem_subcategoria__'
const COR_RECEITA = '#0e9f6e'
const COR_DESPESA = '#dc4c4c'

const ROTULO_PERIODO: Record<Exclude<Periodo, 'personalizado'>, string> = {
  mes: 'Este mês',
  '3m': '3 meses',
  '6m': '6 meses',
  ano: 'Este ano',
}

function chaveDoMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Meses de COMPETÊNCIA (chave "2026-06") cobertos pelo período — usado pra
 * agrupar a Evolução Mensal e pra definir o início da busca no banco. O
 * período "Entre datas" é a exceção: ali o usuário escolheu datas de
 * calendário exatas, então mantemos calendário puro em vez de competência.
 */
function mesesDoPeriodo(periodo: Periodo, dataInicioCustom: string, dataFimCustom: string): string[] {
  if (periodo === 'personalizado') {
    const [anoI, mesI] = dataInicioCustom.split('-').map(Number)
    const [anoF, mesF] = dataFimCustom.split('-').map(Number)
    const chaves: string[] = []
    let cursor = new Date(anoI, mesI - 1, 1)
    const fim = new Date(anoF, mesF - 1, 1)
    while (cursor <= fim) {
      chaves.push(chaveDoMes(cursor))
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
    return chaves
  }

  const referencia = chaveCompetencia(hojeISO())

  if (periodo === 'ano') {
    const anoAtual = Number(referencia.slice(0, 4))
    const mesAtualNum = Number(referencia.slice(5, 7))
    const chaves: string[] = []
    for (let m = 1; m <= mesAtualNum; m++) chaves.push(`${anoAtual}-${String(m).padStart(2, '0')}`)
    return chaves
  }

  const quantidade = periodo === 'mes' ? 1 : periodo === '3m' ? 3 : 6
  const chaves: string[] = []
  for (let i = quantidade - 1; i >= 0; i--) chaves.push(deslocarMes(referencia, -i))
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
  const [dataInicioCustom, setDataInicioCustom] = useState(() => `${hojeISO().slice(0, 7)}-01`)
  const [dataFimCustom, setDataFimCustom] = useState(() => hojeISO())
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
        supabase.from('categorias').select('id, nome, tipo').order('nome'),
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
        // "Sem subcategoria" não pertence a nenhuma categoria específica —
        // continua fazendo sentido pra qualquer categoria selecionada
        if (subId === SEM_SUBCATEGORIA_ID) return true
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

  const opcoesCategoriaFiltro = useMemo(
    () => [{ id: SEM_CATEGORIA_ID, nome: 'Sem categoria' }, ...categorias],
    [categorias]
  )
  const opcoesSubcategoriaFiltro = useMemo(
    () => [{ id: SEM_SUBCATEGORIA_ID, nome: 'Sem subcategoria' }, ...subcategoriasDisponiveis],
    [subcategoriasDisponiveis]
  )

  const mesesChaves = useMemo(
    () => mesesDoPeriodo(periodo, dataInicioCustom, dataFimCustom),
    [periodo, dataInicioCustom, dataFimCustom]
  )

  const carregar = useCallback(async () => {
    const dataInicio =
      periodo === 'personalizado' ? dataInicioCustom : limitesCompetencia(mesesChaves[0]).inicio
    const dataFim = periodo === 'personalizado' ? dataFimCustom : hojeISO()

    let query = supabase
      .from('transacoes')
      .select(
        'id, data, descricao, valor, tipo, escopo, dono_id, categoria_id, subcategoria_id, categorias(nome), subcategorias(nome), contas(nome), cartoes_credito!cartao_id(nome)'
      )
      // Só o que já foi efetivado: contas a pagar em aberto não são gasto realizado
      .eq('status', 'pago')
      // Transferência entre contas próprias não é receita nem despesa
      .is('transferencia_id', null)
      // O pagamento agregado de uma fatura de cartão é a mesma despesa das
      // compras já lançadas individualmente — contar as duas dobra o gasto
      .is('fatura_cartao_id', null)
      // Lançamento neutro (ex: adiantamento salarial já recebido fora do sistema)
      // existe só pro saldo bater, não é receita/despesa real
      .eq('neutro', false)
      .gte('data', dataInicio)
      .lte('data', dataFim)
      .order('data')

    if (escopoFiltro !== 'todos') query = query.eq('escopo', escopoFiltro)
    if (isAdmin && membroFiltro) query = query.eq('dono_id', membroFiltro)
    if (categoriasFiltro.length > 0) {
      const idsReais = categoriasFiltro.filter((id) => id !== SEM_CATEGORIA_ID)
      const semCategoria = categoriasFiltro.includes(SEM_CATEGORIA_ID)
      if (semCategoria && idsReais.length > 0) {
        query = query.or(`categoria_id.is.null,categoria_id.in.(${idsReais.join(',')})`)
      } else if (semCategoria) {
        query = query.is('categoria_id', null)
      } else {
        query = query.in('categoria_id', idsReais)
      }
    }
    if (subcategoriasFiltro.length > 0) {
      const idsReais = subcategoriasFiltro.filter((id) => id !== SEM_SUBCATEGORIA_ID)
      const semSubcategoria = subcategoriasFiltro.includes(SEM_SUBCATEGORIA_ID)
      if (semSubcategoria && idsReais.length > 0) {
        query = query.or(`subcategoria_id.is.null,subcategoria_id.in.(${idsReais.join(',')})`)
      } else if (semSubcategoria) {
        query = query.is('subcategoria_id', null)
      } else {
        query = query.in('subcategoria_id', idsReais)
      }
    }

    // Relatórios pode cobrir 12 meses ou um intervalo livre; sem paginar, o
    // teto do PostgREST cortaria o período silenciosamente e os gráficos
    // mostrariam menos do que existe.
    const { data, error } = await buscarTudo((de, ate) => query.range(de, ate))

    if (!error && data) setTransacoes(data as unknown as TransacaoResumo[])
    setCarregando(false)
  }, [
    mesesChaves,
    periodo,
    dataInicioCustom,
    dataFimCustom,
    escopoFiltro,
    membroFiltro,
    isAdmin,
    categoriasFiltro,
    subcategoriasFiltro,
  ])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  // ---------- Editar lançamento sem sair da tela de Relatórios ----------
  const [editando, setEditando] = useState<TransacaoResumo | null>(null)
  const [formEdicao, setFormEdicao] = useState({
    descricao: '',
    valor: '',
    data: '',
    categoria_id: '',
    subcategoria_id: '',
    escopo: 'pessoal',
  })
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [mensagemEdicao, setMensagemEdicao] = useState('')

  function abrirEdicao(t: TransacaoResumo) {
    setEditando(t)
    setFormEdicao({
      descricao: t.descricao,
      valor: String(t.valor),
      data: t.data,
      categoria_id: t.categoria_id ?? '',
      subcategoria_id: t.subcategoria_id ?? '',
      escopo: t.escopo,
    })
    setMensagemEdicao('')
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault()
    if (!editando) return
    setSalvandoEdicao(true)
    setMensagemEdicao('')

    const { error } = await supabase
      .from('transacoes')
      .update({
        descricao: formEdicao.descricao,
        valor: parseFloat(formEdicao.valor),
        data: formEdicao.data,
        categoria_id: formEdicao.categoria_id || null,
        subcategoria_id: formEdicao.subcategoria_id || null,
        escopo: formEdicao.escopo,
      })
      .eq('id', editando.id)

    setSalvandoEdicao(false)
    if (error) {
      setMensagemEdicao('Erro ao salvar: ' + error.message)
      return
    }
    setEditando(null)
    carregar()
  }

  const transacoesOrdenadas = useMemo(
    () => [...transacoes].sort((a, b) => b.data.localeCompare(a.data)),
    [transacoes]
  )

  const evolucaoMensal = useMemo(() => {
    const porMes = new Map(mesesChaves.map((chave) => [chave, { receitas: 0, despesas: 0 }]))
    // "Entre datas" é calendário puro (o usuário escolheu as datas); os demais
    // períodos usam mês de competência (ver chaveCompetencia)
    for (const t of transacoes) {
      const chaveDoLancamento = periodo === 'personalizado' ? t.data.slice(0, 7) : chaveCompetencia(t.data)
      const bucket = porMes.get(chaveDoLancamento)
      if (!bucket) continue
      if (t.tipo === 'receita') bucket.receitas += Number(t.valor)
      else bucket.despesas += Number(t.valor)
    }
    return mesesChaves.map((chave) => ({
      mes: rotuloMesCurto(chave),
      Receitas: porMes.get(chave)!.receitas,
      Despesas: porMes.get(chave)!.despesas,
    }))
  }, [transacoes, mesesChaves, periodo])

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
            {(Object.keys(ROTULO_PERIODO) as Exclude<Periodo, 'personalizado'>[]).map((p) => (
              <button key={p} onClick={() => setPeriodo(p)} className={classeBotao(periodo === p)}>
                {ROTULO_PERIODO[p]}
              </button>
            ))}
            <button
              onClick={() => setPeriodo('personalizado')}
              className={classeBotao(periodo === 'personalizado')}
            >
              Entre datas
            </button>
          </div>

          {periodo === 'personalizado' && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Campo rotulo="De">
                <input
                  type="date"
                  className={classeInput}
                  value={dataInicioCustom}
                  max={dataFimCustom}
                  onChange={(e) => setDataInicioCustom(e.target.value)}
                />
              </Campo>
              <Campo rotulo="Até">
                <input
                  type="date"
                  className={classeInput}
                  value={dataFimCustom}
                  min={dataInicioCustom}
                  onChange={(e) => setDataFimCustom(e.target.value)}
                />
              </Campo>
            </div>
          )}
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
            opcoes={opcoesCategoriaFiltro}
            selecionados={categoriasFiltro}
            onChange={atualizarCategoriasFiltro}
          />
          <SeletorMultiplo
            rotulo="Subcategoria"
            opcoes={opcoesSubcategoriaFiltro}
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

          {/* Lançamentos do filtro de categoria/subcategoria — pra investigar e corrigir
              sem precisar ir pra tela de Lançamentos */}
          {(categoriasFiltro.length > 0 || subcategoriasFiltro.length > 0) && (
            <section className="cartao mb-5 overflow-hidden">
              <div className="border-b border-borda p-4">
                <h2 className="text-sm font-semibold text-texto">Lançamentos do período</h2>
                <p className="text-xs text-texto-suave">
                  {transacoesOrdenadas.length} lançamento
                  {transacoesOrdenadas.length === 1 ? '' : 's'} nas categorias selecionadas
                </p>
              </div>
              <ul className="max-h-[480px] divide-y divide-borda overflow-y-auto">
                {transacoesOrdenadas.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-texto">{t.descricao}</p>
                      <p className="truncate text-xs text-texto-suave">
                        {dataBR(t.data)} · {t.categorias?.nome ?? 'Sem categoria'}
                        {t.subcategorias?.nome ? ` / ${t.subcategorias.nome}` : ''}
                        {t.contas?.nome || t.cartoes_credito?.nome
                          ? ` · ${t.contas?.nome ?? t.cartoes_credito?.nome}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span
                        className={`whitespace-nowrap text-sm font-semibold ${
                          t.tipo === 'receita' ? 'text-receita' : 'text-despesa'
                        }`}
                      >
                        {t.tipo === 'receita' ? '+' : '−'} {moeda(t.valor)}
                      </span>
                      <button
                        onClick={() => abrirEdicao(t)}
                        className="whitespace-nowrap text-xs font-medium text-primaria hover:underline"
                      >
                        Editar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

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

      <Modal aberto={!!editando} titulo="Editar lançamento" onFechar={() => setEditando(null)}>
        {editando && (
          <form onSubmit={salvarEdicao} className="space-y-4">
            <Campo rotulo="Descrição">
              <input
                className={classeInput}
                value={formEdicao.descricao}
                onChange={(e) => setFormEdicao({ ...formEdicao, descricao: e.target.value })}
                required
              />
            </Campo>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Data">
                <input
                  type="date"
                  className={classeInput}
                  value={formEdicao.data}
                  onChange={(e) => setFormEdicao({ ...formEdicao, data: e.target.value })}
                  required
                />
              </Campo>
              <Campo rotulo="Valor (R$)">
                <InputMoeda
                  valor={formEdicao.valor}
                  onChange={(v) => setFormEdicao({ ...formEdicao, valor: v })}
                  required
                />
              </Campo>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Categoria">
                <select
                  className={classeInput}
                  value={formEdicao.categoria_id}
                  onChange={(e) =>
                    setFormEdicao({ ...formEdicao, categoria_id: e.target.value, subcategoria_id: '' })
                  }
                >
                  <option value="">Sem categoria</option>
                  {categorias
                    .filter((c) => c.tipo === editando.tipo)
                    .map((c) => (
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
                  onChange={(e) => setFormEdicao({ ...formEdicao, subcategoria_id: e.target.value })}
                  disabled={!formEdicao.categoria_id}
                >
                  <option value="">Nenhuma</option>
                  {subcategorias
                    .filter((s) => s.categoria_id === formEdicao.categoria_id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                </select>
              </Campo>
            </div>

            <Campo rotulo="Este lançamento é...">
              <select
                className={classeInput}
                value={formEdicao.escopo}
                onChange={(e) => setFormEdicao({ ...formEdicao, escopo: e.target.value })}
              >
                <option value="familiar">Familiar (todos veem)</option>
                <option value="pessoal">Pessoal (só eu vejo)</option>
              </select>
            </Campo>

            <Mensagem texto={mensagemEdicao} />

            <div className="flex justify-end gap-2 pt-2">
              <BotaoSecundario type="button" onClick={() => setEditando(null)}>
                Cancelar
              </BotaoSecundario>
              <BotaoPrimario type="submit" disabled={salvandoEdicao}>
                {salvandoEdicao ? 'Salvando...' : 'Salvar'}
              </BotaoPrimario>
            </div>
          </form>
        )}
      </Modal>
    </Pagina>
  )
}
