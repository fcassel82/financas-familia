'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { moeda } from '@/lib/formato'
import { IconeBanco, IconeLixeira, IconeMais } from '@/components/Icones'
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

type Conta = {
  id: string
  nome: string
  tipo: string
  instituicao: string | null
  saldo_inicial: number
  cor: string | null
  ativo: boolean
  escopo: string
  dono_id: string
}

const TIPOS: { valor: string; rotulo: string }[] = [
  { valor: 'corrente', rotulo: 'Conta corrente' },
  { valor: 'poupanca', rotulo: 'Poupança' },
  { valor: 'carteira', rotulo: 'Carteira (dinheiro)' },
  { valor: 'investimento', rotulo: 'Conta de investimento' },
  { valor: 'outro', rotulo: 'Outro' },
]

const CORES = ['#2a78d6', '#159d76', '#eb6834', '#7c4dcc', '#d98324', '#dc4c4c', '#1c3a52']

const FORM_VAZIO = {
  nome: '',
  tipo: 'corrente',
  instituicao: '',
  saldo_inicial: '',
  cor: CORES[0],
  escopo: 'familiar',
}

export default function ContasPage() {
  const [contas, setContas] = useState<Conta[]>([])
  const [saldos, setSaldos] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const [{ data: contasData }, { data: movimentos }] = await Promise.all([
      supabase.from('contas').select('*').order('nome'),
      supabase.from('transacoes').select('conta_id, valor, tipo').eq('status', 'pago'),
    ])

    const lista = (contasData ?? []) as Conta[]
    setContas(lista)

    const acumulado: Record<string, number> = {}
    for (const conta of lista) acumulado[conta.id] = Number(conta.saldo_inicial)
    for (const m of movimentos ?? []) {
      if (!m.conta_id || !(m.conta_id in acumulado)) continue
      acumulado[m.conta_id] += m.tipo === 'receita' ? Number(m.valor) : -Number(m.valor)
    }
    setSaldos(acumulado)
    setCarregando(false)
  }, [])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  function abrirNova() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setMensagem('')
    setModalAberto(true)
  }

  function abrirEdicao(conta: Conta) {
    setEditandoId(conta.id)
    setForm({
      nome: conta.nome,
      tipo: conta.tipo,
      instituicao: conta.instituicao ?? '',
      saldo_inicial: String(conta.saldo_inicial),
      cor: conta.cor ?? CORES[0],
      escopo: conta.escopo,
    })
    setMensagem('')
    setModalAberto(true)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setMensagem('')

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    const registro = {
      nome: form.nome,
      tipo: form.tipo,
      instituicao: form.instituicao || null,
      saldo_inicial: parseFloat(form.saldo_inicial || '0'),
      cor: form.cor,
      escopo: form.escopo,
    }

    const { error } = editandoId
      ? await supabase.from('contas').update(registro).eq('id', editandoId)
      : await supabase.from('contas').insert({ ...registro, dono_id: userId })

    setSalvando(false)

    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }

    setModalAberto(false)
    carregar()
  }

  async function apagar(conta: Conta) {
    const confirmado = window.confirm(
      `Apagar a conta "${conta.nome}"?\n\nOs lançamentos ligados a ela NÃO serão apagados — apenas ficarão sem conta.`
    )
    if (!confirmado) return

    const { error } = await supabase.from('contas').delete().eq('id', conta.id)
    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    carregar()
  }

  const saldoTotal = contas.reduce((soma, c) => soma + (saldos[c.id] ?? 0), 0)

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Contas"
        descricao="Contas correntes, poupanças e carteiras usadas nos lançamentos."
        acao={
          <BotaoPrimario onClick={abrirNova}>
            <IconeMais className="h-4 w-4" />
            Nova conta
          </BotaoPrimario>
        }
      />

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {!carregando && contas.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma conta cadastrada"
          descricao="Cadastre suas contas para acompanhar o saldo de cada uma e classificar melhor os lançamentos."
          acao={<BotaoPrimario onClick={abrirNova}>Cadastrar primeira conta</BotaoPrimario>}
        />
      )}

      {!carregando && contas.length > 0 && (
        <>
          <div className="cartao mb-5 flex items-center justify-between p-4">
            <span className="text-sm text-texto-suave">Saldo somado de todas as contas</span>
            <span
              className={`whitespace-nowrap text-xl font-bold ${saldoTotal >= 0 ? 'text-receita' : 'text-despesa'}`}
            >
              {moeda(saldoTotal)}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {contas.map((conta) => {
              const saldo = saldos[conta.id] ?? 0
              return (
                <div key={conta.id} className="cartao p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: conta.cor ?? CORES[0] }}
                      >
                        <IconeBanco className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-medium text-texto">{conta.nome}</p>
                        <p className="text-xs text-texto-suave">
                          {TIPOS.find((t) => t.valor === conta.tipo)?.rotulo ?? conta.tipo}
                          {conta.escopo === 'pessoal' ? ' · Pessoal' : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => apagar(conta)}
                      aria-label={`Apagar ${conta.nome}`}
                      className="rounded p-1.5 text-texto-suave transition-colors hover:bg-despesa/10 hover:text-despesa"
                    >
                      <IconeLixeira className="h-4 w-4" />
                    </button>
                  </div>

                  <p className={`text-lg font-semibold ${saldo >= 0 ? 'text-texto' : 'text-despesa'}`}>
                    {moeda(saldo)}
                  </p>

                  <button
                    onClick={() => abrirEdicao(conta)}
                    className="mt-3 text-xs font-medium text-primaria hover:underline"
                  >
                    Editar
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Modal
        aberto={modalAberto}
        titulo={editandoId ? 'Editar conta' : 'Nova conta'}
        onFechar={() => setModalAberto(false)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <Campo rotulo="Nome">
            <input
              className={classeInput}
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Conta Corrente Itaú"
              required
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Tipo">
              <select
                className={classeInput}
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              >
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo rotulo="Instituição (opcional)">
              <input
                className={classeInput}
                value={form.instituicao}
                onChange={(e) => setForm({ ...form, instituicao: e.target.value })}
                placeholder="Ex: Itaú, Nubank"
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Saldo inicial (R$)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={form.saldo_inicial}
                onChange={(e) => setForm({ ...form, saldo_inicial: e.target.value })}
                placeholder="0,00"
              />
            </Campo>

            <Campo rotulo="Visibilidade">
              <select
                className={classeInput}
                value={form.escopo}
                onChange={(e) => setForm({ ...form, escopo: e.target.value })}
              >
                <option value="familiar">Familiar (todos veem)</option>
                <option value="pessoal">Pessoal (só eu vejo)</option>
              </select>
            </Campo>
          </div>

          <Campo rotulo="Cor">
            <div className="flex flex-wrap gap-2">
              {CORES.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  aria-label={`Cor ${cor}`}
                  onClick={() => setForm({ ...form, cor })}
                  className={`h-8 w-8 rounded-full transition-transform ${
                    form.cor === cor ? 'scale-110 ring-2 ring-texto ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: cor }}
                />
              ))}
            </div>
          </Campo>

          <Mensagem texto={mensagem} />

          <div className="flex justify-end gap-2 pt-2">
            <BotaoSecundario type="button" onClick={() => setModalAberto(false)}>
              Cancelar
            </BotaoSecundario>
            <BotaoPrimario type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </BotaoPrimario>
          </div>
        </form>
      </Modal>
    </Pagina>
  )
}
