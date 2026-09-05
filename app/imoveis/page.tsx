'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { dataBR, hojeISO, moeda, normalizar } from '@/lib/formato'
import { avaliarImovel } from '@/lib/calculos'
import { IconeImovel, IconeLixeira, IconeMais } from '@/components/Icones'
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

type Imovel = {
  id: string
  nome: string
  tipo: string
  endereco: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  area_terreno: number | null
  testada: number | null
  matricula: string | null
  inscricao_municipal: string | null
  area_construida: number | null
  quartos: number | null
  suites: number | null
  banheiros: number | null
  vagas: number | null
  ano_construcao: number | null
  data_aquisicao: string
  valor_pago: number
  indice_base: number | null
  indice_base_data: string | null
  valor_avaliado_manual: number | null
  observacoes: string | null
  escopo: string
}

type Indice = { atual: number; mesAtual: string; porMes: Record<string, number> }

const TIPOS = ['casa', 'apartamento', 'terreno', 'sala comercial', 'galpão', 'rural', 'outro']

const FORM_VAZIO = {
  nome: '',
  tipo: TIPOS[0],
  endereco: '',
  bairro: '',
  cidade: '',
  uf: '',
  cep: '',
  area_terreno: '',
  testada: '',
  matricula: '',
  inscricao_municipal: '',
  area_construida: '',
  quartos: '',
  suites: '',
  banheiros: '',
  vagas: '',
  ano_construcao: '',
  data_aquisicao: hojeISO(),
  valor_pago: '',
  valor_avaliado_manual: '',
  observacoes: '',
  escopo: 'familiar',
}

/** Número opcional: "" vira null em vez de NaN */
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

