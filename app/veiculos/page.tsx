'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { dataBR, diasAte, hojeISO, moeda } from '@/lib/formato'
import { calcularConsumo, type AbastecimentoParaCalculo } from '@/lib/calculos'
import { IconeAlerta, IconeCarro, IconeLixeira, IconeMais } from '@/components/Icones'
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

type Veiculo = {
  id: string
  nome: string
  marca: string | null
  modelo: string | null
  placa: string | null
  ano: number | null
  combustivel: string | null
  cor: string | null
  escopo: string
}

type Abastecimento = AbastecimentoParaCalculo & { posto: string | null; transacao_id: string | null }

type Categoria = { id: string; nome: string; tipo: string }
type Subcategoria = { id: string; categoria_id: string; nome: string }
type Conta = { id: string; nome: string }
type Cartao = { id: string; nome: string }

type Manutencao = {
  id: string
  data: string
  odometro: number | null
  tipo: string
  descricao: string | null
  custo: number
  oficina: string | null
  proxima_data: string | null
  proximo_odometro: number | null
}

const CORES = ['#2a78d6', '#159d76', '#eb6834', '#7c4dcc', '#d98324', '#dc4c4c', '#1c3a52']
const TIPOS_MANUTENCAO = [
  'Troca de óleo',
  'Revisão',
  'Pneus',
  'Freios',
  'Alinhamento e balanceamento',
  'Bateria',
  'Filtros',
  'Suspensão',
  'Elétrica',
  'Funilaria',
  'Outro',
]

const FORM_VEICULO = {
  nome: '',
  marca: '',
  modelo: '',
  placa: '',
  ano: '',
  combustivel: 'flex',
  cor: CORES[0],
  escopo: 'familiar',
}

const FORM_ABASTECIMENTO = {
  data: hojeISO(),
  odometro: '',
  litros: '',
  valor_total: '',
  tanque_cheio: true,
  posto: '',
}

const FORM_LANCAMENTO = {
  descricao: '',
  categoria_id: '',
  subcategoria_id: '',
  pago_com: 'conta' as 'conta' | 'cartao',
  conta_id: '',
  cartao_id: '',
  escopo: 'pessoal',
}

const FORM_MANUTENCAO = {
  data: hojeISO(),
  odometro: '',
  tipo: TIPOS_MANUTENCAO[0],
  descricao: '',
  custo: '',
  oficina: '',
  proxima_data: '',
  proximo_odometro: '',
}

