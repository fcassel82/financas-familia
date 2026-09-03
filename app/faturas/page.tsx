'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabaseClient'
import {
  chaveMes,
  dataBR,
  hojeISO,
  moeda,
  rotuloMesLongo,
  situacaoVencimento,
  textoVencimento,
} from '@/lib/formato'
import { cicloDaCompetencia, competenciaDaCompra, deslocarCompetencia } from '@/lib/faturaCartao'
import {
  conciliarComExistentes,
  decodificarOfx,
  parsearOfx,
  type ExistenteParaConciliar,
  type ItemConciliacao,
  type LancamentoOfx,
} from '@/lib/parseOfx'
import { linhasCsvParaLancamentos, type ModoValorCsv } from '@/lib/parseCsvExtrato'
import { IconeCartao, IconeImportar } from '@/components/Icones'
import { ImportarCsvModal } from '@/components/ImportarCsvModal'
import {
  BotaoPrimario,
  BotaoSecundario,
  CabecalhoPagina,
  Campo,
  EstadoVazio,
  Mensagem,
  Modal,
  Pagina,
  classeInput,
} from '@/components/ui'

type Cartao = {
  id: string
  nome: string
  cor: string | null
  dia_fechamento: number | null
  dia_vencimento: number | null
  conta_pagamento_id: string | null
  escopo: string
  dono_id: string
}

type Conta = { id: string; nome: string }
type Membro = { id: string; nome: string }
type Categoria = { id: string; nome: string; tipo: string }
type Subcategoria = { id: string; categoria_id: string; nome: string }

type Compra = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  cartao_id: string
  parcela_numero: number | null
  parcela_total: number | null
}

type PendenciaFatura = {
  id: string
  fatura_cartao_id: string
  fatura_competencia: string
  valor: number
  status: string
  data: string
  data_vencimento: string
  conta_id: string | null
}

type Fatura = {
  competencia: string
  vencimento: string
  fimCiclo: string
  itens: Compra[]
  totalCompras: number
  pendencia: PendenciaFatura | null
}

const JANELA_PASSADO = 2
const JANELA_FUTURO = 5

/** Total líquido de um grupo de compras (despesas somam, estornos/receitas subtraem) */
function totalDoGrupo(itens: Compra[]): number {
  return itens.reduce((s, i) => s + (i.tipo === 'despesa' ? Number(i.valor) : -Number(i.valor)), 0)
}

function montarFaturas(
  cartao: Cartao,
  compras: Compra[],
  pendencias: PendenciaFatura[]
): Fatura[] {
  const fechamento = cartao.dia_fechamento
  const vencimento = cartao.dia_vencimento
  if (!fechamento || !vencimento) return []

  const competenciaAtual = competenciaDaCompra(hojeISO(), fechamento, vencimento)

  const porCompetencia = new Map<string, Compra[]>()
  for (const c of compras) {
    if (c.cartao_id !== cartao.id) continue
    const comp = competenciaDaCompra(c.data, fechamento, vencimento)
    if (!porCompetencia.has(comp)) porCompetencia.set(comp, [])
    porCompetencia.get(comp)!.push(c)
  }

  const faturas: Fatura[] = []
  for (let i = -JANELA_PASSADO; i <= JANELA_FUTURO; i++) {
    const competencia = deslocarCompetencia(competenciaAtual, i)
    const ciclo = cicloDaCompetencia(competencia, fechamento, vencimento)
    const itens = (porCompetencia.get(competencia) ?? []).sort((a, b) => a.data.localeCompare(b.data))
    const pendencia =
      pendencias.find(
        (p) => p.fatura_cartao_id === cartao.id && p.fatura_competencia.slice(0, 7) === competencia
      ) ?? null

    if (itens.length === 0 && !pendencia && i < 0) continue

    faturas.push({
      competencia,
      vencimento: ciclo.vencimento,
      fimCiclo: ciclo.fimCiclo,
      itens,
      totalCompras: totalDoGrupo(itens),
      pendencia,
    })
  }
  return faturas
}

