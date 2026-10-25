'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { buscarTudo } from '@/lib/buscarTudo'
import { dataBR, moeda, rotuloMesCurto } from '@/lib/formato'
import { competenciaDaCompra } from '@/lib/faturaCartao'
import {
  normalizarDescricao,
  sugerirCategoria,
  sugerirOrigem,
  type SugestaoDeCategoria,
  type SugestaoOrigem,
} from '@/lib/sugestoes'
import { BotaoPrimario, CabecalhoPagina, EstadoVazio, Mensagem, Pagina, classeInput } from '@/components/ui'

type Lancamento = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  status: string
  dono_id: string
  conta_id: string | null
  cartao_id: string | null
  categoria_id: string | null
  subcategoria_id: string | null
  transferencia_id: string | null
  fatura_cartao_id: string | null
  fatura_competencia: string | null
  neutro: boolean
  categorias: { nome: string } | null
  contas: { nome: string } | null
  cartoes_credito: { nome: string } | null
}
type Conta = { id: string; nome: string; tipo: string; ativo: boolean }
type Cartao = { id: string; nome: string; ativo: boolean; dia_fechamento: number | null; dia_vencimento: number | null }
type Categoria = { id: string; nome: string; tipo: string }
type Subcategoria = { id: string; nome: string; categoria_id: string }
type Aba = 'origem' | 'categoria'

const CAMPOS =
  'id, data, descricao, valor, tipo, status, dono_id, conta_id, cartao_id, categoria_id, subcategoria_id, transferencia_id, fatura_cartao_id, fatura_competencia, neutro, categorias(nome), contas(nome), cartoes_credito!cartao_id(nome)'

function semOrigem(l: Lancamento): boolean {
  return l.status === 'pago' && !l.conta_id && !l.cartao_id && !l.transferencia_id && !l.fatura_cartao_id
}

function semCategoria(l: Lancamento): boolean {
  return !l.categoria_id && !l.transferencia_id && !l.fatura_cartao_id && !l.neutro
}

export default function PendenciasPage() {
  const [carregando, setCarregando] = useState(true)
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [userId, setUserId] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [aba, setAba] = useState<Aba>('origem')
  const [mensagem, setMensagem] = useState('')

  const carregar = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    const id = userData.user?.id ?? ''
    const [{ data: lancs }, { data: cts }, { data: crts }, { data: cats }, { data: subs }, { data: perfil }] =
      await Promise.all([
        buscarTudo((de, ate) => supabase.from('transacoes').select(CAMPOS).order('id').range(de, ate)),
        supabase.from('contas').select('id, nome, tipo, ativo').order('nome'),
        supabase.from('cartoes_credito').select('id, nome, ativo, dia_fechamento, dia_vencimento').order('nome'),
        supabase.from('categorias').select('id, nome, tipo').order('nome'),
        supabase.from('subcategorias').select('id, nome, categoria_id').order('nome'),
        id ? supabase.from('perfis').select('papel').eq('id', id).single() : Promise.resolve({ data: null }),
      ])
    // O Supabase tipa as junções (categorias, contas…) como listas; aqui vem um objeto só
    setLancamentos(lancs as unknown as Lancamento[])
    setContas((cts ?? []) as Conta[])
    setCartoes((crts ?? []) as Cartao[])
    setCategorias((cats ?? []) as Categoria[])
    setSubcategorias((subs ?? []) as Subcategoria[])
    setUserId(id)
    setIsAdmin(perfil?.papel === 'admin')
    setCarregando(false)
  }, [])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const pendentes = useMemo(() => {
    const lista = lancamentos.filter(aba === 'origem' ? semOrigem : semCategoria)
    return lista.sort((a, b) => b.data.localeCompare(a.data) || a.descricao.localeCompare(b.descricao))
  }, [lancamentos, aba])

  const contagem = useMemo(
    () => ({
      origem: lancamentos.filter(semOrigem).length,
      categoria: lancamentos.filter(semCategoria).length,
    }),
    [lancamentos]
  )

  // Iguais = mesma descrição normalizada, na mesma aba
  const iguaisPorDescricao = useMemo(() => {
    const mapa = new Map<string, Lancamento[]>()
    for (const l of pendentes) {
      const chave = normalizarDescricao(l.descricao)
      if (!chave) continue
      mapa.set(chave, [...(mapa.get(chave) ?? []), l])
    }
    return mapa
  }, [pendentes])

  const sugestoes = useMemo(() => {
    const mapa = new Map<string, (SugestaoOrigem | SugestaoDeCategoria)[]>()
    for (const l of pendentes) {
      mapa.set(
        l.id,
        aba === 'origem'
          ? sugerirOrigem(l, lancamentos, contas, cartoes)
          : sugerirCategoria(l, lancamentos, categorias, subcategorias)
      )
    }
    return mapa
  }, [pendentes, aba, lancamentos, contas, cartoes, categorias, subcategorias])

  function aoSalvar(ids: string[], alteracao: Partial<Lancamento>) {
    // Atualiza a lista local: o que foi corrigido sai da aba sem recarregar tudo
    setLancamentos((atual) => atual.map((l) => (ids.includes(l.id) ? { ...l, ...alteracao } : l)))
    setMensagem(ids.length > 1 ? `Corrigidos ${ids.length} lançamentos.` : 'Corrigido.')
  }

  const classeAba = (ativa: boolean) =>
    `min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors ${
      ativa ? 'bg-primaria text-sobre-cor' : 'text-texto-suave hover:bg-fundo'
    }`

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Pendências"
        descricao="Lançamentos sem conta, cartão ou categoria. As sugestões vêm do histórico; nada muda até você salvar."
      />

      <div className="mb-4 flex gap-1 rounded-xl border border-borda bg-superficie p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'origem'}
          onClick={() => {
            setAba('origem')
            setMensagem('')
          }}
          className={classeAba(aba === 'origem')}
        >
          Sem conta ou cartão ({contagem.origem})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'categoria'}
          onClick={() => {
            setAba('categoria')
            setMensagem('')
          }}
          className={classeAba(aba === 'categoria')}
        >
          Sem categoria ({contagem.categoria})
        </button>
      </div>

      {mensagem && (
        <div className="mb-4">
          <Mensagem texto={mensagem} />
        </div>
      )}

      {carregando ? (
        <p className="text-sm text-texto-suave">Carregando...</p>
      ) : pendentes.length === 0 ? (
        <EstadoVazio titulo="Nenhuma pendência. Todos os lançamentos têm conta e categoria." />
      ) : (
        <ul className="space-y-3">
          {pendentes.map((l) => {
            const iguais = (iguaisPorDescricao.get(normalizarDescricao(l.descricao)) ?? []).filter(
              (x) => x.id !== l.id && (isAdmin || x.dono_id === userId)
            )
            return (
              <ItemPendente
                key={`${aba}-${l.id}`}
                lancamento={l}
                aba={aba}
                sugestoes={sugestoes.get(l.id) ?? []}
                iguais={iguais}
                podeEditar={isAdmin || l.dono_id === userId}
                contas={contas}
                cartoes={cartoes}
                categorias={categorias.filter((c) => c.tipo === l.tipo)}
                subcategorias={subcategorias}
                faturas={lancamentos}
                onSalvo={aoSalvar}
              />
            )
          })}
        </ul>
      )}
    </Pagina>
  )
}

