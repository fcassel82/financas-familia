'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { dataBR, hojeISO, moeda, normalizar } from '@/lib/formato'
import { IconeDivida, IconeLixeira, IconeMais } from '@/components/Icones'
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

type Divida = {
  id: string
  nome: string
  tipo: string
  credor: string | null
  valor_total: number | null
  saldo_devedor: number
  valor_parcela: number | null
  parcelas_total: number | null
  parcelas_pagas: number
  taxa_juros_am: number | null
  data_inicio: string | null
  data_fim: string | null
  imovel_id: string | null
  veiculo_id: string | null
  quitada: boolean
  observacoes: string | null
  escopo: string
}

type Opcao = { id: string; nome: string }

const TIPOS: { valor: string; rotulo: string }[] = [
  { valor: 'financiamento_imovel', rotulo: 'Financiamento de imóvel' },
  { valor: 'financiamento_veiculo', rotulo: 'Financiamento de veículo' },
  { valor: 'emprestimo', rotulo: 'Empréstimo' },
  { valor: 'consorcio', rotulo: 'Consórcio' },
  { valor: 'outro', rotulo: 'Outro' },
]

const FORM_VAZIO = {
  nome: '',
  tipo: 'financiamento_imovel',
  credor: '',
  valor_total: '',
  saldo_devedor: '',
  valor_parcela: '',
  parcelas_total: '',
  parcelas_pagas: '0',
  taxa_juros_am: '',
  data_inicio: hojeISO(),
  data_fim: '',
  imovel_id: '',
  veiculo_id: '',
  quitada: false,
  observacoes: '',
  escopo: 'familiar',
}

