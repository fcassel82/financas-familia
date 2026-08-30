'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { hojeISO, moeda, somarMeses } from '@/lib/formato'
import { sugerirCategoriaLancamento } from '@/lib/sugerirCategoriaHistorico'
import { verificarDuplicata, type Duplicata } from '@/lib/verificarDuplicata'
import { IconeLixeira } from '@/components/Icones'
import {
  BotaoPrimario,
  BotaoSecundario,
  CabecalhoPagina,
  Campo,
  Mensagem,
  Modal,
  Pagina,
  classeInput,
} from '@/components/ui'

type Categoria = { id: string; nome: string; tipo: string }
type Subcategoria = { id: string; categoria_id: string; nome: string }
type Conta = { id: string; nome: string }
type Cartao = { id: string; nome: string }

type RegistroBase = {
  data: string
  descricao: string
  categoria_id: string | null
  subcategoria_id: string | null
  valor: number
  tipo: string
  escopo: string
  conta_id: string | null
  cartao_id: string | null
}

/**
 * Divide um valor em N parcelas mensais. Os centavos que sobram da divisão vão
 * para a última parcela, para que a soma bata exatamente com o valor original
 * (ex.: 100 em 3x = 33,33 + 33,33 + 33,34).
 */
function montarParcelas(base: RegistroBase, quantidade: number, userId: string | undefined) {
  const totalCentavos = Math.round(base.valor * 100)
  const porParcela = Math.floor(totalCentavos / quantidade)
  const sobra = totalCentavos - porParcela * quantidade
  const recorrenciaId = crypto.randomUUID()

  return Array.from({ length: quantidade }, (_, i) => {
    const centavos = i === quantidade - 1 ? porParcela + sobra : porParcela
    return {
      ...base,
      data: somarMeses(base.data, i),
      descricao: `${base.descricao} (${i + 1}/${quantidade})`,
      valor: centavos / 100,
      recorrencia_id: recorrenciaId,
      parcela_numero: i + 1,
      parcela_total: quantidade,
      dono_id: userId,
      lancado_por: userId,
    }
  })
}

