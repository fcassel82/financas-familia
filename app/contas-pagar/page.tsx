'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  dataBR,
  hojeISO,
  moeda,
  normalizar,
  situacaoVencimento,
  somarMeses,
  textoVencimento,
  type SituacaoVencimento,
} from '@/lib/formato'
import { IconeAlerta, IconeLixeira, IconeMais } from '@/components/Icones'
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

type Pendencia = {
  id: string
  descricao: string
  valor: number
  tipo: string
  escopo: string
  data_vencimento: string
  recorrencia_id: string | null
  categoria_id: string | null
  subcategoria_id: string | null
  fornecedor_id: string | null
  conta_id: string | null
  categorias: { nome: string } | null
  fornecedores: { nome: string } | null
}

type Categoria = { id: string; nome: string; tipo: string }
type Subcategoria = { id: string; categoria_id: string; nome: string }
type Conta = { id: string; nome: string }
type Fornecedor = { id: string; nome: string }

const FORM_VAZIO = {
  tipo: 'despesa',
  descricao: '',
  valor: '',
  data_vencimento: hojeISO(),
  categoria_id: '',
  subcategoria_id: '',
  fornecedor: '',
  conta_id: '',
  escopo: 'familiar',
  repetir: false,
  meses: '12',
}

const GRUPOS: { chave: SituacaoVencimento; rotulo: string; cor: string }[] = [
  { chave: 'vencida', rotulo: 'Vencidas', cor: 'text-despesa' },
  { chave: 'hoje', rotulo: 'Vencem hoje', cor: 'text-alerta' },
  { chave: 'proxima', rotulo: 'Próximos 7 dias', cor: 'text-alerta' },
  { chave: 'futura', rotulo: 'A vencer', cor: 'text-texto-suave' },
]

