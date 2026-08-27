'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { dataBR, hojeISO, moeda, normalizar } from '@/lib/formato'
import { calcularDepreciacao } from '@/lib/calculos'
import { IconeLixeira, IconeMais, IconeSofa } from '@/components/Icones'
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

type Bem = {
  id: string
  nome: string
  categoria: string | null
  local: string | null
  valor_aquisicao: number
  data_aquisicao: string
  vida_util_anos: number | null
  valor_residual: number
  observacoes: string | null
  escopo: string
}

const CATEGORIAS = [
  'Móveis',
  'Eletrodomésticos',
  'Eletrônicos',
  'Informática',
  'Decoração',
  'Ferramentas',
  'Eletroportáteis',
  'Outro',
]

/** Sugestões de vida útil, na faixa que a Receita Federal costuma usar */
const VIDA_UTIL_SUGERIDA: Record<string, number> = {
  Móveis: 10,
  Eletrodomésticos: 10,
  Eletrônicos: 5,
  Informática: 5,
  Decoração: 10,
  Ferramentas: 10,
  Eletroportáteis: 5,
}

const FORM_VAZIO = {
  nome: '',
  categoria: CATEGORIAS[0],
  local: '',
  valor_aquisicao: '',
  data_aquisicao: hojeISO(),
  vida_util_anos: String(VIDA_UTIL_SUGERIDA[CATEGORIAS[0]] ?? 10),
  valor_residual: '',
  observacoes: '',
  escopo: 'familiar',
}