function FormularioLancamento() {
  const searchParams = useSearchParams()
  const idEdicao = searchParams.get('id')
  const router = useRouter()

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])

  const [tipo, setTipo] = useState('despesa')
  const [data, setData] = useState(hojeISO())
  const [descricao, setDescricao] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [subcategoriaId, setSubcategoriaId] = useState('')
  const [valor, setValor] = useState('')
  const [pagoCom, setPagoCom] = useState<'conta' | 'cartao'>('conta')
  const [contaId, setContaId] = useState('')
  const [cartaoId, setCartaoId] = useState('')
  const [escopo, setEscopo] = useState('pessoal')
  const [parcelar, setParcelar] = useState(false)
  const [parcelas, setParcelas] = useState('2')

  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const [carregando, setCarregando] = useState(!!idEdicao)
  const [duplicatas, setDuplicatas] = useState<Duplicata[] | null>(null)

  useEffect(() => {
    async function carregarListas() {
      const [{ data: cats }, { data: subs }, { data: cts }, { data: crts }] = await Promise.all([
        supabase.from('categorias').select('id, nome, tipo').order('nome'),
        supabase.from('subcategorias').select('id, categoria_id, nome').order('nome'),
        supabase.from('contas').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('cartoes_credito').select('id, nome').eq('ativo', true).order('nome'),
      ])
      setCategorias((cats ?? []) as Categoria[])
      setSubcategorias((subs ?? []) as Subcategoria[])
      setContas((cts ?? []) as Conta[])
      setCartoes((crts ?? []) as Cartao[])
    }
    carregarListas()
  }, [])

  useEffect(() => {
    if (!idEdicao) return

    async function carregarTransacao() {
      const { data: t, error } = await supabase
        .from('transacoes')
        .select(
          'data, descricao, categoria_id, subcategoria_id, valor, tipo, escopo, conta_id, cartao_id'
        )
        .eq('id', idEdicao)
        .single()

      if (!error && t) {
        setData(t.data)
        setDescricao(t.descricao)
        setCategoriaId(t.categoria_id ?? '')
        setSubcategoriaId(t.subcategoria_id ?? '')
        setValor(String(t.valor))
        setTipo(t.tipo)
        setEscopo(t.escopo)
        setContaId(t.conta_id ?? '')
        setCartaoId(t.cartao_id ?? '')
        setPagoCom(t.cartao_id ? 'cartao' : 'conta')
      } else {
        setMensagem('Não foi possível carregar este lançamento.')
      }
      setCarregando(false)
    }
    carregarTransacao()
  }, [idEdicao])

  async function sugerirAoSairDaDescricao() {
    // Não pisa numa categoria que a pessoa já escolheu — só ajuda quando
    // ela ainda não decidiu
    if (categoriaId || !descricao.trim()) return
    const sugestao = await sugerirCategoriaLancamento(descricao, tipo, categorias, subcategorias)
    if (!sugestao || categoriaId) return
    setCategoriaId(sugestao.categoriaId)
    if (sugestao.subcategoriaId) setSubcategoriaId(sugestao.subcategoriaId)
  }

  function montarRegistro() {
    return {
      data,
      descricao,
      categoria_id: categoriaId || null,
      subcategoria_id: subcategoriaId || null,
      valor: parseFloat(valor),
      tipo,
      escopo,
      conta_id: pagoCom === 'conta' ? contaId || null : null,
      cartao_id: pagoCom === 'cartao' ? cartaoId || null : null,
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMensagem('')

    if (idEdicao) {
      await salvarEdicao()
      return
    }

    // Edição não entra nessa checagem — quem já existe é o próprio
    // lançamento sendo editado, então soaria como duplicata dele mesmo
    setSalvando(true)
    const encontrados = await verificarDuplicata(data, descricao, parseFloat(valor), tipo)
    setSalvando(false)

    if (encontrados.length > 0) {
      setDuplicatas(encontrados)
      return
    }

    await salvarNovoLancamento()
  }

  async function salvarEdicao() {
    setSalvando(true)
    const { error } = await supabase.from('transacoes').update(montarRegistro()).eq('id', idEdicao)
    setSalvando(false)
    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }
    router.push('/transacoes')
  }

  async function salvarNovoLancamento() {
    setSalvando(true)
    setMensagem('')
    setDuplicatas(null)

    const registro = montarRegistro()
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    const quantidadeParcelas = parcelar ? Math.max(2, parseInt(parcelas || '2', 10)) : 1

    const registros =
      quantidadeParcelas === 1
        ? [{ ...registro, dono_id: userId, lancado_por: userId }]
        : montarParcelas(registro, quantidadeParcelas, userId)

    const { error } = await supabase.from('transacoes').insert(registros)

    setSalvando(false)
    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }

    setMensagem('Lançamento salvo com sucesso!')
    setDescricao('')
    setValor('')
  }

  async function apagar() {
    if (!idEdicao) return
    const confirmado = window.confirm(
      `Apagar o lançamento "${descricao}"?\n\nEsta ação não pode ser desfeita.`
    )
    if (!confirmado) return

    setApagando(true)
    const { error } = await supabase.from('transacoes').delete().eq('id', idEdicao)
    setApagando(false)

    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    router.push('/transacoes')
  }

  const categoriasFiltradas = categorias.filter((c) => c.tipo === tipo)
  const subcategoriasFiltradas = subcategorias.filter((s) => s.categoria_id === categoriaId)

  if (carregando) {
    return (
      <Pagina>
        <p className="text-sm text-texto-suave">Carregando...</p>
      </Pagina>
    )
  }

  const classeSeletorTipo = (valorTipo: string) =>
    `flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
      tipo === valorTipo
        ? valorTipo === 'receita'
          ? 'bg-receita text-white'
          : 'bg-despesa text-white'
        : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
    }`

  return (
    <Pagina>
      <CabecalhoPagina titulo={idEdicao ? 'Editar Lançamento' : 'Novo Lançamento'} />

      <form onSubmit={handleSubmit} className="cartao mx-auto max-w-2xl space-y-5 p-5">
        {/* Tipo */}
        <div className="flex gap-2">
          <button type="button" onClick={() => setTipo('despesa')} className={classeSeletorTipo('despesa')}>
            Despesa
          </button>
          <button type="button" onClick={() => setTipo('receita')} className={classeSeletorTipo('receita')}>
            Receita
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Data">
            <input
              type="date"
              className={classeInput}
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
            />
          </Campo>

          <Campo rotulo="Valor (R$)">
            <input
              type="number"
              step="0.01"
              className={classeInput}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              required
            />
          </Campo>
        </div>

        <Campo rotulo="Descrição">
          <input
            className={classeInput}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            onBlur={sugerirAoSairDaDescricao}
            placeholder="Ex: Supermercado"
            required
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Categoria">
            <select
              className={classeInput}
              value={categoriaId}
              onChange={(e) => {
                setCategoriaId(e.target.value)
                setSubcategoriaId('')
              }}
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
              value={subcategoriaId}
              onChange={(e) => setSubcategoriaId(e.target.value)}
              disabled={!categoriaId}
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

        {/* Forma de pagamento */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-texto">Pago com</span>
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setPagoCom('conta')}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                pagoCom === 'conta'
                  ? 'bg-marinho text-white'
                  : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
              }`}
            >
              Conta
            </button>
            <button
              type="button"
              onClick={() => setPagoCom('cartao')}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                pagoCom === 'cartao'
                  ? 'bg-marinho text-white'
                  : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
              }`}
            >
              Cartão de crédito
            </button>
          </div>

          {pagoCom === 'conta' ? (
            <select
              className={classeInput}
              value={contaId}
              onChange={(e) => setContaId(e.target.value)}
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
              value={cartaoId}
              onChange={(e) => setCartaoId(e.target.value)}
            >
              <option value="">Selecione o cartão...</option>
              {cartoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}

          {pagoCom === 'conta' && contas.length === 0 && (
            <p className="mt-2 text-xs text-texto-suave">
              Nenhuma conta cadastrada ainda —{' '}
              <a href="/contas" className="font-medium text-primaria hover:underline">
                cadastrar agora
              </a>
            </p>
          )}
          {pagoCom === 'cartao' && cartoes.length === 0 && (
            <p className="mt-2 text-xs text-texto-suave">
              Nenhum cartão cadastrado ainda —{' '}
              <a href="/cartoes" className="font-medium text-primaria hover:underline">
                cadastrar agora
              </a>
            </p>
          )}
        </div>

        <Campo rotulo="Este lançamento é...">
          <select
            className={classeInput}
            value={escopo}
            onChange={(e) => setEscopo(e.target.value)}
          >
            <option value="familiar">Familiar (todos veem)</option>
            <option value="pessoal">Pessoal (só eu vejo)</option>
          </select>
        </Campo>

        {/* Parcelamento só faz sentido ao criar; ao editar, mexe-se numa parcela só */}
        {!idEdicao && (
          <div className="rounded-lg border border-borda p-3">
            <label className="flex items-center gap-2 text-sm text-texto">
              <input
                type="checkbox"
                checked={parcelar}
                onChange={(e) => setParcelar(e.target.checked)}
              />
              Parcelar em várias vezes
            </label>

            {parcelar && (
              <div className="mt-3">
                <Campo rotulo="Número de parcelas">
                  <input
                    type="number"
                    min="2"
                    max="120"
                    className={classeInput}
                    value={parcelas}
                    onChange={(e) => setParcelas(e.target.value)}
                  />
                </Campo>
                {parseFloat(valor) > 0 && parseInt(parcelas || '0', 10) >= 2 && (
                  <p className="mt-1.5 text-xs text-texto-suave">
                    {parcelas}x de aproximadamente{' '}
                    {moeda(parseFloat(valor) / parseInt(parcelas, 10))}, uma por mês. O valor total
                    de {moeda(parseFloat(valor))} é mantido — os centavos da divisão vão para a
                    última parcela.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <Mensagem texto={mensagem} />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borda pt-4">
          {idEdicao ? (
            <button
              type="button"
              onClick={apagar}
              disabled={apagando}
              className="inline-flex items-center gap-2 rounded-lg border border-despesa/30 px-4 py-2.5 text-sm font-medium text-despesa transition-colors hover:bg-despesa/10 disabled:opacity-50"
            >
              <IconeLixeira className="h-4 w-4" />
              {apagando ? 'Apagando...' : 'Apagar lançamento'}
            </button>
          ) : (
            <span />
          )}

          <div className="ml-auto flex gap-2">
            <BotaoSecundario type="button" onClick={() => router.push('/transacoes')}>
              Cancelar
            </BotaoSecundario>
            <BotaoPrimario type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : idEdicao ? 'Salvar alterações' : 'Salvar lançamento'}
            </BotaoPrimario>
          </div>
        </div>
      </form>

      <Modal
        aberto={!!duplicatas}
        titulo="Este lançamento parece repetido"
        onFechar={() => setDuplicatas(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-texto-suave">
            Já {duplicatas?.length === 1 ? 'existe um lançamento' : `existem ${duplicatas?.length} lançamentos`}{' '}
            com a mesma data, descrição, valor e tipo:
          </p>

          <ul className="divide-y divide-borda rounded-lg border border-borda">
            {duplicatas?.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-texto">{d.descricao}</p>
                  <p className="text-xs text-texto-suave">{d.data.split('-').reverse().join('/')}</p>
                </div>
                <span
                  className={`shrink-0 font-semibold ${
                    d.tipo === 'receita' ? 'text-receita' : 'text-despesa'
                  }`}
                >
                  {moeda(d.valor)}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-sm text-texto-suave">
            Quer lançar mesmo assim ou cancelar para revisar?
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <BotaoSecundario type="button" onClick={() => setDuplicatas(null)}>
              Cancelar
            </BotaoSecundario>
            <BotaoPrimario type="button" onClick={salvarNovoLancamento} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Lançar mesmo assim'}
            </BotaoPrimario>
          </div>
        </div>
      </Modal>
    </Pagina>
  )
}

export default function LancamentosPage() {
  return (
    <Suspense
      fallback={
        <Pagina>
          <p className="text-sm text-texto-suave">Carregando...</p>
        </Pagina>
      }
    >
      <FormularioLancamento />
    </Suspense>
  )
}