function BadgeStatus({ fatura }: { fatura: Fatura }) {
  if (fatura.pendencia?.status === 'pago') {
    return (
      <span className="whitespace-nowrap rounded bg-receita/10 px-2 py-1 text-xs font-medium text-receita">
        Paga em {dataBR(fatura.pendencia.data)}
      </span>
    )
  }
  if (fatura.pendencia?.status === 'pendente') {
    const s = situacaoVencimento(fatura.pendencia.data_vencimento)
    const cor = s === 'vencida' ? 'text-despesa' : s === 'futura' ? 'text-texto-suave' : 'text-alerta'
    return (
      <span className={`whitespace-nowrap text-xs font-medium ${cor}`}>
        {textoVencimento(fatura.pendencia.data_vencimento)}
      </span>
    )
  }
  if (fatura.fimCiclo <= hojeISO()) {
    return fatura.totalCompras > 0 ? (
      <span className="whitespace-nowrap text-xs font-medium text-texto-suave">Fechada</span>
    ) : (
      <span className="whitespace-nowrap text-xs text-texto-suave">Sem gastos</span>
    )
  }
  return (
    <span className="whitespace-nowrap rounded bg-fundo px-2 py-1 text-xs font-medium text-texto-suave">
      Prévia · fecha {dataBR(fatura.fimCiclo)}
    </span>
  )
}

const FORM_LANCAMENTO_VAZIO = { descricao: '', categoria_id: '', subcategoria_id: '', escopo: 'pessoal' }