export default function BensPage() {
  const [bens, setBens] = useState<Bem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('bens').select('*').order('nome')
    setBens((data ?? []) as Bem[])
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
    if (!termo) return bens
    return bens.filter((b) =>
      normalizar(`${b.nome} ${b.categoria ?? ''} ${b.local ?? ''}`).includes(termo)
    )
  }, [bens, busca])

  const totais = useMemo(() => {
    let compra = 0
    let atual = 0
    for (const b of visiveis) {
      compra += Number(b.valor_aquisicao)
      atual += calcularDepreciacao(b).valorAtual
    }
    return { compra, atual, perdido: compra - atual }
  }, [visiveis])

  function abrirNovo() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setMensagem('')
    setModalAberto(true)
  }

  function abrirEdicao(b: Bem) {
    setEditandoId(b.id)
    setForm({
      nome: b.nome,
      categoria: b.categoria ?? CATEGORIAS[0],
      local: b.local ?? '',
      valor_aquisicao: String(b.valor_aquisicao),
      data_aquisicao: b.data_aquisicao,
      vida_util_anos: b.vida_util_anos != null ? String(b.vida_util_anos) : '',
      valor_residual: b.valor_residual ? String(b.valor_residual) : '',
      observacoes: b.observacoes ?? '',
      escopo: b.escopo,
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
      categoria: form.categoria || null,
      local: form.local || null,
      valor_aquisicao: parseFloat(form.valor_aquisicao || '0'),
      data_aquisicao: form.data_aquisicao,
      vida_util_anos: form.vida_util_anos ? parseInt(form.vida_util_anos, 10) : null,
      valor_residual: parseFloat(form.valor_residual || '0'),
      observacoes: form.observacoes || null,
      escopo: form.escopo,
    }

    const { error } = editandoId
      ? await supabase.from('bens').update(registro).eq('id', editandoId)
      : await supabase.from('bens').insert({ ...registro, dono_id: userId })

    setSalvando(false)
    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }
    setModalAberto(false)
    carregar()
  }

  async function apagar(b: Bem) {
    if (!window.confirm(`Apagar "${b.nome}" do inventário?`)) return
    const { error } = await supabase.from('bens').delete().eq('id', b.id)
    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    carregar()
  }

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Bens e Móveis"
        descricao="Inventário do patrimônio da casa, com valor atual estimado pela depreciação."
        acao={
          <BotaoPrimario onClick={abrirNovo}>
            <IconeMais className="h-4 w-4" />
            Novo bem
          </BotaoPrimario>
        }
      />

      {bens.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Valor de compra</p>
              <p className="whitespace-nowrap text-base font-semibold text-texto sm:text-lg">
                {moeda(totais.compra)}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Valor atual</p>
              <p className="whitespace-nowrap text-base font-semibold text-primaria sm:text-lg">
                {moeda(totais.atual)}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Depreciado</p>
              <p className="whitespace-nowrap text-base font-semibold text-despesa sm:text-lg">
                {moeda(totais.perdido)}
              </p>
            </div>
          </div>

          <input
            className={`${classeInput} mb-4`}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, categoria ou cômodo..."
            aria-label="Buscar bem"
          />
        </>
      )}

      <Mensagem texto={mensagem} />

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {!carregando && bens.length === 0 && (
        <EstadoVazio
          titulo="Nenhum bem cadastrado"
          descricao="Registre móveis, eletrodomésticos e eletrônicos para saber quanto vale o patrimônio da casa hoje."
          acao={<BotaoPrimario onClick={abrirNovo}>Cadastrar primeiro bem</BotaoPrimario>}
        />
      )}

      {!carregando && bens.length > 0 && visiveis.length === 0 && (
        <EstadoVazio titulo="Nenhum bem encontrado" descricao="Tente outro termo na busca." />
      )}

      {!carregando && visiveis.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((b) => {
            const d = calcularDepreciacao(b)
            return (
              <div key={b.id} className="cartao p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marinho/10 text-marinho">
                      <IconeSofa className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-texto">{b.nome}</p>
                      <p className="truncate text-xs text-texto-suave">
                        {b.categoria ?? 'Sem categoria'}
                        {b.local ? ` · ${b.local}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => apagar(b)}
                    aria-label={`Apagar ${b.nome}`}
                    className="rounded p-1.5 text-texto-suave transition-colors hover:bg-despesa/10 hover:text-despesa"
                  >
                    <IconeLixeira className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-semibold text-texto">{moeda(d.valorAtual)}</span>
                  {d.perdido > 0 && (
                    <span className="text-xs text-texto-suave line-through">
                      {moeda(b.valor_aquisicao)}
                    </span>
                  )}
                </div>

                {b.vida_util_anos ? (
                  <>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fundo">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${d.percentualDepreciado}%`,
                          backgroundColor: d.totalmenteDepreciado
                            ? 'var(--despesa)'
                            : 'var(--alerta)',
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-texto-suave">
                      {d.totalmenteDepreciado
                        ? `Vida útil de ${b.vida_util_anos} anos encerrada`
                        : `${d.percentualDepreciado.toFixed(0)}% depreciado · ${d.anosDeUso.toFixed(1)} de ${b.vida_util_anos} anos`}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-texto-suave">Não deprecia</p>
                )}

                <p className="mt-2 text-xs text-texto-suave">
                  Comprado em {dataBR(b.data_aquisicao)}
                </p>

                <button
                  onClick={() => abrirEdicao(b)}
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
        titulo={editandoId ? 'Editar bem' : 'Novo bem'}
        onFechar={() => setModalAberto(false)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <Campo rotulo="Nome">
            <input
              className={classeInput}
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Geladeira Brastemp Frost Free"
              required
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Categoria">
              <select
                className={classeInput}
                value={form.categoria}
                onChange={(e) =>
                  setForm({
                    ...form,
                    categoria: e.target.value,
                    // Ajusta a vida útil sugerida ao trocar de categoria
                    vida_util_anos: String(VIDA_UTIL_SUGERIDA[e.target.value] ?? ''),
                  })
                }
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Cômodo / local">
              <input
                className={classeInput}
                value={form.local}
                onChange={(e) => setForm({ ...form, local: e.target.value })}
                placeholder="Ex: Cozinha"
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Valor de compra (R$)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={form.valor_aquisicao}
                onChange={(e) => setForm({ ...form, valor_aquisicao: e.target.value })}
                required
              />
            </Campo>
            <Campo rotulo="Data da compra">
              <input
                type="date"
                className={classeInput}
                value={form.data_aquisicao}
                onChange={(e) => setForm({ ...form, data_aquisicao: e.target.value })}
                required
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Vida útil (anos)">
              <input
                type="number"
                min="1"
                max="100"
                className={classeInput}
                value={form.vida_util_anos}
                onChange={(e) => setForm({ ...form, vida_util_anos: e.target.value })}
                placeholder="Deixe vazio para não depreciar"
              />
            </Campo>
            <Campo rotulo="Valor residual (R$)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={form.valor_residual}
                onChange={(e) => setForm({ ...form, valor_residual: e.target.value })}
                placeholder="0,00"
              />
            </Campo>
          </div>
          <p className="-mt-2 text-xs text-texto-suave">
            O bem perde valor de forma constante ao longo da vida útil até chegar no valor
            residual, que é quanto você espera que ele ainda valha no fim.
          </p>

          <Campo rotulo="Observações (opcional)">
            <input
              className={classeInput}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              placeholder="Nº de série, nota fiscal, garantia..."
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
