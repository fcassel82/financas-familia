'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { buscarTudo } from '@/lib/buscarTudo'
import { dataBR, moeda } from '@/lib/formato'
import {
  sugerirAcao,
  sugestaoContaApp,
  type ContextoConciliacao,
  type ItemBanco,
  type LancamentoApp,
  type NotaApp,
  type Sugestao,
} from '@/lib/conciliacao'
import { sugerirCategoria, type Historico } from '@/lib/sugestoes'
import {
  BotaoPrimario,
  BotaoSecundario,
  CabecalhoPagina,
  EstadoVazio,
  Mensagem,
  Pagina,
  classeInput,
} from '@/components/ui'

type ContaBanco = {
  id: string
  nome: string
  tipo: string
  numero: string | null
  saldo: number | null
  conta_id: string | null
  cartao_id: string | null
  ultima_busca: string | null
}
type TransacaoBanco = {
  id: string
  conta_banco_id: string
  data: string
  descricao: string
  valor: number
  tipo: 'receita' | 'despesa'
  pagamento_cartao: boolean
  categoria_banco: string | null
  parcela: number | null
  parcelas: number | null
  situacao: string
  lancamentos: string[]
}
type ContaApp = { id: string; nome: string; tipo: string; ativo: boolean; escopo: string }
type CartaoApp = { id: string; nome: string; ativo: boolean; escopo: string }
type Categoria = { id: string; nome: string; tipo: string }
type Subcategoria = { id: string; nome: string; categoria_id: string }
type Lancamento = LancamentoApp & Historico
type Acao = Sugestao['acao']

const ROTULO_ACAO: Record<Acao, string> = {
  lancar: 'Lançar',
  ligar: 'Ligar',
  transferencia: 'Transferência',
  ignorar: 'Ignorar',
}

const CAMPOS_LANCAMENTO =
  'id, data, descricao, valor, tipo, status, escopo, dono_id, conta_id, cartao_id, categoria_id, subcategoria_id, parcela_total, nota_fiscal_id, transferencia_id, fatura_cartao_id, criado_em'