function numeroOuNulo(valor: string): number | null {
  if (!valor.trim()) return null
  const n = parseFloat(valor.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function inteiroOuNulo(valor: string): number | null {
  if (!valor.trim()) return null
  const n = parseInt(valor, 10)
  return Number.isFinite(n) ? n : null
}

export default function DividasPage() {
  const [dividas, setDividas] = useState<Divida[]>([])
  const [imoveis, setImoveis] = useState<Opcao[]>([])
  const [veiculos, setVeiculos] = useState<Opcao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [mostrarQuitadas, setMostrarQuitadas] = useState(false)
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const carregar = useCallback(async () => {
    const [{ data: dividasData }, { data: imoveisData }, { data: veiculosData }] = await Promise.all([
      supabase.from('dividas').select('*').order('nome'),
      supabase.from('imoveis').select('id, nome').order('nome'),
      supabase.from('veiculos').select('id, nome').eq('ativo', true).order('nome'),
    ])
    setDividas((dividasData ?? []) as Divida[])
    setImoveis((imoveisData ?? []) as Opcao[])
    setVeiculos((veiculosData ?? []) as Opcao[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim())
    return dividas
      .filter((d) => mostrarQuitadas || !d.quitada)
      .filter((d) => !termo || normalizar(`${d.nome} ${d.credor ?? ''}`).includes(termo))
  }, [dividas, busca, mostrarQuitadas])

  const totais = useMemo(() => {
    const emAberto = dividas.filter((d) => !d.quitada)
    return {
      saldo: emAberto.reduce((s, d) => s + Number(d.saldo_devedor), 0),
      parcelaMes: emAberto.reduce((s, d) => s + Number(d.valor_parcela ?? 0), 0),
      quantidade: emAberto.length,
    }
  }, [dividas])

  function abrirNovo() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setMensagem('')
    setModalAberto(true)
  }

  function abrirEdicao(d: Divida) {
    setEditandoId(d.id)
    setForm({
      nome: d.nome,
      tipo: d.tipo,
      credor: d.credor ?? '',
      valor_total: d.valor_total != null ? String(d.valor_total) : '',
      saldo_devedor: String(d.saldo_devedor),
      valor_parcela: d.valor_parcela != null ? String(d.valor_parcela) : '',
      parcelas_total: d.parcelas_total != null ? String(d.parcelas_total) : '',
      parcelas_pagas: String(d.parcelas_pagas),
      taxa_juros_am: d.taxa_juros_am != null ? String(d.taxa_juros_am) : '',
      data_inicio: d.data_inicio ?? hojeISO(),
      data_fim: d.data_fim ?? '',
      imovel_id: d.imovel_id ?? '',
      veiculo_id: d.veiculo_id ?? '',
      quitada: d.quitada,
      observacoes: d.observacoes ?? '',
      escopo: d.escopo,
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
      credor: form.credor || null,
      valor_total: numeroOuNulo(form.valor_total),
      saldo_devedor: parseFloat(form.saldo_devedor || '0'),
      valor_parcela: numeroOuNulo(form.valor_parcela),
      parcelas_total: inteiroOuNulo(form.parcelas_total),
      parcelas_pagas: inteiroOuNulo(form.parcelas_pagas) ?? 0,
      taxa_juros_am: numeroOuNulo(form.taxa_juros_am),
      data_inicio: form.data_inicio || null,
      data_fim: form.data_fim || null,
      // Só faz sentido vincular ao bem correspondente ao tipo escolhido
      imovel_id: form.tipo === 'financiamento_imovel' ? form.imovel_id || null : null,
      veiculo_id: form.tipo === 'financiamento_veiculo' ? form.veiculo_id || null : null,
      quitada: form.quitada,
      observacoes: form.observacoes || null,
      escopo: form.escopo,
    }

    const { error } = editandoId
      ? await supabase.from('dividas').update(registro).eq('id', editandoId)
      : await supabase.from('dividas').insert({ ...registro, dono_id: userId })

    setSalvando(false)
    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }

    setModalAberto(false)
    carregar()
  }

  async function apagar(d: Divida) {
    if (!window.confirm(`Apagar a dívida "${d.nome}"?\n\nEsta ação não pode ser desfeita.`)) return
    const { error } = await supabase.from('dividas').delete().eq('id', d.id)
    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    carregar()
  }

  const rotuloTipo = (valor: string) => TIPOS.find((t) => t.valor === valor)?.rotulo ?? valor

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Dívidas e Financiamentos"
        descricao="O que ainda falta pagar. Este saldo é o passivo do seu patrimônio líquido."
        acao={
          <BotaoPrimario onClick={abrirNovo}>
            <IconeMais className="h-4 w-4" />
            Nova dívida
          </BotaoPrimario>
        }
      />

      {dividas.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Saldo devedor total</p>
              <p className="whitespace-nowrap text-base font-semibold text-despesa sm:text-lg">
                {moeda(totais.saldo)}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Parcelas por mês</p>
              <p className="whitespace-nowrap text-base font-semibold text-texto sm:text-lg">
                {moeda(totais.parcelaMes)}
              </p>
            </div>
            <div className="cartao col-span-2 p-3 lg:col-span-1">
              <p className="text-xs text-texto-suave">Dívidas em aberto</p>
              <p className="whitespace-nowrap text-base font-semibold text-texto sm:text-lg">
                {totais.quantidade}
              </p>
            </div>
          </div>

          <div className="cartao mb-4 space-y-3 p-4">
            <input
              className={classeInput}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou credor..."
              aria-label="Busca rápida"
            />
            <label className="flex items-center gap-2 text-sm text-texto">
              <input
                type="checkbox"
                checked={mostrarQuitadas}
                onChange={(e) => setMostrarQuitadas(e.target.checked)}
              />
              Mostrar também as já quitadas
            </label>
          </div>
        </>
      )}

      <Mensagem texto={mensagem} />

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {!carregando && dividas.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma dívida cadastrada"
          descricao="Cadastre financiamentos e empréstimos para que o patrimônio líquido desconte o que você ainda deve."
          acao={<BotaoPrimario onClick={abrirNovo}>Cadastrar primeira dívida</BotaoPrimario>}
        />
      )}

      {!carregando && dividas.length > 0 && visiveis.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma dívida em aberto"
          descricao="Marque a caixa acima para ver também as que já foram quitadas."
        />
      )}

      {!carregando && visiveis.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {visiveis.map((divida) => {
            const total = Number(divida.valor_total ?? 0)
            const pago = total > 0 ? Math.min(100, ((total - Number(divida.saldo_devedor)) / total) * 100) : 0
            const bemVinculado =
              imoveis.find((i) => i.id === divida.imovel_id)?.nome ??
              veiculos.find((v) => v.id === divida.veiculo_id)?.nome ??
              null

            return (
              <div key={divida.id} className="cartao p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-despesa/10 text-despesa">
                      <IconeDivida className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-texto">{divida.nome}</p>
                      <p className="truncate text-xs text-texto-suave">
                        {rotuloTipo(divida.tipo)}
                        {divida.credor ? ` · ${divida.credor}` : ''}
                        {bemVinculado ? ` · ${bemVinculado}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => apagar(divida)}
                    aria-label={`Apagar ${divida.nome}`}
                    className="rounded p-1.5 text-texto-suave transition-colors hover:bg-despesa/10 hover:text-despesa"
                  >
                    <IconeLixeira className="h-4 w-4" />
                  </button>
                </div>

                {divida.quitada ? (
                  <p className="rounded-lg bg-receita/10 px-3 py-2 text-sm font-medium text-receita">
                    Quitada
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 border-t border-borda pt-3">
                      <div>
                        <p className="text-xs text-texto-suave">Saldo devedor</p>
                        <p className="whitespace-nowrap font-semibold text-despesa">
                          {moeda(divida.saldo_devedor)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-texto-suave">Parcela</p>
                        <p className="whitespace-nowrap font-semibold text-texto">
                          {divida.valor_parcela != null ? moeda(divida.valor_parcela) : '—'}
                        </p>
                      </div>
                    </div>

                    {total > 0 && (
                      <div className="mt-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-fundo">
                          <div
                            className="h-full rounded-full bg-receita transition-all"
                            style={{ width: `${pago}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-texto-suave">
                          {pago.toFixed(0)}% quitado de {moeda(total)}
                          {divida.parcelas_total
                            ? ` · parcela ${divida.parcelas_pagas}/${divida.parcelas_total}`
                            : ''}
                        </p>
                      </div>
                    )}

                    {divida.data_fim && (
                      <p className="mt-2 text-xs text-texto-suave">
                        Última parcela em {dataBR(divida.data_fim)}
                      </p>
                    )}
                  </>
                )}

                <button
                  onClick={() => abrirEdicao(divida)}
                  className="mt-3 text-xs font-medium text-primaria hover:underline"
                >
                  Editar
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        aberto={modalAberto}
        titulo={editandoId ? 'Editar dívida' : 'Nova dívida'}
        onFechar={() => setModalAberto(false)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <Campo rotulo="Nome">
            <input
              className={classeInput}
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Financiamento da casa"
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
            <Campo rotulo="Credor">
              <input
                className={classeInput}
                value={form.credor}
                onChange={(e) => setForm({ ...form, credor: e.target.value })}
                placeholder="Ex: Caixa, Itaú"
              />
            </Campo>
          </div>

          {form.tipo === 'financiamento_imovel' && imoveis.length > 0 && (
            <Campo rotulo="Imóvel financiado">
              <select
                className={classeInput}
                value={form.imovel_id}
                onChange={(e) => setForm({ ...form, imovel_id: e.target.value })}
              >
                <option value="">Nenhum</option>
                {imoveis.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          {form.tipo === 'financiamento_veiculo' && veiculos.length > 0 && (
            <Campo rotulo="Veículo financiado">
              <select
                className={classeInput}
                value={form.veiculo_id}
                onChange={(e) => setForm({ ...form, veiculo_id: e.target.value })}
              >
                <option value="">Nenhum</option>
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Valor total financiado (R$)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={form.valor_total}
                onChange={(e) => setForm({ ...form, valor_total: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Saldo devedor hoje (R$)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={form.saldo_devedor}
                onChange={(e) => setForm({ ...form, saldo_devedor: e.target.value })}
                required
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Valor da parcela (R$)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={form.valor_parcela}
                onChange={(e) => setForm({ ...form, valor_parcela: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Parcelas pagas">
              <input
                type="number"
                className={classeInput}
                value={form.parcelas_pagas}
                onChange={(e) => setForm({ ...form, parcelas_pagas: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Total de parcelas">
              <input
                type="number"
                className={classeInput}
                value={form.parcelas_total}
                onChange={(e) => setForm({ ...form, parcelas_total: e.target.value })}
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Juros (% ao mês)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={form.taxa_juros_am}
                onChange={(e) => setForm({ ...form, taxa_juros_am: e.target.value })}
                placeholder="0,89"
              />
            </Campo>
            <Campo rotulo="Início">
              <input
                type="date"
                className={classeInput}
                value={form.data_inicio}
                onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Última parcela">
              <input
                type="date"
                className={classeInput}
                value={form.data_fim}
                onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
              />
            </Campo>
          </div>

          <div className="rounded-lg border border-borda p-3">
            <label className="flex items-center gap-2 text-sm text-texto">
              <input
                type="checkbox"
                checked={form.quitada}
                onChange={(e) => setForm({ ...form, quitada: e.target.checked })}
              />
              Já está quitada
            </label>
            <p className="mt-1.5 text-xs text-texto-suave">
              Quitada sai do passivo e para de descontar do patrimônio líquido.
            </p>
          </div>

          <Campo rotulo="Observações">
            <textarea
              className={classeInput}
              rows={2}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
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