export default function ContasPagarPage() {
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [carregando, setCarregando] = useState(true)

  const [aba, setAba] = useState<'todas' | 'despesa' | 'receita'>('todas')
  const [busca, setBusca] = useState('')

  const [modalNova, setModalNova] = useState(false)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const [baixando, setBaixando] = useState<Pendencia | null>(null)
  const [formBaixa, setFormBaixa] = useState({ data: hojeISO(), valor: '', conta_id: '' })
  const [processandoBaixa, setProcessandoBaixa] = useState(false)

  const carregar = useCallback(async () => {
    const [{ data: pend }, { data: cats }, { data: subs }, { data: cts }, { data: forns }] =
      await Promise.all([
        supabase
          .from('transacoes')
          .select(
            'id, descricao, valor, tipo, escopo, data_vencimento, recorrencia_id, categoria_id, subcategoria_id, fornecedor_id, conta_id, categorias(nome), fornecedores(nome)'
          )
          .eq('status', 'pendente')
          .order('data_vencimento'),
        supabase.from('categorias').select('id, nome, tipo').order('nome'),
        supabase.from('subcategorias').select('id, categoria_id, nome').order('nome'),
        supabase.from('contas').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('fornecedores').select('id, nome').eq('ativo', true).order('nome'),
      ])

    setPendencias((pend ?? []) as unknown as Pendencia[])
    setCategorias((cats ?? []) as Categoria[])
    setSubcategorias((subs ?? []) as Subcategoria[])
    setContas((cts ?? []) as Conta[])
    setFornecedores((forns ?? []) as Fornecedor[])
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
    return pendencias
      .filter((p) => aba === 'todas' || p.tipo === aba)
      .filter(
        (p) =>
          !termo ||
          normalizar(`${p.descricao} ${p.categorias?.nome ?? ''} ${p.fornecedores?.nome ?? ''}`).includes(
            termo
          )
      )
  }, [pendencias, aba, busca])

  const porGrupo = useMemo(() => {
    const mapa = new Map<SituacaoVencimento, Pendencia[]>()
    for (const p of visiveis) {
      const s = situacaoVencimento(p.data_vencimento)
      if (!mapa.has(s)) mapa.set(s, [])
      mapa.get(s)!.push(p)
    }
    return mapa
  }, [visiveis])

  const totalPagar = visiveis
    .filter((p) => p.tipo === 'despesa')
    .reduce((s, p) => s + Number(p.valor), 0)
  const totalReceber = visiveis
    .filter((p) => p.tipo === 'receita')
    .reduce((s, p) => s + Number(p.valor), 0)
  const vencidas = visiveis.filter((p) => situacaoVencimento(p.data_vencimento) === 'vencida')

  /** Cria o fornecedor se o nome digitado ainda não existir */
  async function obterFornecedorId(nome: string, userId: string): Promise<string | null> {
    const limpo = nome.trim()
    if (!limpo) return null

    const existente = fornecedores.find((f) => normalizar(f.nome) === normalizar(limpo))
    if (existente) return existente.id

    const { data, error } = await supabase
      .from('fornecedores')
      .insert({ nome: limpo, dono_id: userId })
      .select('id')
      .single()

    if (error) return null
    return data.id
  }

  async function salvarNova(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setMensagem('')

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (!userId) {
      setMensagem('Erro: sessão expirada.')
      setSalvando(false)
      return
    }

    const fornecedorId = await obterFornecedorId(form.fornecedor, userId)

    const quantidade = form.repetir ? Math.max(1, parseInt(form.meses || '1', 10)) : 1
    const recorrenciaId = quantidade > 1 ? crypto.randomUUID() : null

    const registros = Array.from({ length: quantidade }, (_, i) => ({
      // 'data' guarda o vencimento enquanto está pendente; ao dar baixa passa a
      // ser a data do pagamento, que é o que os relatórios usam.
      data: somarMeses(form.data_vencimento, i),
      data_vencimento: somarMeses(form.data_vencimento, i),
      descricao: form.descricao,
      valor: parseFloat(form.valor),
      tipo: form.tipo,
      escopo: form.escopo,
      status: 'pendente',
      categoria_id: form.categoria_id || null,
      subcategoria_id: form.subcategoria_id || null,
      fornecedor_id: fornecedorId,
      conta_id: form.conta_id || null,
      recorrencia_id: recorrenciaId,
      dono_id: userId,
      lancado_por: userId,
    }))

    const { error } = await supabase.from('transacoes').insert(registros)
    setSalvando(false)

    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }

    setModalNova(false)
    setForm(FORM_VAZIO)
    carregar()
  }

  function abrirBaixa(p: Pendencia) {
    setBaixando(p)
    setFormBaixa({
      data: hojeISO(),
      valor: String(p.valor),
      conta_id: p.conta_id ?? contas[0]?.id ?? '',
    })
    setMensagem('')
  }

  async function confirmarBaixa(e: React.FormEvent) {
    e.preventDefault()
    if (!baixando) return

    setProcessandoBaixa(true)
    setMensagem('')

    const valorPago = parseFloat(formBaixa.valor || '0')
    const valorTotal = Number(baixando.valor)

    if (valorPago <= 0) {
      setMensagem('Informe um valor maior que zero.')
      setProcessandoBaixa(false)
      return
    }
    if (valorPago > valorTotal) {
      setMensagem('O valor da baixa não pode ser maior que o valor em aberto.')
      setProcessandoBaixa(false)
      return
    }

    if (valorPago === valorTotal) {
      // Baixa integral: a própria pendência vira um lançamento pago
      const { error } = await supabase
        .from('transacoes')
        .update({
          status: 'pago',
          data: formBaixa.data,
          conta_id: formBaixa.conta_id || null,
        })
        .eq('id', baixando.id)

      setProcessandoBaixa(false)
      if (error) {
        setMensagem('Erro ao dar baixa: ' + error.message)
        return
      }
    } else {
      // Baixa parcial: registra o valor pago e deixa o restante em aberto
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id

      const { error: erroInsert } = await supabase.from('transacoes').insert({
        data: formBaixa.data,
        descricao: `${baixando.descricao} (pagamento parcial)`,
        valor: valorPago,
        tipo: baixando.tipo,
        escopo: baixando.escopo,
        status: 'pago',
        categoria_id: baixando.categoria_id,
        subcategoria_id: baixando.subcategoria_id,
        fornecedor_id: baixando.fornecedor_id,
        conta_id: formBaixa.conta_id || null,
        dono_id: userId,
        lancado_por: userId,
      })

      if (erroInsert) {
        setProcessandoBaixa(false)
        setMensagem('Erro ao dar baixa: ' + erroInsert.message)
        return
      }

      const { error: erroUpdate } = await supabase
        .from('transacoes')
        .update({ valor: valorTotal - valorPago })
        .eq('id', baixando.id)

      setProcessandoBaixa(false)
      if (erroUpdate) {
        setMensagem('Erro ao atualizar o saldo em aberto: ' + erroUpdate.message)
        return
      }
    }

    setBaixando(null)
    carregar()
  }

  async function apagar(p: Pendencia) {
    const temSerie = !!p.recorrencia_id
    const mensagemConfirma = temSerie
      ? `Apagar "${p.descricao}"?\n\nOK apaga TODA a série de repetições ainda em aberto.\nCancelar não apaga nada.`
      : `Apagar "${p.descricao}"?\n\nEsta ação não pode ser desfeita.`

    if (!window.confirm(mensagemConfirma)) return

    const consulta = supabase.from('transacoes').delete().eq('status', 'pendente')
    const { error } = temSerie
      ? await consulta.eq('recorrencia_id', p.recorrencia_id)
      : await consulta.eq('id', p.id)

    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    carregar()
  }

  const categoriasFiltradas = categorias.filter((c) => c.tipo === form.tipo)
  const subcategoriasFiltradas = subcategorias.filter((s) => s.categoria_id === form.categoria_id)

  const classeAba = (valor: string) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
      aba === valor
        ? 'bg-primaria text-white'
        : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
    }`

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Contas a Pagar e Receber"
        descricao="Lançamentos com vencimento que ainda não foram pagos ou recebidos."
        acao={
          <BotaoPrimario onClick={() => { setForm(FORM_VAZIO); setMensagem(''); setModalNova(true) }}>
            <IconeMais className="h-4 w-4" />
            Nova conta
          </BotaoPrimario>
        }
      />

      {/* Alerta de vencidas */}
      {vencidas.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-despesa/30 bg-despesa/5 p-4">
          <IconeAlerta className="mt-0.5 h-5 w-5 shrink-0 text-despesa" />
          <div>
            <p className="text-sm font-semibold text-despesa">
              {vencidas.length} conta{vencidas.length > 1 ? 's' : ''} vencida
              {vencidas.length > 1 ? 's' : ''}
            </p>
            <p className="text-sm text-texto-suave">
              Total de {moeda(vencidas.reduce((s, p) => s + Number(p.valor), 0))} em atraso.
            </p>
          </div>
        </div>
      )}

      {/* Totais */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="cartao p-3">
          <p className="text-xs text-texto-suave">Total a pagar</p>
          <p className="whitespace-nowrap text-lg font-semibold text-despesa">{moeda(totalPagar)}</p>
        </div>
        <div className="cartao p-3">
          <p className="text-xs text-texto-suave">Total a receber</p>
          <p className="whitespace-nowrap text-lg font-semibold text-receita">
            {moeda(totalReceber)}
          </p>
        </div>
      </div>

      {/* Abas + busca */}
      <div className="cartao mb-4 space-y-3 p-4">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button onClick={() => setAba('todas')} className={classeAba('todas')}>
            Todas
          </button>
          <button onClick={() => setAba('despesa')} className={classeAba('despesa')}>
            A pagar
          </button>
          <button onClick={() => setAba('receita')} className={classeAba('receita')}>
            A receber
          </button>
        </div>
        <input
          className={classeInput}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por descrição, categoria ou fornecedor..."
          aria-label="Busca rápida"
        />
      </div>

      <Mensagem texto={mensagem} />

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {!carregando && visiveis.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma conta em aberto"
          descricao="Cadastre contas a pagar ou receber para acompanhar os vencimentos e receber lembretes na tela inicial."
          acao={
            <BotaoPrimario onClick={() => { setForm(FORM_VAZIO); setModalNova(true) }}>
              Cadastrar primeira conta
            </BotaoPrimario>
          }
        />
      )}

      {!carregando && visiveis.length > 0 && (
        <div className="space-y-5">
          {GRUPOS.map(({ chave, rotulo, cor }) => {
            const itens = porGrupo.get(chave)
            if (!itens?.length) return null
            return (
              <section key={chave}>
                <h2 className={`mb-2 text-sm font-semibold ${cor}`}>
                  {rotulo} · {itens.length}
                </h2>
                <div className="cartao divide-y divide-borda">
                  {itens.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-texto">{p.descricao}</p>
                        <p className="truncate text-xs text-texto-suave">
                          {dataBR(p.data_vencimento)} · {textoVencimento(p.data_vencimento)}
                          {p.categorias?.nome ? ` · ${p.categorias.nome}` : ''}
                          {p.fornecedores?.nome ? ` · ${p.fornecedores.nome}` : ''}
                          {p.recorrencia_id ? ' · repete' : ''}
                        </p>
                      </div>

                      <span
                        className={`whitespace-nowrap text-sm font-semibold ${
                          p.tipo === 'receita' ? 'text-receita' : 'text-despesa'
                        }`}
                      >
                        {moeda(p.valor)}
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => abrirBaixa(p)}
                          className="rounded-lg bg-primaria px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primaria-escura"
                        >
                          Dar baixa
                        </button>
                        <button
                          onClick={() => apagar(p)}
                          aria-label={`Apagar ${p.descricao}`}
                          className="rounded p-1.5 text-texto-suave transition-colors hover:bg-despesa/10 hover:text-despesa"
                        >
                          <IconeLixeira className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* ---------- Modal: nova conta ---------- */}
      <Modal aberto={modalNova} titulo="Nova conta a pagar / receber" onFechar={() => setModalNova(false)}>
        <form onSubmit={salvarNova} className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, tipo: 'despesa', categoria_id: '', subcategoria_id: '' })}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                form.tipo === 'despesa'
                  ? 'bg-despesa text-white'
                  : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
              }`}
            >
              A pagar
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, tipo: 'receita', categoria_id: '', subcategoria_id: '' })}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                form.tipo === 'receita'
                  ? 'bg-receita text-white'
                  : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
              }`}
            >
              A receber
            </button>
          </div>

          <Campo rotulo="Descrição">
            <input
              className={classeInput}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="Ex: Conta de luz"
              required
            />
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
            <Campo rotulo="Vencimento">
              <input
                type="date"
                className={classeInput}
                value={form.data_vencimento}
                onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })}
                required
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Categoria">
              <select
                className={classeInput}
                value={form.categoria_id}
                onChange={(e) =>
                  setForm({ ...form, categoria_id: e.target.value, subcategoria_id: '' })
                }
              >
                <option value="">Sem categoria</option>
                {categoriasFiltradas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Subcategoria">
              <select
                className={classeInput}
                value={form.subcategoria_id}
                onChange={(e) => setForm({ ...form, subcategoria_id: e.target.value })}
                disabled={!form.categoria_id}
              >
                <option value="">Nenhuma</option>
                {subcategoriasFiltradas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Fornecedor (opcional)">
              <input
                className={classeInput}
                list="lista-fornecedores"
                value={form.fornecedor}
                onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                placeholder="Ex: RGE, COMUSA"
              />
              <datalist id="lista-fornecedores">
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.nome} />
                ))}
              </datalist>
            </Campo>
            <Campo rotulo="Conta prevista">
              <select
                className={classeInput}
                value={form.conta_id}
                onChange={(e) => setForm({ ...form, conta_id: e.target.value })}
              >
                <option value="">Definir na baixa</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

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

          <div className="rounded-lg border border-borda p-3">
            <label className="flex items-center gap-2 text-sm text-texto">
              <input
                type="checkbox"
                checked={form.repetir}
                onChange={(e) => setForm({ ...form, repetir: e.target.checked })}
              />
              Repetir mensalmente
            </label>
            {form.repetir && (
              <div className="mt-3">
                <Campo rotulo="Quantidade de meses">
                  <input
                    type="number"
                    min="2"
                    max="120"
                    className={classeInput}
                    value={form.meses}
                    onChange={(e) => setForm({ ...form, meses: e.target.value })}
                  />
                </Campo>
                <p className="mt-1.5 text-xs text-texto-suave">
                  Serão criadas {form.meses || 0} contas, uma por mês, a partir de{' '}
                  {dataBR(form.data_vencimento)}.
                </p>
              </div>
            )}
          </div>

          <Mensagem texto={mensagem} />

          <div className="flex justify-end gap-2 pt-2">
            <BotaoSecundario type="button" onClick={() => setModalNova(false)}>
              Cancelar
            </BotaoSecundario>
            <BotaoPrimario type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </BotaoPrimario>
          </div>
        </form>
      </Modal>

      {/* ---------- Modal: dar baixa ---------- */}
      <Modal
        aberto={!!baixando}
        titulo={baixando?.tipo === 'receita' ? 'Registrar recebimento' : 'Registrar pagamento'}
        onFechar={() => setBaixando(null)}
      >
        {baixando && (
          <form onSubmit={confirmarBaixa} className="space-y-4">
            <div className="rounded-lg bg-fundo p-3">
              <p className="text-sm font-medium text-texto">{baixando.descricao}</p>
              <p className="text-xs text-texto-suave">
                Vencimento {dataBR(baixando.data_vencimento)} · em aberto {moeda(baixando.valor)}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo={baixando.tipo === 'receita' ? 'Data do recebimento' : 'Data do pagamento'}>
                <input
                  type="date"
                  className={classeInput}
                  value={formBaixa.data}
                  onChange={(e) => setFormBaixa({ ...formBaixa, data: e.target.value })}
                  required
                />
              </Campo>
              <Campo rotulo="Valor (R$)">
                <input
                  type="number"
                  step="0.01"
                  className={classeInput}
                  value={formBaixa.valor}
                  onChange={(e) => setFormBaixa({ ...formBaixa, valor: e.target.value })}
                  required
                />
              </Campo>
            </div>

            <Campo rotulo="Conta">
              <select
                className={classeInput}
                value={formBaixa.conta_id}
                onChange={(e) => setFormBaixa({ ...formBaixa, conta_id: e.target.value })}
              >
                <option value="">Nenhuma</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>

            {parseFloat(formBaixa.valor || '0') > 0 &&
              parseFloat(formBaixa.valor) < Number(baixando.valor) && (
                <p className="rounded-lg bg-alerta/10 px-3 py-2 text-xs text-alerta">
                  Baixa parcial: ficará{' '}
                  {moeda(Number(baixando.valor) - parseFloat(formBaixa.valor))} em aberto.
                </p>
              )}

            <Mensagem texto={mensagem} />

            <div className="flex justify-end gap-2 pt-2">
              <BotaoSecundario type="button" onClick={() => setBaixando(null)}>
                Cancelar
              </BotaoSecundario>
              <BotaoPrimario type="submit" disabled={processandoBaixa}>
                {processandoBaixa ? 'Registrando...' : 'Confirmar'}
              </BotaoPrimario>
            </div>
          </form>
        )}
      </Modal>
    </Pagina>
  )
}