export default function BancosPage() {
  const [carregando, setCarregando] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState('')
  const [titular, setTitular] = useState('')
  const [contasBanco, setContasBanco] = useState<ContaBanco[]>([])
  const [caixa, setCaixa] = useState<TransacaoBanco[]>([])
  const [jaLigados, setJaLigados] = useState<Set<string>>(new Set())
  const [contas, setContas] = useState<ContaApp[]>([])
  const [cartoes, setCartoes] = useState<CartaoApp[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [notas, setNotas] = useState<NotaApp[]>([])
  const [ligacoes, setLigacoes] = useState<Record<string, string>>({})
  const [editandoLigacoes, setEditandoLigacoes] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const carregar = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    const id = userData.user?.id ?? ''
    const { data: perfil } = id
      ? await supabase.from('perfis').select('papel, nome').eq('id', id).single()
      : { data: null }
    setUserId(id)
    setIsAdmin(perfil?.papel === 'admin')
    setTitular((perfil?.nome ?? '').split(' ')[0])
    if (perfil?.papel !== 'admin') {
      setCarregando(false)
      return
    }

    const [cb, tb, ct, cr, cat, sub, lan, nf] = await Promise.all([
      supabase
        .from('contas_banco')
        .select('id, nome, tipo, numero, saldo, conta_id, cartao_id, ultima_busca')
        .order('nome'),
      buscarTudo((de, ate) =>
        supabase
          .from('transacoes_banco')
          .select(
            'id, conta_banco_id, data, descricao, valor, tipo, pagamento_cartao, categoria_banco, parcela, parcelas, situacao, lancamentos'
          )
          .order('id')
          .range(de, ate)
      ),
      supabase.from('contas').select('id, nome, tipo, ativo, escopo').order('nome'),
      supabase.from('cartoes_credito').select('id, nome, ativo, escopo').order('nome'),
      supabase.from('categorias').select('id, nome, tipo').order('nome'),
      supabase.from('subcategorias').select('id, nome, categoria_id').order('nome'),
      buscarTudo((de, ate) =>
        supabase.from('transacoes').select(CAMPOS_LANCAMENTO).order('id').range(de, ate)
      ),
      supabase.from('notas_fiscais').select('id, data, valor_pago'),
    ])

    const todas = (tb.data ?? []) as TransacaoBanco[]
    setContasBanco((cb.data ?? []) as ContaBanco[])
    setCaixa(
      todas.filter((t) => t.situacao === 'revisar').sort((a, b) => b.data.localeCompare(a.data))
    )
    setJaLigados(
      new Set(todas.filter((t) => t.situacao !== 'revisar').flatMap((t) => t.lancamentos ?? []))
    )
    setContas((ct.data ?? []) as ContaApp[])
    setCartoes((cr.data ?? []) as CartaoApp[])
    setCategorias((cat.data ?? []) as Categoria[])
    setSubcategorias((sub.data ?? []) as Subcategoria[])
    setLancamentos((lan.data ?? []) as unknown as Lancamento[])
    setNotas((nf.data ?? []) as NotaApp[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  async function buscarAgora() {
    setBuscando(true)
    setMensagem('')
    const { data: sessao } = await supabase.auth.getSession()
    const token = sessao.session?.access_token
    try {
      const resposta = await fetch('/api/pluggy/sincronizar', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const corpo = await resposta.json()
      if (!resposta.ok) setMensagem(`Erro: ${corpo.error ?? 'não foi possível buscar nos bancos.'}`)
      else {
        try {
          localStorage.setItem('pluggy_ultima_busca', new Date().toDateString())
        } catch {
          // Sem armazenamento local: a busca automática só tenta de novo amanhã
        }
        const erros = (corpo.erros as string[]) ?? []
        setMensagem(
          erros.length > 0
            ? `Erro em parte da busca: ${erros.join(' ')}`
            : corpo.novas > 0
              ? `${corpo.novas} transações novas chegaram.`
              : 'Busca feita. Nada novo nos bancos.'
        )
      }
    } catch {
      setMensagem('Erro: não foi possível falar com os bancos. Tente de novo.')
    }
    setBuscando(false)
    await carregar()
  }

  const semLigacao = contasBanco.filter((c) => !c.conta_id && !c.cartao_id)
  const mostrarLigacoes = editandoLigacoes || semLigacao.length > 0

  // Escolha de cada conta do banco: a já salva ou a sugestão pelo nome
  const escolhaDaLigacao = (c: ContaBanco) =>
    ligacoes[c.id] ??
    (c.conta_id
      ? `conta:${c.conta_id}`
      : c.cartao_id
        ? `cartao:${c.cartao_id}`
        : (sugestaoContaApp(
            c.nome,
            c.tipo,
            contas.filter((x) => x.ativo),
            cartoes.filter((x) => x.ativo),
            titular
          ) ?? ''))

  async function salvarLigacoes() {
    setMensagem('')
    for (const c of contasBanco) {
      const escolha = escolhaDaLigacao(c)
      const [tipo, id] = escolha.split(':')
      const { error } = await supabase
        .from('contas_banco')
        .update({
          conta_id: tipo === 'conta' ? id : null,
          cartao_id: tipo === 'cartao' ? id : null,
        })
        .eq('id', c.id)
      if (error) {
        setMensagem('Não foi possível salvar as ligações. Tente novamente.')
        return
      }
    }
    setLigacoes({})
    setEditandoLigacoes(false)
    setMensagem('Ligações salvas.')
    await carregar()
  }

  const contaBancoPorId = useMemo(() => new Map(contasBanco.map((c) => [c.id, c])), [contasBanco])
  const nomeConta = useCallback(
    (id: string) =>
      contas.find((c) => c.id === id)?.nome ?? cartoes.find((c) => c.id === id)?.nome ?? '',
    [contas, cartoes]
  )

  const ctx: ContextoConciliacao = useMemo(
    () => ({ lancamentos, notas, contas, nomeDaContaApp: nomeConta, jaLigados }),
    [lancamentos, notas, contas, nomeConta, jaLigados]
  )

  const itemDe = useCallback(
    (t: TransacaoBanco): ItemBanco | null => {
      const cb = contaBancoPorId.get(t.conta_banco_id)
      if (!cb || (!cb.conta_id && !cb.cartao_id)) return null
      return { ...t, contaBanco: { tipo: cb.tipo, conta_id: cb.conta_id, cartao_id: cb.cartao_id } }
    },
    [contaBancoPorId]
  )

  const sugestoes = useMemo(() => {
    const mapa = new Map<string, Sugestao>()
    for (const t of caixa) {
      const item = itemDe(t)
      if (item) mapa.set(t.id, sugerirAcao(item, ctx))
    }
    return mapa
  }, [caixa, itemDe, ctx])

  /** Tira da lista o que foi confirmado e reserva os lançamentos ligados */
  function concluir(ids: string[], lancamentosUsados: string[]) {
    setCaixa((atual) => atual.filter((t) => !ids.includes(t.id)))
    setJaLigados((atual) => new Set([...atual, ...lancamentosUsados]))
  }

  async function marcar(t: TransacaoBanco, situacao: string, usados: string[], motivo: string) {
    const { error } = await supabase
      .from('transacoes_banco')
      .update({ situacao, lancamentos: usados, motivo, revisado_em: new Date().toISOString() })
      .eq('id', t.id)
    if (error) throw error
  }

  /** Ligar: os itens sem conta recebem a conta/cartão do banco; a transação do banco aponta para eles */
  async function ligar(t: TransacaoBanco, ids: string[], motivo: string) {
    const cb = contaBancoPorId.get(t.conta_banco_id)!
    const { error } = await supabase
      .from('transacoes')
      .update(cb.cartao_id ? { cartao_id: cb.cartao_id } : { conta_id: cb.conta_id })
      .in('id', ids)
      .is('conta_id', null)
      .is('cartao_id', null)
    if (error) throw error
    await marcar(t, 'ligada', ids, motivo)
    setLancamentos((atual) =>
      atual.map((l) =>
        ids.includes(l.id) && !l.conta_id && !l.cartao_id
          ? { ...l, conta_id: cb.conta_id, cartao_id: cb.cartao_id }
          : l
      )
    )
    concluir([t.id], ids)
  }

  async function lancar(t: TransacaoBanco, categoria: string) {
    const cb = contaBancoPorId.get(t.conta_banco_id)!
    const escopo = cb.cartao_id
      ? (cartoes.find((c) => c.id === cb.cartao_id)?.escopo ?? 'familiar')
      : (contas.find((c) => c.id === cb.conta_id)?.escopo ?? 'familiar')
    const [categoriaId, subId] = categoria ? categoria.split('|') : ['', '']
    const { data, error } = await supabase
      .from('transacoes')
      .insert({
        data: t.data,
        descricao: t.descricao,
        valor: t.valor,
        tipo: t.tipo,
        escopo,
        status: 'pago',
        conta_id: cb.conta_id,
        cartao_id: cb.cartao_id,
        categoria_id: categoriaId || null,
        subcategoria_id: subId || null,
        parcela_numero: t.parcelas && t.parcelas > 1 ? t.parcela : null,
        parcela_total: t.parcelas && t.parcelas > 1 ? t.parcelas : null,
        dono_id: userId,
      })
      .select(CAMPOS_LANCAMENTO)
      .single()
    if (error || !data) throw error
    await marcar(t, 'lancada', [data.id], 'Lançado')
    setLancamentos((atual) => [...atual, data as unknown as Lancamento])
    concluir([t.id], [data.id])
  }

  async function transferir(t: TransacaoBanco, outra: string) {
    const cb = contaBancoPorId.get(t.conta_banco_id)!
    const ligada = cb.conta_id!
    const [origem, destino] = t.tipo === 'despesa' ? [ligada, outra] : [outra, ligada]
    const base = {
      data: t.data,
      descricao: `Transferência: ${nomeConta(origem)} → ${nomeConta(destino)}`,
      valor: t.valor,
      escopo: 'familiar',
      status: 'pago',
      transferencia_id: crypto.randomUUID(),
      dono_id: userId,
    }
    const { data, error } = await supabase
      .from('transacoes')
      .insert([
        { ...base, tipo: 'despesa', conta_id: origem },
        { ...base, tipo: 'receita', conta_id: destino },
      ])
      .select('id')
    if (error || !data) throw error
    const ids = data.map((d) => d.id as string)
    await marcar(t, 'lancada', ids, 'Transferência')

    // A outra ponta, se também veio de um banco conectado, fica ligada à mesma transferência
    const centavos = Math.round(t.valor * 100)
    const outraPonta = caixa.find((x) => {
      if (x.id === t.id || x.tipo === t.tipo || Math.round(x.valor * 100) !== centavos) return false
      const dias = Math.abs(Date.parse(x.data) - Date.parse(t.data)) / 86_400_000
      return dias <= 2 && contaBancoPorId.get(x.conta_banco_id)?.conta_id === outra
    })
    if (outraPonta) await marcar(outraPonta, 'ligada', ids, 'Outra ponta da transferência')
    concluir(outraPonta ? [t.id, outraPonta.id] : [t.id], ids)
  }

  async function ignorar(t: TransacaoBanco, motivo: string) {
    await marcar(t, 'ignorada', [], motivo || 'Ignorado')
    concluir([t.id], [])
  }

  async function confirmarTodasJaNoApp() {
    setMensagem('')
    let n = 0
    // Duas transações iguais do banco podem ter sugerido o mesmo lançamento
    const usadosNoLote = new Set(jaLigados)
    try {
      for (const t of caixa) {
        const s = sugestoes.get(t.id)
        if (s?.acao !== 'ligar' || !s.lancamentos?.length) continue
        if (s.lancamentos.some((id) => usadosNoLote.has(id))) continue
        await ligar(t, s.lancamentos, s.motivo)
        s.lancamentos.forEach((id) => usadosNoLote.add(id))
        n++
      }
      setMensagem(n === 1 ? 'Confirmado.' : `Confirmadas ${n} transações.`)
    } catch {
      setMensagem('Não foi possível confirmar. Tente novamente.')
    }
  }

  if (carregando) {
    return (
      <Pagina>
        <p className="text-sm text-texto-suave">Carregando...</p>
      </Pagina>
    )
  }

  if (!isAdmin) {
    return (
      <Pagina>
        <CabecalhoPagina titulo="Importar dos bancos" />
        <EstadoVazio titulo="Só o administrador pode importar dos bancos." />
      </Pagina>
    )
  }

  const ultima = contasBanco
    .map((c) => c.ultima_busca)
    .filter(Boolean)
    .sort()
    .at(-1)
  const qtdJaNoApp = caixa.filter((t) => sugestoes.get(t.id)?.acao === 'ligar').length
  const opcoesLigacao = (tipo: string) =>
    tipo === 'CREDIT'
      ? cartoes.filter((c) => c.ativo).map((c) => ({ valor: `cartao:${c.id}`, nome: c.nome }))
      : contas
          .filter((c) => c.ativo && c.tipo !== 'investimento')
          .map((c) => ({ valor: `conta:${c.id}`, nome: c.nome }))

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Importar dos bancos"
        descricao="Transações que vieram dos bancos conectados no Meu Pluggy. Nada entra no app até você confirmar."
        acao={
          <BotaoPrimario
            type="button"
            onClick={buscarAgora}
            disabled={buscando}
            className="min-h-11"
          >
            {buscando ? 'Buscando...' : 'Buscar agora'}
          </BotaoPrimario>
        }
      />

      <p className="-mt-3 mb-4 text-sm text-texto-suave">
        {ultima
          ? `Última busca: ${new Date(ultima).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
          : 'Ainda não houve busca. Toque em Buscar agora.'}
      </p>

      {mensagem && (
        <div className="mb-4">
          <Mensagem texto={mensagem} />
        </div>
      )}

      {contasBanco.length > 0 && mostrarLigacoes && (
        <section className="cartao mb-5 p-4">
          <h2 className="text-base font-semibold text-texto">Ligar contas</h2>
          <p className="mb-3 text-sm text-texto-suave">
            Diga a qual conta ou cartão do app corresponde cada conta do banco. É feito uma vez só.
          </p>
          <ul className="divide-y divide-borda">
            {contasBanco.map((c) => (
              <li key={c.id} className="grid gap-2 py-3 sm:grid-cols-2 sm:items-center">
                <span>
                  <span className="block font-medium text-texto">{c.nome}</span>
                  <span className="block text-sm text-texto-suave">
                    {c.tipo === 'CREDIT' ? 'Cartão' : 'Conta'}
                    {c.numero ? ` final ${c.numero.slice(-4)}` : ''}
                    {c.saldo !== null
                      ? `, ${c.tipo === 'CREDIT' ? 'fatura' : 'saldo'} ${moeda(c.saldo)}`
                      : ''}
                  </span>
                </span>
                <select
                  className={classeInput}
                  value={escolhaDaLigacao(c)}
                  onChange={(e) => setLigacoes((atual) => ({ ...atual, [c.id]: e.target.value }))}
                  aria-label={`Conta do app para ${c.nome}`}
                >
                  <option value="">Não ligar agora</option>
                  {opcoesLigacao(c.tipo).map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.nome}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end">
            <BotaoPrimario type="button" onClick={salvarLigacoes} className="min-h-11">
              Salvar ligações
            </BotaoPrimario>
          </div>
        </section>
      )}

      {!mostrarLigacoes && contasBanco.length > 0 && (
        <button
          type="button"
          onClick={() => setEditandoLigacoes(true)}
          className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-primaria hover:underline"
        >
          Editar ligações das contas
        </button>
      )}

      {caixa.length === 0 ? (
        <EstadoVazio titulo="Nada para revisar. A próxima busca traz o que for novo." />
      ) : (
        <>
          {qtdJaNoApp > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borda bg-superficie px-4 py-3">
              <span className="text-texto">
                <strong>{qtdJaNoApp}</strong> já estão no app e só precisam ser ligadas.
              </span>
              <BotaoSecundario type="button" onClick={confirmarTodasJaNoApp} className="min-h-11">
                Confirmar todas as já no app
              </BotaoSecundario>
            </div>
          )}
          <div className="space-y-6">
            {contasBanco.map((cb) => {
              const itens = caixa.filter((t) => t.conta_banco_id === cb.id)
              if (itens.length === 0) return null
              const ligadaA = cb.conta_id ?? cb.cartao_id
              return (
                <section key={cb.id}>
                  <h2 className="mb-2 px-1 text-base font-semibold text-texto">
                    {ligadaA ? nomeConta(ligadaA) : cb.nome}{' '}
                    <span className="text-sm font-normal text-texto-suave">({itens.length})</span>
                  </h2>
                  {!ligadaA ? (
                    <p className="cartao p-4 text-sm text-texto-suave">
                      Ligue esta conta do banco a uma conta do app para revisar as {itens.length}{' '}
                      transações.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {itens.map((t) => (
                        <ItemCaixa
                          key={t.id}
                          transacao={t}
                          sugestao={sugestoes.get(t.id)!}
                          historico={lancamentos}
                          donoId={userId}
                          categorias={categorias}
                          subcategorias={subcategorias}
                          contas={contas.filter((c) => c.ativo && c.id !== cb.conta_id)}
                          podeTransferir={!!cb.conta_id}
                          nomeConta={nomeConta}
                          onLigar={(ids, motivo) => ligar(t, ids, motivo)}
                          onLancar={(categoria) => lancar(t, categoria)}
                          onTransferir={(outra) => transferir(t, outra)}
                          onIgnorar={(motivo) => ignorar(t, motivo)}
                          onConfirmado={() => setMensagem('Confirmado.')}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}
    </Pagina>
  )
}

function ItemCaixa({
  transacao: t,
  sugestao,
  historico,
  donoId,
  categorias,
  subcategorias,
  contas,
  podeTransferir,
  nomeConta,
  onLigar,
  onLancar,
  onTransferir,
  onIgnorar,
  onConfirmado,
}: {
  transacao: TransacaoBanco
  sugestao: Sugestao
  historico: Lancamento[]
  donoId: string
  categorias: Categoria[]
  subcategorias: Subcategoria[]
  contas: ContaApp[]
  podeTransferir: boolean
  nomeConta: (id: string) => string
  onLigar: (ids: string[], motivo: string) => Promise<void>
  onLancar: (categoria: string) => Promise<void>
  onTransferir: (outra: string) => Promise<void>
  onIgnorar: (motivo: string) => Promise<void>
  onConfirmado: () => void
}) {
  const [acao, setAcao] = useState<Acao>(sugestao.acao)
  const [categoria, setCategoria] = useState('')
  const [outra, setOutra] = useState(
    (t.tipo === 'despesa' ? sugestao.contaDestino : sugestao.origem) ?? ''
  )
  const [motivo, setMotivo] = useState(sugestao.acao === 'ignorar' ? sugestao.motivo : '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const categoriasSugeridas = useMemo(
    () =>
      sugerirCategoria(
        {
          descricao: t.descricao,
          tipo: t.tipo,
          dono_id: donoId,
          conta_id: null,
          cartao_id: null,
          categoria_id: null,
          subcategoria_id: null,
        },
        historico,
        categorias,
        subcategorias
      ),
    [t.descricao, t.tipo, donoId, historico, categorias, subcategorias]
  )

  const podeLigar = sugestao.acao === 'ligar' && !!sugestao.lancamentos?.length
  const acoes: Acao[] = [
    'lancar',
    ...(podeLigar ? (['ligar'] as Acao[]) : []),
    ...(podeTransferir ? (['transferencia'] as Acao[]) : []),
    'ignorar',
  ]
  // Se a sugestão mudou (ex.: o lançamento foi ligado a outra transação), volta para uma ação possível
  const acaoAtual: Acao = acoes.includes(acao) ? acao : acoes[0]
  const ligados = historico.filter((l) => sugestao.lancamentos?.includes(l.id))
  const somaLigados = ligados.reduce((s, l) => s + Number(l.valor), 0)

  async function confirmar() {
    setSalvando(true)
    setErro('')
    try {
      if (acaoAtual === 'ligar') await onLigar(sugestao.lancamentos ?? [], sugestao.motivo)
      else if (acaoAtual === 'lancar') await onLancar(categoria)
      else if (acaoAtual === 'transferencia') await onTransferir(outra)
      else await onIgnorar(motivo)
      onConfirmado()
    } catch {
      setErro('Não foi possível confirmar. Tente novamente.')
      setSalvando(false)
    }
  }

  const pronto = acaoAtual !== 'transferencia' || !!outra

  return (
    <li className="cartao p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold break-words text-texto">{t.descricao}</p>
          <p className="mt-0.5 text-sm text-texto-suave">
            {dataBR(t.data)}
            {t.parcelas && t.parcelas > 1 ? `, parcela ${t.parcela ?? '?'}/${t.parcelas}` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 font-semibold whitespace-nowrap ${t.tipo === 'receita' ? 'text-receita' : 'text-despesa'}`}
        >
          {t.tipo === 'receita' ? '+' : '−'}
          {moeda(t.valor)}
        </span>
      </div>

      <p className="mt-2 text-sm text-primaria">Sugestão: {sugestao.motivo}</p>

      <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ação">
        {acoes.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={acaoAtual === a}
            onClick={() => setAcao(a)}
            className={`min-h-10 rounded-lg border px-3 text-sm font-semibold transition-colors ${
              acaoAtual === a
                ? 'border-primaria bg-primaria/10 text-texto'
                : 'border-borda bg-superficie text-texto-suave hover:bg-fundo'
            }`}
          >
            {ROTULO_ACAO[a]}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {acaoAtual === 'ligar' && (
          <div className="rounded-lg bg-fundo px-3 py-2 text-sm text-texto">
            {ligados.length === 1 ? (
              <>
                Liga a &quot;{ligados[0].descricao}&quot; de {dataBR(ligados[0].data)}, sem criar
                outro lançamento.
              </>
            ) : (
              <>
                Liga a {ligados.length} itens somando {moeda(somaLigados)}
                {sugestao.diferenca ? ` (diferença de ${moeda(Math.abs(sugestao.diferenca))})` : ''}
                , sem criar outro lançamento.
              </>
            )}
          </div>
        )}

        {acaoAtual === 'lancar' && (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              {categoriasSugeridas.map((s) => {
                const chave = `${s.categoria_id}|${s.subcategoria_id ?? ''}`
                return (
                  <button
                    key={chave}
                    type="button"
                    onClick={() => setCategoria(chave)}
                    className={`min-h-12 rounded-lg border px-3 py-1.5 text-left transition-colors ${
                      categoria === chave
                        ? 'border-primaria bg-primaria/10'
                        : 'border-borda bg-superficie hover:bg-fundo'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-texto">{s.nome}</span>
                    <span className="block text-xs text-texto-suave">{s.motivo}</span>
                  </button>
                )
              })}
            </div>
            <select
              className={classeInput}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              aria-label="Categoria"
            >
              <option value="">Sem categoria (vai para as Pendências)</option>
              {categorias
                .filter((c) => c.tipo === t.tipo)
                .map((c) => (
                  <optgroup key={c.id} label={c.nome}>
                    <option value={`${c.id}|`}>{c.nome}</option>
                    {subcategorias
                      .filter((s) => s.categoria_id === c.id)
                      .map((s) => (
                        <option key={s.id} value={`${c.id}|${s.id}`}>
                          {c.nome} / {s.nome}
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>
            {sugestao.detalharNota && (
              <Link
                href={`/importar?caixa=${encodeURIComponent(t.id)}`}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-primaria hover:underline"
              >
                Detalhar com nota fiscal
              </Link>
            )}
          </>
        )}

        {acaoAtual === 'transferencia' && (
          <label className="block text-sm text-texto">
            {t.tipo === 'despesa' ? 'Para qual conta foi' : 'De qual conta veio'}
            <select
              className={`${classeInput} mt-1`}
              value={outra}
              onChange={(e) => setOutra(e.target.value)}
            >
              <option value="">Selecione a conta...</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            {outra && (
              <span className="mt-1 block text-texto-suave">
                Cria a transferência{' '}
                {t.tipo === 'despesa' ? `para ${nomeConta(outra)}` : `vinda de ${nomeConta(outra)}`}
                , que não conta como receita nem despesa.
              </span>
            )}
          </label>
        )}

        {acaoAtual === 'ignorar' && (
          <input
            className={classeInput}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (opcional)"
            aria-label="Motivo para ignorar"
          />
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <BotaoPrimario
          type="button"
          onClick={confirmar}
          disabled={salvando || !pronto}
          className="min-h-11"
        >
          {salvando ? 'Confirmando...' : 'Confirmar'}
        </BotaoPrimario>
      </div>
      {erro && <p className="mt-2 text-sm text-despesa">{erro}</p>}
    </li>
  )
}
