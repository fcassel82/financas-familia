'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  chaveMes,
  dataBR,
  deslocarMes,
  limitesDoMes,
  moeda,
  rotuloMesLongo,
} from '@/lib/formato'
import {
  conciliarComExistentes,
  decodificarOfx,
  parsearOfx,
  type ExistenteParaConciliar,
  type ItemConciliacao,
} from '@/lib/parseOfx'
import { IconeImportar, IconeSeta } from '@/components/Icones'
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

type Conta = { id: string; nome: string; cor: string | null; saldo_inicial: number }

type Movimento = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  transferencia_id: string | null
  categorias: { nome: string } | null
}

type Categoria = { id: string; nome: string; tipo: string }
type Subcategoria = { id: string; categoria_id: string; nome: string }

const FORM_LANCAMENTO_VAZIO = { descricao: '', categoria_id: '', subcategoria_id: '', escopo: 'pessoal' }

export default function ExtratoPage() {
  const [contas, setContas] = useState<Conta[]>([])
  const [contaId, setContaId] = useState('')
  const [mes, setMes] = useState(chaveMes(new Date()))
  const [movimentos, setMovimentos] = useState<Movimento[]>([])
  const [saldoAnterior, setSaldoAnterior] = useState(0)
  const [carregando, setCarregando] = useState(true)

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [userId, setUserId] = useState('')

  const [itensConciliacao, setItensConciliacao] = useState<ItemConciliacao[] | null>(null)
  const [importando, setImportando] = useState(false)
  const [mensagemConciliacao, setMensagemConciliacao] = useState('')
  const [linhaAberta, setLinhaAberta] = useState<string | null>(null)
  const [formLancamento, setFormLancamento] = useState(FORM_LANCAMENTO_VAZIO)
  const [salvandoLinha, setSalvandoLinha] = useState(false)
  const inputArquivoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function carregarListasBase() {
      const { data: userData } = await supabase.auth.getUser()
      if (userData.user?.id) setUserId(userData.user.id)

      const [{ data: cts }, { data: cats }, { data: subs }] = await Promise.all([
        supabase.from('contas').select('id, nome, cor, saldo_inicial').order('nome'),
        supabase.from('categorias').select('id, nome, tipo').order('nome'),
        supabase.from('subcategorias').select('id, categoria_id, nome').order('nome'),
      ])
      const lista = (cts ?? []) as Conta[]
      setContas(lista)
      setCategorias((cats ?? []) as Categoria[])
      setSubcategorias((subs ?? []) as Subcategoria[])
      if (lista.length) setContaId((atual) => atual || lista[0].id)
      else setCarregando(false)
    }
    carregarListasBase()
  }, [])

  const carregar = useCallback(async () => {
    if (!contaId) return

    const conta = contas.find((c) => c.id === contaId)
    const { inicio, fim } = limitesDoMes(mes)

    const [{ data: anteriores }, { data: doMes }] = await Promise.all([
      // Tudo que já aconteceu ANTES do período, para montar o saldo de abertura
      supabase
        .from('transacoes')
        .select('valor, tipo')
        .eq('conta_id', contaId)
        .eq('status', 'pago')
        .lt('data', inicio),
      supabase
        .from('transacoes')
        .select('id, data, descricao, valor, tipo, transferencia_id, categorias(nome)')
        .eq('conta_id', contaId)
        .eq('status', 'pago')
        .gte('data', inicio)
        .lte('data', fim)
        .order('data'),
    ])

    let abertura = Number(conta?.saldo_inicial ?? 0)
    for (const m of anteriores ?? []) {
      abertura += m.tipo === 'receita' ? Number(m.valor) : -Number(m.valor)
    }

    setSaldoAnterior(abertura)
    setMovimentos((doMes ?? []) as unknown as Movimento[])
    setCarregando(false)
  }, [contaId, mes, contas])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  function trocarConta(novaContaId: string) {
    setContaId(novaContaId)
    // O extrato importado é específico da conta anterior, não faz mais sentido aqui
    setItensConciliacao(null)
    setMensagemConciliacao('')
    setLinhaAberta(null)
  }

  // Saldo corrente linha a linha, como num extrato bancário
  const linhas = useMemo(() => {
    const resultado: (Movimento & { saldoApos: number })[] = []
    let acumulado = saldoAnterior
    for (const m of movimentos) {
      acumulado += m.tipo === 'receita' ? Number(m.valor) : -Number(m.valor)
      resultado.push({ ...m, saldoApos: acumulado })
    }
    return resultado
  }, [movimentos, saldoAnterior])

  const entradas = movimentos
    .filter((m) => m.tipo === 'receita')
    .reduce((s, m) => s + Number(m.valor), 0)
  const saidas = movimentos
    .filter((m) => m.tipo === 'despesa')
    .reduce((s, m) => s + Number(m.valor), 0)
  const saldoFinal = saldoAnterior + entradas - saidas

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo || !contaId) return

    setImportando(true)
    setMensagemConciliacao('')
    setLinhaAberta(null)

    try {
      const buffer = await arquivo.arrayBuffer()
      const itensOfx = parsearOfx(decodificarOfx(buffer))

      if (itensOfx.length === 0) {
        setItensConciliacao(null)
        setMensagemConciliacao('Nenhum lançamento encontrado neste arquivo.')
        setImportando(false)
        return
      }

      const datas = itensOfx.map((i) => i.data).sort()
      const { data: existentes, error } = await supabase
        .from('transacoes')
        .select('id, data, valor, tipo')
        .eq('conta_id', contaId)
        .eq('status', 'pago')
        .gte('data', datas[0])
        .lte('data', datas[datas.length - 1])

      if (error) {
        setMensagemConciliacao('Erro ao conciliar: ' + error.message)
        setImportando(false)
        return
      }

      const itens = conciliarComExistentes(itensOfx, (existentes ?? []) as ExistenteParaConciliar[])
      itens.sort((a, b) => a.data.localeCompare(b.data))
      setItensConciliacao(itens)
    } catch (err) {
      console.error('Falha ao ler extrato:', err)
      setMensagemConciliacao('Não foi possível ler este arquivo. Confira se é um OFX válido.')
    }
    setImportando(false)
  }

  function abrirSalvarLinha(item: ItemConciliacao) {
    setLinhaAberta(item.chave)
    setFormLancamento({ ...FORM_LANCAMENTO_VAZIO, descricao: item.descricao })
    setMensagemConciliacao('')
  }

  function cancelarSalvarLinha() {
    setLinhaAberta(null)
    setFormLancamento(FORM_LANCAMENTO_VAZIO)
  }

  async function salvarLinhaComoLancamento(item: ItemConciliacao) {
    setSalvandoLinha(true)
    setMensagemConciliacao('')

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
        conta_id: contaId,
        status: 'pago',
        dono_id: userId,
        lancado_por: userId,
      })
      .select('id')
      .single()

    setSalvandoLinha(false)
    if (error) {
      setMensagemConciliacao('Erro ao salvar: ' + error.message)
      return
    }

    setItensConciliacao((atual) =>
      (atual ?? []).map((i) => (i.chave === item.chave ? { ...i, transacaoId: data.id } : i))
    )
    cancelarSalvarLinha()
    carregar()
  }

  const conta = contas.find((c) => c.id === contaId)
  const totalConciliado = itensConciliacao?.filter((i) => i.transacaoId).length ?? 0

  const categoriasDaLinha = (tipoLinha: string) =>
    categorias.filter((c) => c.tipo === tipoLinha)
  const subcategoriasDaLinha = subcategorias.filter(
    (s) => s.categoria_id === formLancamento.categoria_id
  )

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Extrato de Contas"
        descricao="Movimentações de uma conta, com saldo acumulado linha a linha."
        acao={
          contas.length > 0 ? (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-borda bg-superficie px-4 py-2.5 text-sm font-semibold text-texto transition-colors hover:bg-fundo">
              <IconeImportar className="h-4 w-4" />
              {importando ? 'Lendo arquivo...' : 'Importar extrato'}
              <input
                ref={inputArquivoRef}
                type="file"
                accept=".ofx"
                className="hidden"
                disabled={importando}
                onChange={handleArquivo}
              />
            </label>
          ) : undefined
        }
      />

      {contas.length === 0 && !carregando ? (
        <EstadoVazio
          titulo="Nenhuma conta cadastrada"
          descricao="Cadastre uma conta para ver o extrato dela."
          acao={
            <a
              href="/contas"
              className="inline-flex items-center gap-2 rounded-lg bg-primaria px-4 py-2.5 text-sm font-semibold text-white hover:bg-primaria-escura"
            >
              Cadastrar conta
            </a>
          }
        />
      ) : (
        <>
          <div className="cartao mb-4 grid gap-4 p-4 sm:grid-cols-2">
            <Campo rotulo="Conta">
              <select
                className={classeInput}
                value={contaId}
                onChange={(e) => trocarConta(e.target.value)}
              >
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-texto">Mês</span>
              <div className="flex items-center justify-between rounded-lg border border-borda px-1 py-0.5">
                <button
                  onClick={() => setMes(deslocarMes(mes, -1))}
                  aria-label="Mês anterior"
                  className="rounded p-1.5 text-texto-suave hover:bg-fundo"
                >
                  <IconeSeta direcao="esquerda" className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium text-texto">{rotuloMesLongo(mes)}</span>
                <button
                  onClick={() => setMes(deslocarMes(mes, 1))}
                  aria-label="Próximo mês"
                  className="rounded p-1.5 text-texto-suave hover:bg-fundo"
                >
                  <IconeSeta direcao="direita" className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <Mensagem texto={mensagemConciliacao} />

          {/* Conciliação do extrato importado */}
          {itensConciliacao && (
            <div className="cartao mb-6 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borda bg-fundo/60 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-texto">
                    Conciliação do extrato importado — {conta?.nome}
                  </p>
                  <p className="text-xs text-texto-suave">
                    {totalConciliado} de {itensConciliacao.length} lançamentos já conciliados
                  </p>
                </div>
                <button
                  onClick={() => setItensConciliacao(null)}
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
                                  setFormLancamento({
                                    ...formLancamento,
                                    subcategoria_id: e.target.value,
                                  })
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
                              onChange={(e) =>
                                setFormLancamento({ ...formLancamento, escopo: e.target.value })
                              }
                            >
                              <option value="familiar">Familiar (todos veem)</option>
                              <option value="pessoal">Pessoal (só eu vejo)</option>
                            </select>
                          </Campo>

                          <div className="flex justify-end gap-2 border-t border-borda pt-3">
                            <BotaoSecundario type="button" onClick={cancelarSalvarLinha}>
                              Cancelar
                            </BotaoSecundario>
                            <BotaoPrimario
                              type="button"
                              disabled={salvandoLinha}
                              onClick={() => salvarLinhaComoLancamento(item)}
                            >
                              {salvandoLinha ? 'Salvando...' : 'Salvar lançamento'}
                            </BotaoPrimario>
                          </div>
                        </div>
                      </li>
                    )
                  }

                  return (
                    <li
                      key={item.chave}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
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

          {/* Resumo do período */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Saldo anterior</p>
              <p className="whitespace-nowrap text-base font-semibold text-texto">
                {moeda(saldoAnterior)}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Entradas</p>
              <p className="whitespace-nowrap text-base font-semibold text-receita">
                {moeda(entradas)}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Saídas</p>
              <p className="whitespace-nowrap text-base font-semibold text-despesa">
                {moeda(saidas)}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Saldo final</p>
              <p
                className={`whitespace-nowrap text-base font-semibold ${
                  saldoFinal >= 0 ? 'text-texto' : 'text-despesa'
                }`}
              >
                {moeda(saldoFinal)}
              </p>
            </div>
          </div>

          {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

          {!carregando && linhas.length === 0 && (
            <EstadoVazio
              titulo="Nenhuma movimentação neste mês"
              descricao={`A conta não teve entradas nem saídas em ${rotuloMesLongo(mes).toLowerCase()}.`}
            />
          )}

          {!carregando && linhas.length > 0 && (
            <div className="cartao overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-borda bg-fundo/60 text-left text-xs text-texto-suave">
                    <th className="p-3 font-medium">Data</th>
                    <th className="p-3 font-medium">Descrição</th>
                    <th className="p-3 text-right font-medium">Valor</th>
                    <th className="p-3 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {linhas.map((l) => {
                    const receita = l.tipo === 'receita'
                    return (
                      <tr key={l.id}>
                        <td className="whitespace-nowrap p-3 text-texto-suave">{dataBR(l.data)}</td>
                        <td className="p-3">
                          <p className="text-texto">{l.descricao}</p>
                          <p className="text-xs text-texto-suave">
                            {l.transferencia_id
                              ? 'Transferência'
                              : (l.categorias?.nome ?? 'Sem categoria')}
                          </p>
                        </td>
                        <td
                          className={`whitespace-nowrap p-3 text-right font-medium ${
                            receita ? 'text-receita' : 'text-despesa'
                          }`}
                        >
                          {receita ? '+' : '−'} {moeda(l.valor)}
                        </td>
                        <td
                          className={`whitespace-nowrap p-3 text-right font-semibold ${
                            l.saldoApos >= 0 ? 'text-texto' : 'text-despesa'
                          }`}
                        >
                          {moeda(l.saldoApos)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Pagina>
  )
}