export default function ImoveisPage() {
  const [imoveis, setImoveis] = useState<Imovel[]>([])
  const [indice, setIndice] = useState<Indice | null>(null)
  const [avisoIndice, setAvisoIndice] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('imoveis').select('*').order('nome')
    setImoveis((data ?? []) as Imovel[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  // Índice do Banco Central usado para corrigir o valor dos imóveis
  useEffect(() => {
    let cancelado = false
    async function buscarIndice() {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      try {
        const resposta = await fetch('/api/indice-imovel', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        const json = await resposta.json()
        if (cancelado) return
        if (!resposta.ok) {
          setAvisoIndice(json.error ?? 'Índice indisponível agora.')
          return
        }
        setIndice(json)
      } catch {
        if (!cancelado) setAvisoIndice('Não foi possível falar com o Banco Central agora.')
      }
    }
    buscarIndice()
    return () => {
      cancelado = true
    }
  }, [])

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim())
    if (!termo) return imoveis
    return imoveis.filter((i) =>
      normalizar(`${i.nome} ${i.tipo} ${i.cidade ?? ''} ${i.bairro ?? ''}`).includes(termo)
    )
  }, [imoveis, busca])

  const totais = useMemo(() => {
    let pago = 0
    let atual = 0
    for (const i of visiveis) {
      pago += Number(i.valor_pago)
      atual += avaliarImovel(i, indice?.atual ?? null).valorAtual
    }
    return { pago, atual, valorizacao: atual - pago }
  }, [visiveis, indice])

  /** Índice do mês da compra; se aquele mês não existir na série, usa o anterior mais próximo */
  function indiceDoMes(dataIso: string): number | null {
    if (!indice) return null
    const chave = dataIso.slice(0, 7)
    if (indice.porMes[chave]) return indice.porMes[chave]
    const anteriores = Object.keys(indice.porMes)
      .filter((m) => m <= chave)
      .sort()
    const maisProximo = anteriores[anteriores.length - 1]
    return maisProximo ? indice.porMes[maisProximo] : null
  }

  function abrirNovo() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setMensagem('')
    setModalAberto(true)
  }

  function abrirEdicao(i: Imovel) {
    setEditandoId(i.id)
    setForm({
      nome: i.nome,
      tipo: i.tipo,
      endereco: i.endereco ?? '',
      bairro: i.bairro ?? '',
      cidade: i.cidade ?? '',
      uf: i.uf ?? '',
      cep: i.cep ?? '',
      area_terreno: i.area_terreno != null ? String(i.area_terreno) : '',
      testada: i.testada != null ? String(i.testada) : '',
      matricula: i.matricula ?? '',
      inscricao_municipal: i.inscricao_municipal ?? '',
      area_construida: i.area_construida != null ? String(i.area_construida) : '',
      quartos: i.quartos != null ? String(i.quartos) : '',
      suites: i.suites != null ? String(i.suites) : '',
      banheiros: i.banheiros != null ? String(i.banheiros) : '',
      vagas: i.vagas != null ? String(i.vagas) : '',
      ano_construcao: i.ano_construcao != null ? String(i.ano_construcao) : '',
      data_aquisicao: i.data_aquisicao,
      valor_pago: String(i.valor_pago),
      valor_avaliado_manual: i.valor_avaliado_manual != null ? String(i.valor_avaliado_manual) : '',
      observacoes: i.observacoes ?? '',
      escopo: i.escopo,
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

    const baseIndice = indiceDoMes(form.data_aquisicao)

    const registro = {
      nome: form.nome,
      tipo: form.tipo,
      endereco: form.endereco || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      uf: form.uf ? form.uf.toUpperCase() : null,
      cep: form.cep || null,
      area_terreno: numeroOuNulo(form.area_terreno),
      testada: numeroOuNulo(form.testada),
      matricula: form.matricula || null,
      inscricao_municipal: form.inscricao_municipal || null,
      area_construida: numeroOuNulo(form.area_construida),
      quartos: inteiroOuNulo(form.quartos),
      suites: inteiroOuNulo(form.suites),
      banheiros: inteiroOuNulo(form.banheiros),
      vagas: inteiroOuNulo(form.vagas),
      ano_construcao: inteiroOuNulo(form.ano_construcao),
      data_aquisicao: form.data_aquisicao,
      valor_pago: parseFloat(form.valor_pago || '0'),
      indice_base: baseIndice,
      indice_base_data: baseIndice ? `${form.data_aquisicao.slice(0, 7)}-01` : null,
      valor_avaliado_manual: numeroOuNulo(form.valor_avaliado_manual),
      observacoes: form.observacoes || null,
      escopo: form.escopo,
    }

    const { error } = editandoId
      ? await supabase.from('imoveis').update(registro).eq('id', editandoId)
      : await supabase.from('imoveis').insert({ ...registro, dono_id: userId })

    setSalvando(false)
    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }

    setModalAberto(false)
    carregar()
  }

  async function apagar(i: Imovel) {
    if (!window.confirm(`Apagar o imóvel "${i.nome}"?\n\nEsta ação não pode ser desfeita.`)) return
    const { error } = await supabase.from('imoveis').delete().eq('id', i.id)
    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    carregar()
  }

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Imóveis"
        descricao="Casas, apartamentos e terrenos, com o valor corrigido pelo mercado imobiliário."
        acao={
          <BotaoPrimario onClick={abrirNovo}>
            <IconeMais className="h-4 w-4" />
            Novo imóvel
          </BotaoPrimario>
        }
      />

      {imoveis.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Total pago</p>
              <p className="whitespace-nowrap text-base font-semibold text-texto sm:text-lg">
                {moeda(totais.pago)}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Valor estimado hoje</p>
              <p className="whitespace-nowrap text-base font-semibold text-texto sm:text-lg">
                {moeda(totais.atual)}
              </p>
            </div>
            <div className="cartao col-span-2 p-3 lg:col-span-1">
              <p className="text-xs text-texto-suave">Valorização</p>
              <p
                className={`whitespace-nowrap text-base font-semibold sm:text-lg ${
                  totais.valorizacao >= 0 ? 'text-receita' : 'text-despesa'
                }`}
              >
                {totais.valorizacao >= 0 ? '+' : '−'} {moeda(Math.abs(totais.valorizacao))}
              </p>
            </div>
          </div>

          <div className="cartao mb-4 p-4">
            <input
              className={classeInput}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, tipo, cidade ou bairro..."
              aria-label="Busca rápida"
            />
            <p className="mt-2 text-xs text-texto-suave">
              {indice
                ? `Correção automática pelo IVG-R do Banco Central (base ${indice.mesAtual.split('-').reverse().join('/')}). Uma avaliação informada à mão sempre prevalece.`
                : avisoIndice || 'Buscando o índice de imóveis do Banco Central...'}
            </p>
          </div>
        </>
      )}

      <Mensagem texto={mensagem} />

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {!carregando && imoveis.length === 0 && (
        <EstadoVazio
          titulo="Nenhum imóvel cadastrado"
          descricao="Cadastre suas casas, apartamentos e terrenos para acompanhar quanto valem hoje e somar no seu patrimônio."
          acao={<BotaoPrimario onClick={abrirNovo}>Cadastrar primeiro imóvel</BotaoPrimario>}
        />
      )}

      {!carregando && imoveis.length > 0 && visiveis.length === 0 && (
        <EstadoVazio titulo="Nenhum imóvel encontrado" descricao="Tente outro termo na busca." />
      )}

      {!carregando && visiveis.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {visiveis.map((imovel) => {
            const avaliacao = avaliarImovel(imovel, indice?.atual ?? null)
            const local = [imovel.bairro, imovel.cidade, imovel.uf].filter(Boolean).join(', ')
            return (
              <div key={imovel.id} className="cartao p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primaria/10 text-primaria">
                      <IconeImovel className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-texto">{imovel.nome}</p>
                      <p className="truncate text-xs text-texto-suave">
                        <span className="capitalize">{imovel.tipo}</span>
                        {local ? ` · ${local}` : ''}
                        {imovel.escopo === 'pessoal' ? ' · Pessoal' : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => apagar(imovel)}
                    aria-label={`Apagar ${imovel.nome}`}
                    className="rounded p-1.5 text-texto-suave transition-colors hover:bg-despesa/10 hover:text-despesa"
                  >
                    <IconeLixeira className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-borda pt-3">
                  <div>
                    <p className="text-xs text-texto-suave">Pago em {dataBR(imovel.data_aquisicao)}</p>
                    <p className="whitespace-nowrap font-semibold text-texto">
                      {moeda(imovel.valor_pago)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-texto-suave">
                      {avaliacao.origem === 'manual' ? 'Avaliação informada' : 'Estimado hoje'}
                    </p>
                    <p className="whitespace-nowrap font-semibold text-texto">
                      {moeda(avaliacao.valorAtual)}
                    </p>
                  </div>
                </div>

                {avaliacao.origem !== 'sem-indice' && (
                  <p
                    className={`mt-2 text-xs font-medium ${
                      avaliacao.valorizacao >= 0 ? 'text-receita' : 'text-despesa'
                    }`}
                  >
                    {avaliacao.valorizacao >= 0 ? '+' : '−'} {moeda(Math.abs(avaliacao.valorizacao))} (
                    {avaliacao.percentual >= 0 ? '+' : ''}
                    {avaliacao.percentual.toFixed(1)}%)
                    {avaliacao.origem === 'indice' ? ' pelo IVG-R' : ''}
                  </p>
                )}

                {(imovel.area_terreno || imovel.area_construida || imovel.quartos) && (
                  <p className="mt-2 text-xs text-texto-suave">
                    {[
                      imovel.area_terreno ? `Terreno ${imovel.area_terreno} m²` : null,
                      imovel.area_construida ? `Construída ${imovel.area_construida} m²` : null,
                      imovel.quartos ? `${imovel.quartos} quarto${imovel.quartos > 1 ? 's' : ''}` : null,
                      imovel.vagas ? `${imovel.vagas} vaga${imovel.vagas > 1 ? 's' : ''}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}

                <button
                  onClick={() => abrirEdicao(imovel)}
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
        titulo={editandoId ? 'Editar imóvel' : 'Novo imóvel'}
        onFechar={() => setModalAberto(false)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome / apelido">
              <input
                className={classeInput}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Casa Novo Hamburgo"
                required
              />
            </Campo>
            <Campo rotulo="Tipo">
              <select
                className={classeInput}
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t} className="capitalize">
                    {t}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          {/* ---- Localização ---- */}
          <div className="rounded-lg border border-borda p-3">
            <p className="mb-3 text-sm font-medium text-texto">Localização</p>
            <Campo rotulo="Endereço">
              <input
                className={classeInput}
                value={form.endereco}
                onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                placeholder="Rua, número, complemento"
              />
            </Campo>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <Campo rotulo="Bairro" className="sm:col-span-2">
                <input
                  className={classeInput}
                  value={form.bairro}
                  onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Cidade">
                <input
                  className={classeInput}
                  value={form.cidade}
                  onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                />
              </Campo>
              <Campo rotulo="UF">
                <input
                  className={classeInput}
                  maxLength={2}
                  value={form.uf}
                  onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
                  placeholder="RS"
                />
              </Campo>
            </div>
            <Campo rotulo="CEP" className="mt-3">
              <input
                className={classeInput}
                value={form.cep}
                onChange={(e) => setForm({ ...form, cep: e.target.value })}
                placeholder="00000-000"
              />
            </Campo>
          </div>

          {/* ---- Terreno ---- */}
          <div className="rounded-lg border border-borda p-3">
            <p className="mb-3 text-sm font-medium text-texto">Terreno</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Área do terreno (m²)">
                <input
                  type="number"
                  step="0.01"
                  className={classeInput}
                  value={form.area_terreno}
                  onChange={(e) => setForm({ ...form, area_terreno: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Testada / frente (m)">
                <input
                  type="number"
                  step="0.01"
                  className={classeInput}
                  value={form.testada}
                  onChange={(e) => setForm({ ...form, testada: e.target.value })}
                />
              </Campo>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Matrícula">
                <input
                  className={classeInput}
                  value={form.matricula}
                  onChange={(e) => setForm({ ...form, matricula: e.target.value })}
                  placeholder="Nº no registro de imóveis"
                />
              </Campo>
              <Campo rotulo="Inscrição municipal">
                <input
                  className={classeInput}
                  value={form.inscricao_municipal}
                  onChange={(e) => setForm({ ...form, inscricao_municipal: e.target.value })}
                  placeholder="Usada no IPTU"
                />
              </Campo>
            </div>
          </div>

          {/* ---- Construção ---- */}
          <div className="rounded-lg border border-borda p-3">
            <p className="mb-3 text-sm font-medium text-texto">Construção</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Área construída (m²)">
                <input
                  type="number"
                  step="0.01"
                  className={classeInput}
                  value={form.area_construida}
                  onChange={(e) => setForm({ ...form, area_construida: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Ano de construção">
                <input
                  type="number"
                  className={classeInput}
                  value={form.ano_construcao}
                  onChange={(e) => setForm({ ...form, ano_construcao: e.target.value })}
                  placeholder="2010"
                />
              </Campo>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo rotulo="Quartos">
                <input
                  type="number"
                  className={classeInput}
                  value={form.quartos}
                  onChange={(e) => setForm({ ...form, quartos: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Suítes">
                <input
                  type="number"
                  className={classeInput}
                  value={form.suites}
                  onChange={(e) => setForm({ ...form, suites: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Banheiros">
                <input
                  type="number"
                  className={classeInput}
                  value={form.banheiros}
                  onChange={(e) => setForm({ ...form, banheiros: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Vagas">
                <input
                  type="number"
                  className={classeInput}
                  value={form.vagas}
                  onChange={(e) => setForm({ ...form, vagas: e.target.value })}
                />
              </Campo>
            </div>
          </div>

          {/* ---- Valores ---- */}
          <div className="rounded-lg border border-borda p-3">
            <p className="mb-3 text-sm font-medium text-texto">Valores</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Data da compra">
                <input
                  type="date"
                  className={classeInput}
                  value={form.data_aquisicao}
                  onChange={(e) => setForm({ ...form, data_aquisicao: e.target.value })}
                  required
                />
              </Campo>
              <Campo rotulo="Valor pago (R$)">
                <input
                  type="number"
                  step="0.01"
                  className={classeInput}
                  value={form.valor_pago}
                  onChange={(e) => setForm({ ...form, valor_pago: e.target.value })}
                  required
                />
              </Campo>
            </div>

            <Campo rotulo="Avaliação atual (R$) — opcional" className="mt-3">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={form.valor_avaliado_manual}
                onChange={(e) => setForm({ ...form, valor_avaliado_manual: e.target.value })}
                placeholder="Deixe vazio para o sistema corrigir sozinho"
              />
            </Campo>
            <p className="mt-1.5 text-xs text-texto-suave">
              Vazio: o valor é corrigido automaticamente pelo IVG-R do Banco Central, na proporção
              em que o índice subiu desde o mês da compra. Preenchido: usa o que você informou.
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