function ItemPendente({
  lancamento: l,
  aba,
  sugestoes,
  iguais,
  podeEditar,
  contas,
  cartoes,
  categorias,
  subcategorias,
  faturas,
  onSalvo,
}: {
  lancamento: Lancamento
  aba: Aba
  sugestoes: (SugestaoOrigem | SugestaoDeCategoria)[]
  iguais: Lancamento[]
  podeEditar: boolean
  contas: Conta[]
  cartoes: Cartao[]
  categorias: Categoria[]
  subcategorias: Subcategoria[]
  faturas: Lancamento[]
  onSalvo: (ids: string[], alteracao: Partial<Lancamento>) => void
}) {
  // Escolha: "conta:id" / "cartao:id" (aba origem) ou "categoria|sub" (aba categoria)
  const [escolha, setEscolha] = useState('')
  const [outra, setOutra] = useState(false)
  const [aplicarIguais, setAplicarIguais] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const chaveDaSugestao = (s: SugestaoOrigem | SugestaoDeCategoria) =>
    'tipo' in s ? `${s.tipo}:${s.id}` : `${s.categoria_id}|${s.subcategoria_id ?? ''}`

  // Compra que entra numa fatura já paga: avisa que o valor pago não muda
  const avisoFatura = useMemo(() => {
    if (!escolha.startsWith('cartao:')) return ''
    const cartao = cartoes.find((c) => c.id === escolha.slice(7))
    if (!cartao?.dia_fechamento || !cartao.dia_vencimento) return ''
    const competencia = competenciaDaCompra(l.data, cartao.dia_fechamento, cartao.dia_vencimento)
    const paga = faturas.some(
      (f) =>
        f.fatura_cartao_id === cartao.id &&
        f.status === 'pago' &&
        f.fatura_competencia?.slice(0, 7) === competencia
    )
    return paga
      ? `Esta compra passa a constar na fatura de ${rotuloMesCurto(competencia)} do ${cartao.nome}, já paga; o valor pago não muda.`
      : ''
  }, [escolha, cartoes, faturas, l.data])

  async function salvar() {
    if (!escolha) return
    setSalvando(true)
    setErro('')
    let alteracao: Partial<Lancamento>
    if (aba === 'origem') {
      const [tipo, id] = escolha.split(':')
      alteracao = tipo === 'cartao' ? { cartao_id: id, conta_id: null } : { conta_id: id, cartao_id: null }
    } else {
      const [categoriaId, subId] = escolha.split('|')
      alteracao = { categoria_id: categoriaId, subcategoria_id: subId || null }
    }
    const ids = [l.id, ...(aplicarIguais ? iguais.map((x) => x.id) : [])]
    const { error } = await supabase.from('transacoes').update(alteracao).in('id', ids)
    setSalvando(false)
    if (error) {
      setErro('Não foi possível salvar. Tente novamente.')
      return
    }
    onSalvo(ids, alteracao)
  }

  const detalhe = aba === 'origem' ? l.categorias?.nome ?? 'Sem categoria' : l.contas?.nome ?? l.cartoes_credito?.nome ?? 'Sem conta'

  return (
    <li className="cartao p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-texto break-words">{l.descricao}</p>
          <p className="mt-0.5 text-sm text-texto-suave">
            {dataBR(l.data)}, {detalhe}
          </p>
        </div>
        <span
          className={`shrink-0 font-semibold whitespace-nowrap ${l.tipo === 'receita' ? 'text-receita' : 'text-despesa'}`}
        >
          {l.tipo === 'receita' ? '+' : '−'}
          {moeda(l.valor)}
        </span>
      </div>

      {!podeEditar ? (
        <p className="mt-3 text-sm text-texto-suave">Só quem lançou ou o administrador pode corrigir.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Sugestões">
            {sugestoes.map((s) => {
              const chave = chaveDaSugestao(s)
              const selecionada = escolha === chave && !outra
              return (
                <button
                  key={chave}
                  type="button"
                  role="radio"
                  aria-checked={selecionada}
                  onClick={() => {
                    setEscolha(chave)
                    setOutra(false)
                  }}
                  className={`min-h-14 rounded-lg border px-3 py-2 text-left transition-colors ${
                    selecionada
                      ? 'border-primaria bg-primaria/10'
                      : 'border-borda bg-superficie hover:bg-fundo'
                  }`}
                >
                  <span className="block font-semibold text-texto">{s.nome}</span>
                  <span className="block text-sm text-texto-suave">{s.motivo}</span>
                </button>
              )
            })}
            <button
              type="button"
              role="radio"
              aria-checked={outra}
              onClick={() => {
                setOutra(true)
                setEscolha('')
              }}
              className={`min-h-14 rounded-lg border px-3 py-2 text-left font-semibold transition-colors ${
                outra ? 'border-primaria bg-primaria/10 text-texto' : 'border-borda bg-superficie text-texto hover:bg-fundo'
              }`}
            >
              Outra…
            </button>
          </div>

          {outra && (
            <select
              className={classeInput}
              value={escolha}
              onChange={(e) => setEscolha(e.target.value)}
              aria-label={aba === 'origem' ? 'Escolher conta ou cartão' : 'Escolher categoria'}
            >
              <option value="">{aba === 'origem' ? 'Selecione a conta ou o cartão...' : 'Selecione a categoria...'}</option>
              {aba === 'origem' ? (
                <>
                  <optgroup label="Contas">
                    {contas
                      .filter((c) => c.ativo)
                      .map((c) => (
                        <option key={c.id} value={`conta:${c.id}`}>
                          {c.nome}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Cartões">
                    {cartoes
                      .filter((c) => c.ativo)
                      .map((c) => (
                        <option key={c.id} value={`cartao:${c.id}`}>
                          {c.nome}
                        </option>
                      ))}
                  </optgroup>
                </>
              ) : (
                categorias.map((c) => (
                  <optgroup key={c.id} label={c.nome}>
                    <option value={`${c.id}|`}>{c.nome} (sem subcategoria)</option>
                    {subcategorias
                      .filter((s) => s.categoria_id === c.id)
                      .map((s) => (
                        <option key={s.id} value={`${c.id}|${s.id}`}>
                          {c.nome} / {s.nome}
                        </option>
                      ))}
                  </optgroup>
                ))
              )}
            </select>
          )}

          {avisoFatura && <p className="text-sm text-alerta">{avisoFatura}</p>}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {iguais.length > 0 ? (
              <label className="flex min-h-11 items-center gap-2 text-sm text-texto">
                <input
                  type="checkbox"
                  checked={aplicarIguais}
                  onChange={(e) => setAplicarIguais(e.target.checked)}
                  className="h-5 w-5"
                />
                Aplicar também aos outros {iguais.length} iguais
              </label>
            ) : (
              <span />
            )}
            <BotaoPrimario type="button" onClick={salvar} disabled={!escolha || salvando} className="min-h-11">
              {salvando ? 'Salvando...' : 'Salvar'}
            </BotaoPrimario>
          </div>

          {erro && <p className="text-sm text-despesa">{erro}</p>}
        </div>
      )}
    </li>
  )
}
