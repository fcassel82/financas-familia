'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { dataBR, hojeISO, moeda } from '@/lib/formato'
import { IconeBanco, IconeLixeira, IconeMais, IconeSeta } from '@/components/Icones'
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

type Conta = { id: string; nome: string; cor: string | null }

type Movimento = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  conta_id: string | null
  transferencia_id: string
}

type Transferencia = {
  id: string
  data: string
  descricao: string
  valor: number
  origem: Conta | null
  destino: Conta | null
}

export default function TransferenciasPage() {
  const [contas, setContas] = useState<Conta[]>([])
  const [transferencias, setTransferencias] = useState<Transferencia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [form, setForm] = useState({
    origem_id: '',
    destino_id: '',
    valor: '',
    data: hojeISO(),
    descricao: '',
  })

  const carregar = useCallback(async () => {
    const [{ data: contasData }, { data: movimentos }] = await Promise.all([
      supabase.from('contas').select('id, nome, cor').eq('ativo', true).order('nome'),
      supabase
        .from('transacoes')
        .select('id, data, descricao, valor, tipo, conta_id, transferencia_id')
        .not('transferencia_id', 'is', null)
        .order('data', { ascending: false }),
    ])

    const listaContas = (contasData ?? []) as Conta[]
    setContas(listaContas)

    // Cada transferência tem duas linhas; junta pelo transferencia_id
    const porId = new Map<string, Movimento[]>()
    for (const m of (movimentos ?? []) as Movimento[]) {
      if (!porId.has(m.transferencia_id)) porId.set(m.transferencia_id, [])
      porId.get(m.transferencia_id)!.push(m)
    }

    const agrupadas: Transferencia[] = []
    for (const [id, partes] of porId) {
      const saida = partes.find((p) => p.tipo === 'despesa')
      const entrada = partes.find((p) => p.tipo === 'receita')
      if (!saida && !entrada) continue
      const referencia = saida ?? entrada!
      agrupadas.push({
        id,
        data: referencia.data,
        descricao: referencia.descricao,
        valor: Number(referencia.valor),
        origem: listaContas.find((c) => c.id === saida?.conta_id) ?? null,
        destino: listaContas.find((c) => c.id === entrada?.conta_id) ?? null,
      })
    }
    agrupadas.sort((a, b) => b.data.localeCompare(a.data))

    setTransferencias(agrupadas)
    setCarregando(false)
  }, [])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  function abrirNova() {
    setForm({
      origem_id: contas[0]?.id ?? '',
      destino_id: contas[1]?.id ?? '',
      valor: '',
      data: hojeISO(),
      descricao: '',
    })
    setMensagem('')
    setModalAberto(true)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setMensagem('')

    if (form.origem_id === form.destino_id) {
      setMensagem('Erro: a conta de origem e a de destino precisam ser diferentes.')
      return
    }

    const valor = parseFloat(form.valor || '0')
    if (valor <= 0) {
      setMensagem('Erro: informe um valor maior que zero.')
      return
    }

    setSalvando(true)

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id
    const transferenciaId = crypto.randomUUID()

    const nomeOrigem = contas.find((c) => c.id === form.origem_id)?.nome ?? ''
    const nomeDestino = contas.find((c) => c.id === form.destino_id)?.nome ?? ''
    const descricao = form.descricao || `Transferência: ${nomeOrigem} → ${nomeDestino}`

    const base = {
      data: form.data,
      descricao,
      valor,
      escopo: 'familiar',
      status: 'pago',
      transferencia_id: transferenciaId,
      dono_id: userId,
      lancado_por: userId,
    }

    const { error } = await supabase.from('transacoes').insert([
      { ...base, tipo: 'despesa', conta_id: form.origem_id },
      { ...base, tipo: 'receita', conta_id: form.destino_id },
    ])

    setSalvando(false)

    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }

    setModalAberto(false)
    carregar()
  }

  async function apagar(t: Transferencia) {
    if (
      !window.confirm(
        `Apagar a transferência de ${moeda(t.valor)}?\n\nAs duas pontas (saída e entrada) serão removidas.`
      )
    )
      return

    const { error } = await supabase.from('transacoes').delete().eq('transferencia_id', t.id)
    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    carregar()
  }

  const poucasContas = contas.length < 2

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Transferências"
        descricao="Dinheiro movido entre suas próprias contas. Não conta como receita nem despesa nos relatórios."
        acao={
          <BotaoPrimario onClick={abrirNova} disabled={poucasContas}>
            <IconeMais className="h-4 w-4" />
            Nova transferência
          </BotaoPrimario>
        }
      />

      {poucasContas && !carregando && (
        <EstadoVazio
          titulo="É preciso ter pelo menos duas contas"
          descricao="Cadastre outra conta para poder transferir valores entre elas."
          acao={
            <a
              href="/contas"
              className="inline-flex items-center gap-2 rounded-lg bg-primaria px-4 py-2.5 text-sm font-semibold text-white hover:bg-primaria-escura"
            >
              Cadastrar conta
            </a>
          }
        />
      )}

      <Mensagem texto={mensagem} />

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {!carregando && !poucasContas && transferencias.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma transferência registrada"
          descricao="Use esta tela quando mover dinheiro de uma conta sua para outra."
          acao={<BotaoPrimario onClick={abrirNova}>Registrar transferência</BotaoPrimario>}
        />
      )}

      {!carregando && transferencias.length > 0 && (
        <div className="cartao divide-y divide-borda">
          {transferencias.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-texto">{t.descricao}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-texto-suave">
                  <span>{dataBR(t.data)}</span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: t.origem?.cor ?? 'var(--borda)' }}
                    />
                    {t.origem?.nome ?? 'Conta removida'}
                  </span>
                  <IconeSeta direcao="direita" className="h-3 w-3" />
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: t.destino?.cor ?? 'var(--borda)' }}
                    />
                    {t.destino?.nome ?? 'Conta removida'}
                  </span>
                </div>
              </div>

              <span className="whitespace-nowrap text-sm font-semibold text-texto">
                {moeda(t.valor)}
              </span>

              <button
                onClick={() => apagar(t)}
                aria-label="Apagar transferência"
                className="rounded p-1.5 text-texto-suave transition-colors hover:bg-despesa/10 hover:text-despesa"
              >
                <IconeLixeira className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal aberto={modalAberto} titulo="Nova transferência" onFechar={() => setModalAberto(false)}>
        <form onSubmit={salvar} className="space-y-4">
          <Campo rotulo="De (origem)">
            <select
              className={classeInput}
              value={form.origem_id}
              onChange={(e) => setForm({ ...form, origem_id: e.target.value })}
              required
            >
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>

          <div className="flex justify-center text-texto-suave">
            <IconeBanco className="h-5 w-5" />
          </div>

          <Campo rotulo="Para (destino)">
            <select
              className={classeInput}
              value={form.destino_id}
              onChange={(e) => setForm({ ...form, destino_id: e.target.value })}
              required
            >
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Valor (R$)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                required
              />
            </Campo>
            <Campo rotulo="Data">
              <input
                type="date"
                className={classeInput}
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                required
              />
            </Campo>
          </div>

          <Campo rotulo="Descrição (opcional)">
            <input
              className={classeInput}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="Deixe em branco para gerar automaticamente"
            />
          </Campo>

          <Mensagem texto={mensagem} />

          <div className="flex justify-end gap-2 pt-2">
            <BotaoSecundario type="button" onClick={() => setModalAberto(false)}>
              Cancelar
            </BotaoSecundario>
            <BotaoPrimario type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Transferir'}
            </BotaoPrimario>
          </div>
        </form>
      </Modal>
    </Pagina>
  )
}