export default function VeiculosPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [veiculoId, setVeiculoId] = useState('')
  const [abastecimentos, setAbastecimentos] = useState<Abastecimento[]>([])
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<'combustivel' | 'manutencao'>('combustivel')
  const [mensagem, setMensagem] = useState('')

  const [modalVeiculo, setModalVeiculo] = useState(false)
  const [editandoVeiculo, setEditandoVeiculo] = useState<string | null>(null)
  const [formVeiculo, setFormVeiculo] = useState(FORM_VEICULO)
  const [modalAbastecimento, setModalAbastecimento] = useState(false)
  const [formAbastecimento, setFormAbastecimento] = useState(FORM_ABASTECIMENTO)
  const [modalManutencao, setModalManutencao] = useState(false)
  const [formManutencao, setFormManutencao] = useState(FORM_MANUTENCAO)
  const [salvando, setSalvando] = useState(false)

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [modalLancar, setModalLancar] = useState(false)
  const [abastecimentoParaLancar, setAbastecimentoParaLancar] = useState<Abastecimento | null>(
    null
  )
  const [formLancamento, setFormLancamento] = useState(FORM_LANCAMENTO)

  useEffect(() => {
    async function carregarVeiculos() {
      const { data } = await supabase.from('veiculos').select('*').eq('ativo', true).order('nome')
      const lista = (data ?? []) as Veiculo[]
      setVeiculos(lista)
      if (lista.length) setVeiculoId((atual) => atual || lista[0].id)
      else setCarregando(false)
    }
    carregarVeiculos()

    async function carregarListasLancamento() {
      const [{ data: cats }, { data: subs }, { data: cts }, { data: crts }] = await Promise.all([
        supabase.from('categorias').select('id, nome, tipo').eq('tipo', 'despesa').order('nome'),
        supabase.from('subcategorias').select('id, categoria_id, nome').order('nome'),
        supabase.from('contas').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('cartoes_credito').select('id, nome').eq('ativo', true).order('nome'),
      ])
      setCategorias((cats ?? []) as Categoria[])
      setSubcategorias((subs ?? []) as Subcategoria[])
      setContas((cts ?? []) as Conta[])
      setCartoes((crts ?? []) as Cartao[])
    }
    carregarListasLancamento()
  }, [])

  const carregar = useCallback(async () => {
    if (!veiculoId) return
    const [{ data: abast }, { data: manut }] = await Promise.all([
      supabase
        .from('abastecimentos')
        .select('id, data, odometro, litros, valor_total, tanque_cheio, posto, transacao_id')
        .eq('veiculo_id', veiculoId)
        .order('data', { ascending: false }),
      supabase
        .from('manutencoes')
        .select('*')
        .eq('veiculo_id', veiculoId)
        .order('data', { ascending: false }),
    ])
    setAbastecimentos((abast ?? []) as Abastecimento[])
    setManutencoes((manut ?? []) as Manutencao[])
    setCarregando(false)
  }, [veiculoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const comConsumo = useMemo(() => calcularConsumo(abastecimentos), [abastecimentos])

  const resumo = useMemo(() => {
    const comMedia = comConsumo.filter((a) => a.consumo !== null)
    const mediaConsumo =
      comMedia.length > 0
        ? comMedia.reduce((s, a) => s + (a.consumo ?? 0), 0) / comMedia.length
        : null

    const gastoCombustivel = abastecimentos.reduce((s, a) => s + Number(a.valor_total), 0)
    const gastoManutencao = manutencoes.reduce((s, m) => s + Number(m.custo), 0)

    const odometros = abastecimentos.map((a) => Number(a.odometro))
    const kmTotal =
      odometros.length > 1 ? Math.max(...odometros) - Math.min(...odometros) : 0

    return {
      mediaConsumo,
      gastoCombustivel,
      gastoManutencao,
      custoPorKm: kmTotal > 0 ? (gastoCombustivel + gastoManutencao) / kmTotal : null,
      odometroAtual: odometros.length ? Math.max(...odometros) : null,
    }
  }, [comConsumo, abastecimentos, manutencoes])

  /** Manutenções cuja próxima revisão está vencida ou perto (30 dias / 1000 km) */
  const alertas = useMemo(() => {
    return manutencoes.filter((m) => {
      if (m.proxima_data) {
        const dias = diasAte(m.proxima_data)
        if (dias <= 30) return true
      }
      if (m.proximo_odometro && resumo.odometroAtual) {
        if (resumo.odometroAtual >= Number(m.proximo_odometro) - 1000) return true
      }
      return false
    })
  }, [manutencoes, resumo.odometroAtual])

  async function salvarVeiculo(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setMensagem('')

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    const registro = {
      nome: formVeiculo.nome,
      marca: formVeiculo.marca || null,
      modelo: formVeiculo.modelo || null,
      placa: formVeiculo.placa || null,
      ano: formVeiculo.ano ? parseInt(formVeiculo.ano, 10) : null,
      combustivel: formVeiculo.combustivel,
      cor: formVeiculo.cor,
      escopo: formVeiculo.escopo,
    }

    const { data, error } = editandoVeiculo
      ? await supabase.from('veiculos').update(registro).eq('id', editandoVeiculo).select('id').single()
      : await supabase.from('veiculos').insert({ ...registro, dono_id: userId }).select('id').single()

    setSalvando(false)
    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }

    setModalVeiculo(false)
    const { data: lista } = await supabase.from('veiculos').select('*').eq('ativo', true).order('nome')
    setVeiculos((lista ?? []) as Veiculo[])
    if (!editandoVeiculo && data) setVeiculoId(data.id)
  }

  async function salvarAbastecimento(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setMensagem('')

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    const registro = {
      veiculo_id: veiculoId,
      data: formAbastecimento.data,
      odometro: parseFloat(formAbastecimento.odometro),
      litros: parseFloat(formAbastecimento.litros),
      valor_total: parseFloat(formAbastecimento.valor_total || '0'),
      tanque_cheio: formAbastecimento.tanque_cheio,
      posto: formAbastecimento.posto || null,
      dono_id: userId,
    }

    const { data: inserido, error } = await supabase
      .from('abastecimentos')
      .insert(registro)
      .select('id')
      .single()

    setSalvando(false)
    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }
    setModalAbastecimento(false)
    setFormAbastecimento(FORM_ABASTECIMENTO)
    carregar()

    // Pergunta se o valor pago deve virar um lançamento, com as mesmas
    // ferramentas da tela de Lançamentos (categoria, conta/cartão, escopo)
    abrirPerguntaLancamento({
      id: inserido.id,
      data: registro.data,
      odometro: registro.odometro,
      litros: registro.litros,
      valor_total: registro.valor_total,
      tanque_cheio: registro.tanque_cheio,
      posto: registro.posto,
      transacao_id: null,
    })
  }

  function abrirPerguntaLancamento(a: Abastecimento) {
    const nomeVeiculo = veiculos.find((v) => v.id === veiculoId)?.nome ?? ''
    setAbastecimentoParaLancar(a)
    setFormLancamento({
      ...FORM_LANCAMENTO,
      descricao: `Abastecimento${nomeVeiculo ? ' - ' + nomeVeiculo : ''}${a.posto ? ' (' + a.posto + ')' : ''}`,
    })
    setMensagem('')
    setModalLancar(true)
  }

  async function salvarLancamentoAbastecimento(e: React.FormEvent) {
    e.preventDefault()
    if (!abastecimentoParaLancar) return
    setSalvando(true)
    setMensagem('')

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    const { data: transacao, error: erroTransacao } = await supabase
      .from('transacoes')
      .insert({
        data: abastecimentoParaLancar.data,
        descricao: formLancamento.descricao,
        categoria_id: formLancamento.categoria_id || null,
        subcategoria_id: formLancamento.subcategoria_id || null,
        valor: abastecimentoParaLancar.valor_total,
        tipo: 'despesa',
        escopo: formLancamento.escopo,
        conta_id: formLancamento.pago_com === 'conta' ? formLancamento.conta_id || null : null,
        cartao_id: formLancamento.pago_com === 'cartao' ? formLancamento.cartao_id || null : null,
        dono_id: userId,
        lancado_por: userId,
      })
      .select('id')
      .single()

    if (erroTransacao) {
      setSalvando(false)
      setMensagem('Erro ao lançar: ' + erroTransacao.message)
      return
    }

    const { error: erroVinculo } = await supabase
      .from('abastecimentos')
      .update({ transacao_id: transacao.id })
      .eq('id', abastecimentoParaLancar.id)

    setSalvando(false)
    if (erroVinculo) {
      setMensagem('Lançamento criado, mas não foi possível vinculá-lo ao abastecimento: ' + erroVinculo.message)
      return
    }

    setModalLancar(false)
    setAbastecimentoParaLancar(null)
    carregar()
  }

  async function salvarManutencao(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setMensagem('')

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    const { error } = await supabase.from('manutencoes').insert({
      veiculo_id: veiculoId,
      data: formManutencao.data,
      odometro: formManutencao.odometro ? parseFloat(formManutencao.odometro) : null,
      tipo: formManutencao.tipo,
      descricao: formManutencao.descricao || null,
      custo: parseFloat(formManutencao.custo || '0'),
      oficina: formManutencao.oficina || null,
      proxima_data: formManutencao.proxima_data || null,
      proximo_odometro: formManutencao.proximo_odometro
        ? parseFloat(formManutencao.proximo_odometro)
        : null,
      dono_id: userId,
    })

    setSalvando(false)
    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }
    setModalManutencao(false)
    setFormManutencao(FORM_MANUTENCAO)
    carregar()
  }

  async function apagarManutencao(id: string) {
    if (!window.confirm('Apagar este registro?')) return
    const { error } = await supabase.from('manutencoes').delete().eq('id', id)
    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    carregar()
  }

  async function apagarAbastecimento(a: Abastecimento) {
    if (!window.confirm('Apagar este abastecimento?')) return

    if (a.transacao_id) {
      const apagarTambem = window.confirm(
        'Este abastecimento tem um lançamento financeiro vinculado.\n\nApagar o lançamento também? (Cancelar mantém o lançamento, só o abastecimento é apagado.)'
      )
      if (apagarTambem) {
        const { error: erroTransacao } = await supabase
          .from('transacoes')
          .delete()
          .eq('id', a.transacao_id)
        if (erroTransacao) {
          setMensagem('Erro ao apagar o lançamento: ' + erroTransacao.message)
          return
        }
      }
    }

    const { error } = await supabase.from('abastecimentos').delete().eq('id', a.id)
    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    carregar()
  }

  async function apagarVeiculo(v: Veiculo) {
    if (
      !window.confirm(
        `Apagar o veículo "${v.nome}"?\n\nTodo o histórico de abastecimentos e manutenções dele também será apagado.`
      )
    )
      return
    const { error } = await supabase.from('veiculos').delete().eq('id', v.id)
    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    const restantes = veiculos.filter((x) => x.id !== v.id)
    setVeiculos(restantes)
    setVeiculoId(restantes[0]?.id ?? '')
  }

  const veiculoAtual = veiculos.find((v) => v.id === veiculoId)

  const classeAba = (valor: string) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
      aba === valor
        ? 'bg-primaria text-white'
        : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
    }`

  if (!carregando && veiculos.length === 0) {
    return (
      <Pagina>
        <CabecalhoPagina titulo="Veículos" />
        <EstadoVazio
          titulo="Nenhum veículo cadastrado"
          descricao="Cadastre um veículo para acompanhar abastecimentos, consumo médio e manutenções."
          acao={
            <BotaoPrimario
              onClick={() => {
                setEditandoVeiculo(null)
                setFormVeiculo(FORM_VEICULO)
                setModalVeiculo(true)
              }}
            >
              Cadastrar veículo
            </BotaoPrimario>
          }
        />
        <ModalVeiculo />
      </Pagina>
    )
  }

  // Definido aqui para reaproveitar o mesmo modal no estado vazio e na tela cheia
  function ModalVeiculo() {
    return (
      <Modal
        aberto={modalVeiculo}
        titulo={editandoVeiculo ? 'Editar veículo' : 'Novo veículo'}
        onFechar={() => setModalVeiculo(false)}
      >
        <form onSubmit={salvarVeiculo} className="space-y-4">
          <Campo rotulo="Nome / apelido">
            <input
              className={classeInput}
              value={formVeiculo.nome}
              onChange={(e) => setFormVeiculo({ ...formVeiculo, nome: e.target.value })}
              placeholder="Ex: Corolla da família"
              required
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Marca">
              <input
                className={classeInput}
                value={formVeiculo.marca}
                onChange={(e) => setFormVeiculo({ ...formVeiculo, marca: e.target.value })}
                placeholder="Ex: Toyota"
              />
            </Campo>
            <Campo rotulo="Modelo">
              <input
                className={classeInput}
                value={formVeiculo.modelo}
                onChange={(e) => setFormVeiculo({ ...formVeiculo, modelo: e.target.value })}
                placeholder="Ex: Corolla XEi"
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Placa">
              <input
                className={classeInput}
                value={formVeiculo.placa}
                onChange={(e) =>
                  setFormVeiculo({ ...formVeiculo, placa: e.target.value.toUpperCase() })
                }
                placeholder="ABC1D23"
              />
            </Campo>
            <Campo rotulo="Ano">
              <input
                type="number"
                className={classeInput}
                value={formVeiculo.ano}
                onChange={(e) => setFormVeiculo({ ...formVeiculo, ano: e.target.value })}
                placeholder="2020"
              />
            </Campo>
            <Campo rotulo="Combustível">
              <select
                className={classeInput}
                value={formVeiculo.combustivel}
                onChange={(e) => setFormVeiculo({ ...formVeiculo, combustivel: e.target.value })}
              >
                <option value="flex">Flex</option>
                <option value="gasolina">Gasolina</option>
                <option value="etanol">Etanol</option>
                <option value="diesel">Diesel</option>
                <option value="gnv">GNV</option>
                <option value="eletrico">Elétrico</option>
              </select>
            </Campo>
          </div>

          <Campo rotulo="Cor no app">
            <div className="flex flex-wrap gap-2">
              {CORES.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  aria-label={`Cor ${cor}`}
                  onClick={() => setFormVeiculo({ ...formVeiculo, cor })}
                  className={`h-8 w-8 rounded-full transition-transform ${
                    formVeiculo.cor === cor ? 'scale-110 ring-2 ring-texto ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: cor }}
                />
              ))}
            </div>
          </Campo>

          <Mensagem texto={mensagem} />

          <div className="flex justify-end gap-2 pt-2">
            <BotaoSecundario type="button" onClick={() => setModalVeiculo(false)}>
              Cancelar
            </BotaoSecundario>
            <BotaoPrimario type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </BotaoPrimario>
          </div>
        </form>
      </Modal>
    )
  }

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Veículos"
        descricao="Abastecimentos, consumo médio e histórico de manutenção."
        acao={
          <BotaoPrimario
            onClick={() => {
              setEditandoVeiculo(null)
              setFormVeiculo(FORM_VEICULO)
              setMensagem('')
              setModalVeiculo(true)
            }}
          >
            <IconeMais className="h-4 w-4" />
            Novo veículo
          </BotaoPrimario>
        }
      />

      {/* Seleção de veículo */}
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {veiculos.map((v) => (
          <button
            key={v.id}
            onClick={() => setVeiculoId(v.id)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              v.id === veiculoId
                ? 'text-white'
                : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
            }`}
            style={v.id === veiculoId ? { backgroundColor: v.cor ?? CORES[0] } : undefined}
          >
            <IconeCarro className="h-4 w-4" />
            {v.nome}
          </button>
        ))}
      </div>

      {veiculoAtual && (
        <>
          <div className="cartao mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-texto">
                {veiculoAtual.marca} {veiculoAtual.modelo}
              </p>
              <p className="text-xs text-texto-suave">
                {[veiculoAtual.placa, veiculoAtual.ano, veiculoAtual.combustivel]
                  .filter(Boolean)
                  .join(' · ')}
                {resumo.odometroAtual ? ` · ${resumo.odometroAtual.toLocaleString('pt-BR')} km` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setEditandoVeiculo(veiculoAtual.id)
                  setFormVeiculo({
                    nome: veiculoAtual.nome,
                    marca: veiculoAtual.marca ?? '',
                    modelo: veiculoAtual.modelo ?? '',
                    placa: veiculoAtual.placa ?? '',
                    ano: veiculoAtual.ano ? String(veiculoAtual.ano) : '',
                    combustivel: veiculoAtual.combustivel ?? 'flex',
                    cor: veiculoAtual.cor ?? CORES[0],
                    escopo: veiculoAtual.escopo,
                  })
                  setMensagem('')
                  setModalVeiculo(true)
                }}
                className="text-xs font-medium text-primaria hover:underline"
              >
                Editar
              </button>
              <button
                onClick={() => apagarVeiculo(veiculoAtual)}
                aria-label="Apagar veículo"
                className="rounded p-1.5 text-texto-suave transition-colors hover:bg-despesa/10 hover:text-despesa"
              >
                <IconeLixeira className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Resumo */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Consumo médio</p>
              <p className="whitespace-nowrap text-base font-semibold text-texto sm:text-lg">
                {resumo.mediaConsumo ? `${resumo.mediaConsumo.toFixed(1)} km/l` : '—'}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Gasto combustível</p>
              <p className="whitespace-nowrap text-base font-semibold text-despesa sm:text-lg">
                {moeda(resumo.gastoCombustivel)}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Gasto manutenção</p>
              <p className="whitespace-nowrap text-base font-semibold text-despesa sm:text-lg">
                {moeda(resumo.gastoManutencao)}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Custo por km</p>
              <p className="whitespace-nowrap text-base font-semibold text-texto sm:text-lg">
                {resumo.custoPorKm ? moeda(resumo.custoPorKm) : '—'}
              </p>
            </div>
          </div>

          {/* Alertas de revisão */}
          {alertas.length > 0 && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-alerta/30 bg-alerta/5 p-4">
              <IconeAlerta className="mt-0.5 h-5 w-5 shrink-0 text-alerta" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-texto">Revisão se aproximando</p>
                <ul className="mt-1 space-y-0.5">
                  {alertas.map((m) => (
                    <li key={m.id} className="text-xs text-texto-suave">
                      {m.tipo}
                      {m.proxima_data ? ` · prevista para ${dataBR(m.proxima_data)}` : ''}
                      {m.proximo_odometro
                        ? ` · aos ${Number(m.proximo_odometro).toLocaleString('pt-BR')} km`
                        : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <Mensagem texto={mensagem} />

          {/* Abas */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <button onClick={() => setAba('combustivel')} className={classeAba('combustivel')}>
                Combustível
              </button>
              <button onClick={() => setAba('manutencao')} className={classeAba('manutencao')}>
                Manutenção
              </button>
            </div>
            <BotaoPrimario
              onClick={() => {
                setMensagem('')
                if (aba === 'combustivel') {
                  setFormAbastecimento({
                    ...FORM_ABASTECIMENTO,
                    odometro: resumo.odometroAtual ? String(resumo.odometroAtual) : '',
                  })
                  setModalAbastecimento(true)
                } else {
                  setFormManutencao({
                    ...FORM_MANUTENCAO,
                    odometro: resumo.odometroAtual ? String(resumo.odometroAtual) : '',
                  })
                  setModalManutencao(true)
                }
              }}
            >
              <IconeMais className="h-4 w-4" />
              {aba === 'combustivel' ? 'Abastecimento' : 'Manutenção'}
            </BotaoPrimario>
          </div>

          {/* Lista de abastecimentos */}
          {aba === 'combustivel' &&
            (comConsumo.length === 0 ? (
              <EstadoVazio
                titulo="Nenhum abastecimento registrado"
                descricao="O consumo médio aparece a partir do segundo abastecimento com tanque cheio."
              />
            ) : (
              <div className="cartao overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b border-borda bg-fundo/60 text-left text-xs text-texto-suave">
                      <th className="p-3 font-medium">Data</th>
                      <th className="p-3 text-right font-medium">Odômetro</th>
                      <th className="p-3 text-right font-medium">Litros</th>
                      <th className="p-3 text-right font-medium">R$/litro</th>
                      <th className="p-3 text-right font-medium">Total</th>
                      <th className="p-3 text-right font-medium">km/l</th>
                      <th className="p-3" />
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {comConsumo.map((a) => (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap p-3 text-texto-suave">{dataBR(a.data)}</td>
                        <td className="whitespace-nowrap p-3 text-right text-texto">
                          {Number(a.odometro).toLocaleString('pt-BR')}
                          {a.kmRodados ? (
                            <span className="block text-xs text-texto-suave">
                              +{a.kmRodados.toLocaleString('pt-BR')} km
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap p-3 text-right text-texto">
                          {Number(a.litros).toFixed(2)}
                          {!a.tanque_cheio && (
                            <span className="block text-xs text-texto-suave">parcial</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap p-3 text-right text-texto-suave">
                          {moeda(a.precoLitro)}
                        </td>
                        <td className="whitespace-nowrap p-3 text-right font-medium text-texto">
                          {moeda(a.valor_total)}
                        </td>
                        <td className="whitespace-nowrap p-3 text-right font-semibold text-primaria">
                          {a.consumo ? a.consumo.toFixed(1) : '—'}
                        </td>
                        <td className="whitespace-nowrap p-3 text-right">
                          {a.transacao_id ? (
                            <span className="rounded bg-primaria/10 px-2 py-1 text-xs font-medium text-primaria">
                              Lançado
                            </span>
                          ) : (
                            <button
                              onClick={() => abrirPerguntaLancamento(a)}
                              className="text-xs font-medium text-primaria hover:underline"
                            >
                              Lançar
                            </button>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => apagarAbastecimento(a)}
                            aria-label="Apagar abastecimento"
                            className="rounded p-1.5 text-texto-suave transition-colors hover:bg-despesa/10 hover:text-despesa"
                          >
                            <IconeLixeira className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

          {/* Lista de manutenções */}
          {aba === 'manutencao' &&
            (manutencoes.length === 0 ? (
              <EstadoVazio
                titulo="Nenhuma manutenção registrada"
                descricao="Registre trocas de óleo, revisões e reparos para acompanhar o histórico do veículo."
              />
            ) : (
              <div className="cartao divide-y divide-borda">
                {manutencoes.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-texto">{m.tipo}</p>
                      <p className="truncate text-xs text-texto-suave">
                        {dataBR(m.data)}
                        {m.odometro
                          ? ` · ${Number(m.odometro).toLocaleString('pt-BR')} km`
                          : ''}
                        {m.oficina ? ` · ${m.oficina}` : ''}
                        {m.descricao ? ` · ${m.descricao}` : ''}
                      </p>
                      {(m.proxima_data || m.proximo_odometro) && (
                        <p className="mt-0.5 text-xs text-alerta">
                          Próxima:{' '}
                          {[
                            m.proxima_data ? dataBR(m.proxima_data) : null,
                            m.proximo_odometro
                              ? `${Number(m.proximo_odometro).toLocaleString('pt-BR')} km`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' ou ')}
                        </p>
                      )}
                    </div>
                    <span className="whitespace-nowrap text-sm font-semibold text-despesa">
                      {moeda(m.custo)}
                    </span>
                    <button
                      onClick={() => apagarManutencao(m.id)}
                      aria-label="Apagar manutenção"
                      className="rounded p-1.5 text-texto-suave transition-colors hover:bg-despesa/10 hover:text-despesa"
                    >
                      <IconeLixeira className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
        </>
      )}

      <ModalVeiculo />

      {/* Modal: abastecimento */}
      <Modal
        aberto={modalAbastecimento}
        titulo="Novo abastecimento"
        onFechar={() => setModalAbastecimento(false)}
      >
        <form onSubmit={salvarAbastecimento} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Data">
              <input
                type="date"
                className={classeInput}
                value={formAbastecimento.data}
                onChange={(e) =>
                  setFormAbastecimento({ ...formAbastecimento, data: e.target.value })
                }
                required
              />
            </Campo>
            <Campo rotulo="Odômetro (km)">
              <input
                type="number"
                step="1"
                className={classeInput}
                value={formAbastecimento.odometro}
                onChange={(e) =>
                  setFormAbastecimento({ ...formAbastecimento, odometro: e.target.value })
                }
                required
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Litros">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={formAbastecimento.litros}
                onChange={(e) =>
                  setFormAbastecimento({ ...formAbastecimento, litros: e.target.value })
                }
                required
              />
            </Campo>
            <Campo rotulo="Valor total (R$)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={formAbastecimento.valor_total}
                onChange={(e) =>
                  setFormAbastecimento({ ...formAbastecimento, valor_total: e.target.value })
                }
                required
              />
            </Campo>
          </div>

          <Campo rotulo="Posto (opcional)">
            <input
              className={classeInput}
              value={formAbastecimento.posto}
              onChange={(e) => setFormAbastecimento({ ...formAbastecimento, posto: e.target.value })}
              placeholder="Ex: Ipiranga Centro"
            />
          </Campo>

          <div className="rounded-lg border border-borda p-3">
            <label className="flex items-center gap-2 text-sm text-texto">
              <input
                type="checkbox"
                checked={formAbastecimento.tanque_cheio}
                onChange={(e) =>
                  setFormAbastecimento({ ...formAbastecimento, tanque_cheio: e.target.checked })
                }
              />
              Enchi o tanque
            </label>
            <p className="mt-1.5 text-xs text-texto-suave">
              O km/l só é calculado entre dois abastecimentos com tanque cheio — completar pela
              metade não permite saber quanto foi realmente consumido.
            </p>
          </div>

          <Mensagem texto={mensagem} />

          <div className="flex justify-end gap-2 pt-2">
            <BotaoSecundario type="button" onClick={() => setModalAbastecimento(false)}>
              Cancelar
            </BotaoSecundario>
            <BotaoPrimario type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </BotaoPrimario>
          </div>
        </form>
      </Modal>

      {/* Modal: lançar o abastecimento como despesa */}
      <Modal
        aberto={modalLancar}
        titulo="Lançar este abastecimento?"
        onFechar={() => setModalLancar(false)}
      >
        {abastecimentoParaLancar && (
          <form onSubmit={salvarLancamentoAbastecimento} className="space-y-4">
            <p className="text-sm text-texto-suave">
              Você pagou <strong className="text-texto">{moeda(abastecimentoParaLancar.valor_total)}</strong>{' '}
              neste abastecimento. Quer registrar isso como uma despesa?
            </p>

            <Campo rotulo="Descrição">
              <input
                className={classeInput}
                value={formLancamento.descricao}
                onChange={(e) => setFormLancamento({ ...formLancamento, descricao: e.target.value })}
                required
              />
            </Campo>

            <div className="grid gap-4 sm:grid-cols-2">
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
                  value={formLancamento.subcategoria_id}
                  onChange={(e) =>
                    setFormLancamento({ ...formLancamento, subcategoria_id: e.target.value })
                  }
                  disabled={!formLancamento.categoria_id}
                >
                  <option value="">Nenhuma</option>
                  {subcategorias
                    .filter((sc) => sc.categoria_id === formLancamento.categoria_id)
                    .map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {sc.nome}
                      </option>
                    ))}
                </select>
              </Campo>
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-texto">Pago com</span>
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormLancamento({ ...formLancamento, pago_com: 'conta' })}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    formLancamento.pago_com === 'conta'
                      ? 'bg-marinho text-white'
                      : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
                  }`}
                >
                  Conta
                </button>
                <button
                  type="button"
                  onClick={() => setFormLancamento({ ...formLancamento, pago_com: 'cartao' })}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    formLancamento.pago_com === 'cartao'
                      ? 'bg-marinho text-white'
                      : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
                  }`}
                >
                  Cartão de crédito
                </button>
              </div>

              {formLancamento.pago_com === 'conta' ? (
                <select
                  className={classeInput}
                  value={formLancamento.conta_id}
                  onChange={(e) => setFormLancamento({ ...formLancamento, conta_id: e.target.value })}
                >
                  <option value="">Selecione a conta...</option>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  className={classeInput}
                  value={formLancamento.cartao_id}
                  onChange={(e) => setFormLancamento({ ...formLancamento, cartao_id: e.target.value })}
                >
                  <option value="">Selecione o cartão...</option>
                  {cartoes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              )}
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

            <Mensagem texto={mensagem} />

            <div className="flex justify-end gap-2 pt-2">
              <BotaoSecundario
                type="button"
                onClick={() => {
                  setModalLancar(false)
                  setAbastecimentoParaLancar(null)
                }}
              >
                Não lançar
              </BotaoSecundario>
              <BotaoPrimario type="submit" disabled={salvando}>
                {salvando ? 'Salvando...' : 'Lançar despesa'}
              </BotaoPrimario>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: manutenção */}
      <Modal
        aberto={modalManutencao}
        titulo="Nova manutenção"
        onFechar={() => setModalManutencao(false)}
      >
        <form onSubmit={salvarManutencao} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Tipo de serviço">
              <select
                className={classeInput}
                value={formManutencao.tipo}
                onChange={(e) => setFormManutencao({ ...formManutencao, tipo: e.target.value })}
              >
                {TIPOS_MANUTENCAO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Data">
              <input
                type="date"
                className={classeInput}
                value={formManutencao.data}
                onChange={(e) => setFormManutencao({ ...formManutencao, data: e.target.value })}
                required
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Odômetro (km)">
              <input
                type="number"
                className={classeInput}
                value={formManutencao.odometro}
                onChange={(e) => setFormManutencao({ ...formManutencao, odometro: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Custo (R$)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={formManutencao.custo}
                onChange={(e) => setFormManutencao({ ...formManutencao, custo: e.target.value })}
                required
              />
            </Campo>
          </div>

          <Campo rotulo="Oficina (opcional)">
            <input
              className={classeInput}
              value={formManutencao.oficina}
              onChange={(e) => setFormManutencao({ ...formManutencao, oficina: e.target.value })}
            />
          </Campo>

          <Campo rotulo="Descrição (opcional)">
            <input
              className={classeInput}
              value={formManutencao.descricao}
              onChange={(e) => setFormManutencao({ ...formManutencao, descricao: e.target.value })}
              placeholder="Ex: óleo 5W30 sintético + filtro"
            />
          </Campo>

          <div className="rounded-lg border border-borda p-3">
            <p className="mb-3 text-sm font-medium text-texto">Próxima revisão (opcional)</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Na data">
                <input
                  type="date"
                  className={classeInput}
                  value={formManutencao.proxima_data}
                  onChange={(e) =>
                    setFormManutencao({ ...formManutencao, proxima_data: e.target.value })
                  }
                />
              </Campo>
              <Campo rotulo="Ou aos km">
                <input
                  type="number"
                  className={classeInput}
                  value={formManutencao.proximo_odometro}
                  onChange={(e) =>
                    setFormManutencao({ ...formManutencao, proximo_odometro: e.target.value })
                  }
                  placeholder="Ex: 60000"
                />
              </Campo>
            </div>
            <p className="mt-1.5 text-xs text-texto-suave">
              Você recebe um aviso nesta tela quando faltarem 30 dias ou 1.000 km.
            </p>
          </div>

          <Mensagem texto={mensagem} />

          <div className="flex justify-end gap-2 pt-2">
            <BotaoSecundario type="button" onClick={() => setModalManutencao(false)}>
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