export default function FaturasPage() {
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [compras, setCompras] = useState<Compra[]>([])
  const [pendencias, setPendencias] = useState<PendenciaFatura[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const [userId, setUserId] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [membros, setMembros] = useState<Membro[]>([])
  const [membroFiltro, setMembroFiltro] = useState('')
  const [mensagem, setMensagem] = useState('')

  const sincronizadoRef = useRef(false)

  const carregar = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    const uid = userData.user?.id ?? ''
    setUserId(uid)

    const [{ data: cartoesData }, { data: contasData }, { data: cats }, { data: subs }, { data: perfil }] =
      await Promise.all([
        supabase.from('cartoes_credito').select('*').eq('ativo', true).order('nome'),
        supabase.from('contas').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('categorias').select('id, nome, tipo').order('nome'),
        supabase.from('subcategorias').select('id, categoria_id, nome').order('nome'),
        uid ? supabase.from('perfis').select('papel').eq('id', uid).single() : Promise.resolve({ data: null }),
      ])

    setCartoes((cartoesData ?? []) as Cartao[])
    setContas((contasData ?? []) as Conta[])
    setCategorias((cats ?? []) as Categoria[])
    setSubcategorias((subs ?? []) as Subcategoria[])

    const admin = perfil?.papel === 'admin'
    setIsAdmin(admin)
    if (admin) {
      const { data: membrosData } = await supabase.from('perfis').select('id, nome').order('nome')
      if (membrosData) setMembros(membrosData)
    }

    const [{ data: comprasData }, { data: pendenciasData }] = await Promise.all([
      supabase
        .from('transacoes')
        .select('id, data, descricao, valor, tipo, cartao_id, parcela_numero, parcela_total')
        .eq('status', 'pago')
        .not('cartao_id', 'is', null),
      supabase
        .from('transacoes')
        .select('id, fatura_cartao_id, fatura_competencia, valor, status, data, data_vencimento, conta_id')
        .not('fatura_cartao_id', 'is', null),
    ])

    setCompras((comprasData ?? []) as Compra[])
    setPendencias((pendenciasData ?? []) as PendenciaFatura[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const cartoesVisiveis = membroFiltro ? cartoes.filter((c) => c.dono_id === membroFiltro) : cartoes

  const faturasPorCartao = useMemo(() => {
    const mapa = new Map<string, Fatura[]>()
    for (const cartao of cartoes) {
      mapa.set(cartao.id, montarFaturas(cartao, compras, pendencias))
    }
    return mapa
  }, [cartoes, compras, pendencias])

  /**
   * Gera automaticamente a cobrança (lançamento pendente) de faturas já
   * fechadas que ainda não têm uma. Só quem é dono do cartão (ou admin) tem
   * permissão de gravar isso — membros veem os totais calculados na hora,
   * mesmo sem poder gerar a cobrança.
   */
  useEffect(() => {
    if (carregando || sincronizadoRef.current || !userId) return
    sincronizadoRef.current = true

    async function sincronizar() {
      const hoje = hojeISO()
      const pendentes: { insert: object[]; updates: { id: string; valor: number; data_vencimento: string }[] } = {
        insert: [],
        updates: [],
      }

      for (const cartao of cartoes) {
        if (cartao.dono_id !== userId && !isAdmin) continue
        const faturas = faturasPorCartao.get(cartao.id) ?? []
        for (const f of faturas) {
          if (f.fimCiclo > hoje) continue
          if (!f.pendencia && f.totalCompras > 0) {
            pendentes.insert.push({
              // 'data' guarda o vencimento enquanto está pendente, igual às demais
              // contas a pagar; ao marcar como paga passa a ser a data do pagamento.
              data: f.vencimento,
              descricao: `Fatura ${cartao.nome} — ${rotuloMesLongo(f.competencia)}`,
              valor: f.totalCompras,
              tipo: 'despesa',
              escopo: cartao.escopo,
              status: 'pendente',
              data_vencimento: f.vencimento,
              fatura_cartao_id: cartao.id,
              fatura_competencia: `${f.competencia}-01`,
              dono_id: cartao.dono_id,
              lancado_por: userId,
            })
          } else if (
            f.pendencia &&
            f.pendencia.status === 'pendente' &&
            Math.abs(f.pendencia.valor - f.totalCompras) > 0.005
          ) {
            pendentes.updates.push({
              id: f.pendencia.id,
              valor: f.totalCompras,
              data_vencimento: f.vencimento,
            })
          }
        }
      }

      let precisaRecarregar = false
      if (pendentes.insert.length > 0) {
        const { error } = await supabase.from('transacoes').insert(pendentes.insert)
        if (!error) precisaRecarregar = true
      }
      for (const u of pendentes.updates) {
        const { error } = await supabase
          .from('transacoes')
          .update({ valor: u.valor, data_vencimento: u.data_vencimento })
          .eq('id', u.id)
        if (!error) precisaRecarregar = true
      }
      if (precisaRecarregar) carregar()
    }
    sincronizar()
  }, [carregando, cartoes, faturasPorCartao, userId, isAdmin, carregar])

  // ---------- Comprometido nos próximos meses (todos os cartões visíveis) ----------
  const comprometidoPorMes = useMemo(() => {
    const mesAtual = chaveMes(new Date())
    const meses: { competencia: string; total: number }[] = []
    for (let i = 0; i <= JANELA_FUTURO; i++) {
      const competencia = deslocarCompetencia(mesAtual, i)
      let total = 0
      for (const cartao of cartoesVisiveis) {
        const f = (faturasPorCartao.get(cartao.id) ?? []).find((x) => x.competencia === competencia)
        if (!f) continue
        if (f.pendencia?.status === 'pago') continue
        total += f.pendencia ? f.pendencia.valor : f.totalCompras
      }
      meses.push({ competencia, total })
    }
    return meses
  }, [cartoesVisiveis, faturasPorCartao])

  // ---------- Marcar fatura como paga ----------
  const [pagando, setPagando] = useState<{ cartao: Cartao; fatura: Fatura } | null>(null)
  const [formPagar, setFormPagar] = useState({ data: hojeISO(), valor: '', conta_id: '' })
  const [processandoPagamento, setProcessandoPagamento] = useState(false)

  function abrirPagar(cartao: Cartao, fatura: Fatura) {
    setPagando({ cartao, fatura })
    setFormPagar({
      data: hojeISO(),
      valor: String(fatura.pendencia?.valor ?? fatura.totalCompras),
      conta_id: cartao.conta_pagamento_id ?? contas[0]?.id ?? '',
    })
    setMensagem('')
  }

  async function confirmarPagamento(e: React.FormEvent) {
    e.preventDefault()
    if (!pagando?.fatura.pendencia) return
    setProcessandoPagamento(true)
    setMensagem('')

    const { error } = await supabase
      .from('transacoes')
      .update({
        status: 'pago',
        data: formPagar.data,
        valor: parseFloat(formPagar.valor),
        conta_id: formPagar.conta_id || null,
      })
      .eq('id', pagando.fatura.pendencia.id)

    setProcessandoPagamento(false)
    if (error) {
      setMensagem('Erro ao registrar pagamento: ' + error.message)
      return
    }
    setPagando(null)
    carregar()
  }

  // ---------- Importar fatura por OFX ou CSV (conciliação) ----------
  const [cartaoOfx, setCartaoOfx] = useState<string | null>(null)
  const [itensConciliacao, setItensConciliacao] = useState<ItemConciliacao[] | null>(null)
  const [importando, setImportando] = useState(false)
  const [linhaAberta, setLinhaAberta] = useState<string | null>(null)
  const [formLancamento, setFormLancamento] = useState(FORM_LANCAMENTO_VAZIO)
  const [salvandoLinha, setSalvandoLinha] = useState(false)
  const inputArquivoRef = useRef<HTMLInputElement>(null)
  const [csvBruto, setCsvBruto] = useState<{ linhas: Record<string, string>[]; colunas: string[] } | null>(
    null
  )

  /** Casa os lançamentos importados (de OFX ou CSV) com o que já está pago neste cartão */
  async function conciliarImportados(cartaoId: string, itensImportados: LancamentoOfx[]) {
    if (itensImportados.length === 0) {
      setItensConciliacao(null)
      setMensagem('Nenhum lançamento encontrado neste arquivo.')
      return
    }

    const datas = itensImportados.map((i) => i.data).sort()
    const { data: existentes, error } = await supabase
      .from('transacoes')
      .select('id, data, valor, tipo')
      .eq('cartao_id', cartaoId)
      .eq('status', 'pago')
      .gte('data', datas[0])
      .lte('data', datas[datas.length - 1])

    if (error) {
      setMensagem('Erro ao conciliar: ' + error.message)
      return
    }

    const itens = conciliarComExistentes(itensImportados, (existentes ?? []) as ExistenteParaConciliar[])
    itens.sort((a, b) => a.data.localeCompare(b.data))
    setItensConciliacao(itens)
  }

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>, cartao: Cartao) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return

    setImportando(true)
    setMensagem('')
    setCartaoOfx(cartao.id)
    setLinhaAberta(null)

    const nome = arquivo.name.toLowerCase()

    if (nome.endsWith('.csv')) {
      Papa.parse<Record<string, string>>(arquivo, {
        header: true,
        skipEmptyLines: true,
        complete: (resultado) => {
          setCsvBruto({ linhas: resultado.data, colunas: resultado.meta.fields || [] })
          setImportando(false)
        },
        error: () => {
          setMensagem('Não foi possível ler este arquivo CSV.')
          setImportando(false)
        },
      })
      return
    }

    try {
      const buffer = await arquivo.arrayBuffer()
      const itensOfx = parsearOfx(decodificarOfx(buffer))
      await conciliarImportados(cartao.id, itensOfx)
    } catch (err) {
      console.error('Falha ao ler fatura:', err)
      setMensagem('Não foi possível ler este arquivo. Confira se é um OFX válido.')
    }
    setImportando(false)
  }

  async function confirmarMapeamentoCsv(
    colData: string,
    colDescricao: string,
    colValor: string,
    modo: ModoValorCsv
  ) {
    if (!csvBruto || !cartaoOfx) return
    const itensCsv = linhasCsvParaLancamentos(csvBruto.linhas, { colData, colDescricao, colValor, modo })
    setCsvBruto(null)
    setImportando(true)
    await conciliarImportados(cartaoOfx, itensCsv)
    setImportando(false)
  }

  function abrirSalvarLinha(item: ItemConciliacao) {
    setLinhaAberta(item.chave)
    setFormLancamento({ ...FORM_LANCAMENTO_VAZIO, descricao: item.descricao })
  }

  async function salvarLinhaComoCompra(item: ItemConciliacao) {
    if (!cartaoOfx) return
    setSalvandoLinha(true)
    setMensagem('')

    const { error, data } = await supabase
      .from('transacoes')
      .insert({
        data: item.data,
        descricao: formLancamento.descricao,
        categoria_id: formLancamento.categoria_id || null,
        subcategoria_id: formLancamento.subcategoria_id || null,
        valor: item.valor,
        tipo: item.tipo,
        escopo: formLancamento.escopo,
        cartao_id: cartaoOfx,
        status: 'pago',
        dono_id: userId,
        lancado_por: userId,
      })
      .select('id')
      .single()

    setSalvandoLinha(false)
    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }

    setItensConciliacao((atual) =>
      (atual ?? []).map((i) => (i.chave === item.chave ? { ...i, transacaoId: data.id } : i))
    )
    setLinhaAberta(null)
    setFormLancamento(FORM_LANCAMENTO_VAZIO)
    carregar()
  }

  const categoriasDaLinha = (tipoLinha: string) => categorias.filter((c) => c.tipo === tipoLinha)
  const subcategoriasDaLinha = subcategorias.filter((s) => s.categoria_id === formLancamento.categoria_id)
  const cartaoDaConciliacao = cartoes.find((c) => c.id === cartaoOfx)
  const totalConciliado = itensConciliacao?.filter((i) => i.transacaoId).length ?? 0

  const maiorComprometido = Math.max(1, ...comprometidoPorMes.map((m) => m.total))

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Faturas de Cartão"
        descricao="Parcelas em aberto, quando cada fatura vence e o que já está comprometido nos próximos meses."
      />

      {isAdmin && membros.length > 0 && (
        <div className="cartao mb-5 p-4">
          <Campo rotulo="Exibir faturas de">
            <select
              className={classeInput}
              value={membroFiltro}
              onChange={(e) => setMembroFiltro(e.target.value)}
            >
              <option value="">Todos os membros</option>
              {membros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      )}

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {!carregando && cartoes.length === 0 && (
        <EstadoVazio
          titulo="Nenhum cartão cadastrado"
          descricao="Cadastre um cartão de crédito com dia de fechamento e vencimento para acompanhar as faturas aqui."
          acao={
            <a
              href="/cartoes"
              className="inline-flex items-center gap-2 rounded-lg bg-primaria px-4 py-2.5 text-sm font-semibold text-white hover:bg-primaria-escura"
            >
              Cadastrar cartão
            </a>
          }
        />
      )}

      {!carregando && cartoesVisiveis.length > 0 && (
        <>
          {/* Comprometido nos próximos meses */}
          {comprometidoPorMes.length > 0 && (
            <section className="cartao mb-6 p-4">
              <h2 className="mb-3 text-sm font-semibold text-texto">
                Comprometido nos próximos meses
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {comprometidoPorMes.map((m) => (
                  <div key={m.competencia} className="rounded-lg bg-fundo p-3">
                    <p className="text-xs text-texto-suave">{rotuloMesLongo(m.competencia)}</p>
                    <p className="mt-1 whitespace-nowrap text-sm font-semibold text-texto">
                      {moeda(m.total)}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-borda">
                      <div
                        className="h-full rounded-full bg-primaria"
                        style={{ width: `${(m.total / maiorComprometido) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <Mensagem texto={mensagem} />

          {/* Conciliação de fatura importada por OFX */}
          {itensConciliacao && cartaoDaConciliacao && (
            <div className="cartao mb-6 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borda bg-fundo/60 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-texto">
                    Conciliação da fatura importada — {cartaoDaConciliacao.nome}
                  </p>
                  <p className="text-xs text-texto-suave">
                    {totalConciliado} de {itensConciliacao.length} lançamentos já conciliados
                  </p>
                </div>
                <button
                  onClick={() => {
                    setItensConciliacao(null)
                    setCartaoOfx(null)
                  }}
                  className="text-xs font-medium text-texto-suave hover:underline"
                >
                  Fechar
                </button>
              </div>

              <ul className="divide-y divide-borda">
                {itensConciliacao.map((item) => {
                  const receita = item.tipo === 'receita'
                  const conciliado = !!item.transacaoId
                  const aberta = linhaAberta === item.chave

                  if (aberta) {
                    return (
                      <li key={item.chave} className="px-4 py-4">
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm text-texto-suave">
                            {dataBR(item.data)} ·{' '}
                            <span className={receita ? 'text-receita' : 'text-despesa'}>
                              {receita ? '+' : '−'} {moeda(item.valor)}
                            </span>
                          </p>
                        </div>
                        <div className="space-y-3">
                          <Campo rotulo="Descrição">
                            <input
                              className={classeInput}
                              value={formLancamento.descricao}
                              onChange={(e) =>
                                setFormLancamento({ ...formLancamento, descricao: e.target.value })
                              }
                              required
                            />
                          </Campo>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <Campo rotulo="Categoria">
                              <select
                                className={classeInput}
                                value={formLancamento.categoria_id}
                                onChange={(e) =>
                                  setFormLancamento({
                                    ...formLancamento,
                                    categoria_id: e.target.value,
                                    subcategoria_id: '',
                                  })
                                }
                              >
                                <option value="">Sem categoria</option>
                                {categoriasDaLinha(item.tipo).map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nome}
                                  </option>
                                ))}
                              </select>
                            </Campo>
                            <Campo rotulo="Subcategoria">
                              <select
                                className={classeInput}
                                value={formLancamento.subcategoria_id}
                                onChange={(e) =>
                                  setFormLancamento({ ...formLancamento, subcategoria_id: e.target.value })
                                }
                                disabled={!formLancamento.categoria_id}
                              >
                                <option value="">Nenhuma</option>
                                {subcategoriasDaLinha.map((s) => (
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
                              value={formLancamento.escopo}
                              onChange={(e) => setFormLancamento({ ...formLancamento, escopo: e.target.value })}
                            >
                              <option value="familiar">Familiar (todos veem)</option>
                              <option value="pessoal">Pessoal (só eu vejo)</option>
                            </select>
                          </Campo>

                          <div className="flex justify-end gap-2 border-t border-borda pt-3">
                            <BotaoSecundario type="button" onClick={() => setLinhaAberta(null)}>
                              Cancelar
                            </BotaoSecundario>
                            <BotaoPrimario
                              type="button"
                              disabled={salvandoLinha}
                              onClick={() => salvarLinhaComoCompra(item)}
                            >
                              {salvandoLinha ? 'Salvando...' : 'Salvar lançamento'}
                            </BotaoPrimario>
                          </div>
                        </div>
                      </li>
                    )
                  }

                  return (
                    <li key={item.chave} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-texto">{item.descricao}</p>
                        <p className="text-xs text-texto-suave">{dataBR(item.data)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={`whitespace-nowrap text-sm font-semibold ${
                            receita ? 'text-receita' : 'text-despesa'
                          }`}
                        >
                          {receita ? '+' : '−'} {moeda(item.valor)}
                        </span>
                        {conciliado ? (
                          <span className="whitespace-nowrap rounded bg-primaria/10 px-2 py-1 text-xs font-medium text-primaria">
                            Conciliado
                          </span>
                        ) : (
                          <button
                            onClick={() => abrirSalvarLinha(item)}
                            className="whitespace-nowrap text-xs font-medium text-alerta hover:underline"
                          >
                            Salvar como lançamento
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Faturas por cartão */}
          <div className="space-y-6">
            {cartoesVisiveis.map((cartao) => {
              const faturas = faturasPorCartao.get(cartao.id) ?? []
              const semConfiguracao = !cartao.dia_fechamento || !cartao.dia_vencimento

              return (
                <section key={cartao.id} className="cartao overflow-hidden">
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 p-4 text-white"
                    style={{ backgroundColor: cartao.cor ?? '#1c3a52' }}
                  >
                    <div className="flex items-center gap-3">
                      <IconeCartao className="h-5 w-5" />
                      <p className="font-medium">{cartao.nome}</p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/25">
                      <IconeImportar className="h-3.5 w-3.5" />
                      {importando && cartaoOfx === cartao.id ? 'Lendo...' : 'Importar fatura (OFX/CSV)'}
                      <input
                        ref={inputArquivoRef}
                        type="file"
                        accept=".ofx,.csv"
                        className="hidden"
                        disabled={importando}
                        onChange={(e) => handleArquivo(e, cartao)}
                      />
                    </label>
                  </div>

                  {semConfiguracao ? (
                    <div className="p-4">
                      <p className="text-sm text-texto-suave">
                        Preencha o dia de fechamento e de vencimento deste cartão em{' '}
                        <a href="/cartoes" className="font-medium text-primaria hover:underline">
                          Cartões
                        </a>{' '}
                        para ver as faturas.
                      </p>
                    </div>
                  ) : faturas.length === 0 ? (
                    <div className="p-4">
                      <p className="text-sm text-texto-suave">Nenhuma compra registrada neste cartão ainda.</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-borda">
                      {faturas.map((f) => (
                        <FaturaLinha key={f.competencia} cartao={cartao} fatura={f} onPagar={abrirPagar} />
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}

      <Modal aberto={!!pagando} titulo="Marcar fatura como paga" onFechar={() => setPagando(null)}>
        {pagando && (
          <form onSubmit={confirmarPagamento} className="space-y-4">
            <p className="text-sm text-texto-suave">
              {pagando.cartao.nome} · {rotuloMesLongo(pagando.fatura.competencia)}
            </p>

            <Campo rotulo="Data do pagamento">
              <input
                type="date"
                className={classeInput}
                value={formPagar.data}
                onChange={(e) => setFormPagar({ ...formPagar, data: e.target.value })}
                required
              />
            </Campo>

            <Campo rotulo="Valor pago (R$)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={formPagar.valor}
                onChange={(e) => setFormPagar({ ...formPagar, valor: e.target.value })}
                required
              />
            </Campo>

            <Campo rotulo="Pago com a conta">
              <select
                className={classeInput}
                value={formPagar.conta_id}
                onChange={(e) => setFormPagar({ ...formPagar, conta_id: e.target.value })}
              >
                <option value="">Selecione a conta...</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>

            <Mensagem texto={mensagem} />

            <div className="flex justify-end gap-2 pt-2">
              <BotaoSecundario type="button" onClick={() => setPagando(null)}>
                Cancelar
              </BotaoSecundario>
              <BotaoPrimario type="submit" disabled={processandoPagamento}>
                {processandoPagamento ? 'Registrando...' : 'Confirmar pagamento'}
              </BotaoPrimario>
            </div>
          </form>
        )}
      </Modal>

      {csvBruto && (
        <ImportarCsvModal
          colunas={csvBruto.colunas}
          totalLinhas={csvBruto.linhas.length}
          onFechar={() => setCsvBruto(null)}
          onConfirmar={confirmarMapeamentoCsv}
        />
      )}
    </Pagina>
  )
}

function FaturaLinha({
  cartao,
  fatura,
  onPagar,
}: {
  cartao: Cartao
  fatura: Fatura
  onPagar: (cartao: Cartao, fatura: Fatura) => void
}) {
  const [aberta, setAberta] = useState(false)
  const total = fatura.pendencia ? fatura.pendencia.valor : fatura.totalCompras
  const podePagar = fatura.pendencia?.status === 'pendente'

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => setAberta((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="text-sm font-medium text-texto">{rotuloMesLongo(fatura.competencia)}</span>
          <span className="text-xs text-texto-suave">Vence {dataBR(fatura.vencimento)}</span>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          <span className="whitespace-nowrap text-sm font-semibold text-texto">{moeda(total)}</span>
          <BadgeStatus fatura={fatura} />
          {podePagar && (
            <button
              onClick={() => onPagar(cartao, fatura)}
              className="whitespace-nowrap rounded-lg border border-borda px-3 py-1.5 text-xs font-medium text-primaria hover:bg-fundo"
            >
              Marcar como paga
            </button>
          )}
        </div>
      </div>

      {aberta && (
        <ul className="mt-3 space-y-1.5 border-t border-borda pt-3">
          {fatura.itens.length === 0 && (
            <li className="text-xs text-texto-suave">Nenhuma compra nesta fatura ainda.</li>
          )}
          {fatura.itens.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-texto-suave">
                {dataBR(item.data)} · {item.descricao}
                {item.parcela_total && item.parcela_total > 1
                  ? ` (${item.parcela_numero}/${item.parcela_total})`
                  : ''}
              </span>
              <span
                className={`shrink-0 font-medium ${
                  item.tipo === 'receita' ? 'text-receita' : 'text-texto'
                }`}
              >
                {item.tipo === 'receita' ? '−' : ''} {moeda(item.valor)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
