'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { IconeLixeira, IconeMais } from '@/components/Icones'
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

type Categoria = {
  id: string
  nome: string
  tipo: string
  natureza: string | null
  segue_mes_salario: boolean
}

type Subcategoria = {
  id: string
  categoria_id: string
  nome: string
  grupo_503020: string | null
}

// Grupo da régua 50/30/20; só faz sentido em subcategoria de despesa
const OPCOES_GRUPO: { valor: string; rotulo: string }[] = [
  { valor: 'necessidade', rotulo: 'Essenciais' },
  { valor: 'desejo', rotulo: 'Qualidade de Vida' },
  { valor: 'investimento', rotulo: 'Futuro' },
  { valor: 'deducao', rotulo: 'Descontos obrigatórios' },
]
const rotuloGrupo = (g: string | null) => OPCOES_GRUPO.find((o) => o.valor === g)?.rotulo ?? 'Sem grupo'

/** Grupo mais usado pelas outras subcategorias da mesma categoria */
function grupoSugerido(sub: Subcategoria, todas: Subcategoria[]): string | null {
  const contagem = new Map<string, number>()
  for (const s of todas) {
    if (s.categoria_id !== sub.categoria_id || s.id === sub.id || !s.grupo_503020) continue
    contagem.set(s.grupo_503020, (contagem.get(s.grupo_503020) ?? 0) + 1)
  }
  let melhor: string | null = null
  for (const [g, n] of contagem) if (!melhor || n > (contagem.get(melhor) ?? 0)) melhor = g
  return melhor
}

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [aba, setAba] = useState<'despesa' | 'receita'>('despesa')
  const [mensagem, setMensagem] = useState('')

  const [modalCategoria, setModalCategoria] = useState(false)
  const [modalSub, setModalSub] = useState(false)
  const [editandoCategoria, setEditandoCategoria] = useState<Categoria | null>(null)
  const [editandoSub, setEditandoSub] = useState<Subcategoria | null>(null)
  const [formCategoria, setFormCategoria] = useState({ nome: '', tipo: 'despesa', natureza: '' })
  const [formSub, setFormSub] = useState({ nome: '', categoria_id: '' })
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    const [{ data: cats }, { data: subs }, { data: perfil }] = await Promise.all([
      supabase.from('categorias').select('id, nome, tipo, natureza, segue_mes_salario').order('nome'),
      supabase.from('subcategorias').select('id, categoria_id, nome, grupo_503020').order('nome'),
      userId
        ? supabase.from('perfis').select('papel').eq('id', userId).single()
        : Promise.resolve({ data: null }),
    ])

    setCategorias((cats ?? []) as Categoria[])
    setSubcategorias((subs ?? []) as Subcategoria[])
    setIsAdmin(perfil?.papel === 'admin')
    setCarregando(false)
  }, [])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  async function definirGrupo(sub: Subcategoria, grupo: string | null) {
    setMensagem('')
    const { error } = await supabase.from('subcategorias').update({ grupo_503020: grupo }).eq('id', sub.id)
    if (error) {
      setMensagem('Não foi possível mudar o grupo. Tente novamente.')
      return
    }
    setSubcategorias((atual) => atual.map((s) => (s.id === sub.id ? { ...s, grupo_503020: grupo } : s)))
  }

  async function definirMesSalario(categoria: Categoria, segue: boolean) {
    setMensagem('')
    const { error } = await supabase
      .from('categorias')
      .update({ segue_mes_salario: segue })
      .eq('id', categoria.id)
    if (error) {
      setMensagem('Não foi possível mudar o mês da categoria. Tente novamente.')
      return
    }
    setCategorias((atual) =>
      atual.map((c) => (c.id === categoria.id ? { ...c, segue_mes_salario: segue } : c))
    )
  }

  const semGrupo = subcategorias.filter(
    (s) => !s.grupo_503020 && categorias.find((c) => c.id === s.categoria_id)?.tipo === 'despesa'
  ).length

  const categoriasDaAba = useMemo(
    () => categorias.filter((c) => c.tipo === aba),
    [categorias, aba]
  )

  function abrirNovaCategoria() {
    setEditandoCategoria(null)
    setFormCategoria({ nome: '', tipo: aba, natureza: '' })
    setMensagem('')
    setModalCategoria(true)
  }

  function abrirEdicaoCategoria(categoria: Categoria) {
    setEditandoCategoria(categoria)
    setFormCategoria({
      nome: categoria.nome,
      tipo: categoria.tipo,
      natureza: categoria.natureza ?? '',
    })
    setMensagem('')
    setModalCategoria(true)
  }

  function abrirNovaSub(categoriaId: string) {
    setEditandoSub(null)
    setFormSub({ nome: '', categoria_id: categoriaId })
    setMensagem('')
    setModalSub(true)
  }

  function abrirEdicaoSub(sub: Subcategoria) {
    setEditandoSub(sub)
    setFormSub({ nome: sub.nome, categoria_id: sub.categoria_id })
    setMensagem('')
    setModalSub(true)
  }

  async function salvarCategoria(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setMensagem('')

    const registro = {
      nome: formCategoria.nome,
      tipo: formCategoria.tipo,
      natureza: formCategoria.tipo === 'despesa' ? formCategoria.natureza || null : null,
    }

    const { error } = editandoCategoria
      ? await supabase.from('categorias').update(registro).eq('id', editandoCategoria.id)
      : await supabase.from('categorias').insert(registro)

    setSalvando(false)
    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }
    setModalCategoria(false)
    carregar()
  }

  async function salvarSub(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setMensagem('')

    const registro = { nome: formSub.nome, categoria_id: formSub.categoria_id }

    const { error } = editandoSub
      ? await supabase.from('subcategorias').update(registro).eq('id', editandoSub.id)
      : await supabase.from('subcategorias').insert(registro)

    setSalvando(false)
    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }
    setModalSub(false)
    carregar()
  }

  async function apagarCategoria(categoria: Categoria) {
    const qtdSubs = subcategorias.filter((s) => s.categoria_id === categoria.id).length
    const confirmado = window.confirm(
      `Apagar a categoria "${categoria.nome}"?` +
        (qtdSubs ? `\n\nEla tem ${qtdSubs} subcategoria(s), que também serão afetadas.` : '') +
        '\n\nLançamentos já classificados nela ficarão sem categoria.'
    )
    if (!confirmado) return

    const { error } = await supabase.from('categorias').delete().eq('id', categoria.id)
    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    carregar()
  }

  async function apagarSub(sub: Subcategoria) {
    if (!window.confirm(`Apagar a subcategoria "${sub.nome}"?`)) return
    const { error } = await supabase.from('subcategorias').delete().eq('id', sub.id)
    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    carregar()
  }

  const classeAba = (valor: string) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
      aba === valor
        ? 'bg-primaria text-sobre-cor'
        : 'border border-borda bg-superficie text-texto-suave hover:bg-fundo'
    }`

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Categorias"
        descricao="Dois níveis de classificação usados nos lançamentos e relatórios."
        acao={
          isAdmin ? (
            <BotaoPrimario onClick={abrirNovaCategoria}>
              <IconeMais className="h-4 w-4" />
              Nova categoria
            </BotaoPrimario>
          ) : undefined
        }
      />

      {!isAdmin && !carregando && (
        <p className="mb-4 rounded-lg border border-borda bg-superficie px-4 py-3 text-sm text-texto-suave">
          Apenas o administrador pode criar ou alterar categorias.
        </p>
      )}

      {aba === 'despesa' && semGrupo > 0 && !carregando && (
        <p className="mb-4 rounded-lg border border-alerta/30 bg-alerta/10 px-4 py-3 text-sm text-texto">
          {semGrupo} subcategoria{semGrupo > 1 ? 's' : ''} de despesa sem grupo 50/30/20. Os gastos
          nelas aparecem como &quot;Sem grupo&quot; na régua do Início e na Calculadora.
        </p>
      )}

      <div className="mb-5 flex gap-2">
        <button onClick={() => setAba('despesa')} className={classeAba('despesa')}>
          Despesas
        </button>
        <button onClick={() => setAba('receita')} className={classeAba('receita')}>
          Receitas
        </button>
      </div>

      <Mensagem texto={mensagem} />

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {!carregando && categoriasDaAba.length === 0 && (
        <EstadoVazio titulo={`Nenhuma categoria de ${aba} cadastrada`} />
      )}

      {!carregando && categoriasDaAba.length > 0 && (
        <div className="space-y-3">
          {categoriasDaAba.map((categoria) => {
            const subs = subcategorias.filter((s) => s.categoria_id === categoria.id)
            return (
              <div key={categoria.id} className="cartao p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-texto">{categoria.nome}</p>
                    <p className="text-xs text-texto-suave">
                      {subs.length} subcategoria{subs.length === 1 ? '' : 's'}
                      {categoria.natureza ? ` · ${categoria.natureza}` : ''}
                    </p>
                    {isAdmin ? (
                      <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 text-xs text-texto-suave">
                        <input
                          type="checkbox"
                          checked={categoria.segue_mes_salario}
                          onChange={(e) => definirMesSalario(categoria, e.target.checked)}
                          className="h-4 w-4 accent-primaria"
                        />
                        Segue o mês do salário (a partir do dia 26 conta para o mês seguinte)
                      </label>
                    ) : (
                      categoria.segue_mes_salario && (
                        <span className="mt-1 inline-block rounded-full bg-primaria/10 px-2 py-0.5 text-xs text-primaria">
                          Segue o mês do salário
                        </span>
                      )
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => abrirNovaSub(categoria.id)}
                        className="text-xs font-medium text-primaria hover:underline"
                      >
                        + Subcategoria
                      </button>
                      <button
                        onClick={() => abrirEdicaoCategoria(categoria)}
                        className="text-xs font-medium text-texto-suave hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => apagarCategoria(categoria)}
                        aria-label={`Apagar ${categoria.nome}`}
                        className="rounded-lg p-2.5 text-texto-suave transition-colors hover:bg-despesa/10 hover:text-despesa"
                      >
                        <IconeLixeira className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {subs.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-borda pt-3">
                    {subs.map((sub) => {
                      const sugestao = aba === 'despesa' && !sub.grupo_503020 ? grupoSugerido(sub, subcategorias) : null
                      return (
                      <li
                        key={sub.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-fundo"
                      >
                        <span className="min-w-0 text-texto-suave">{sub.nome}</span>
                        <span className="flex flex-wrap items-center gap-2">
                        {aba === 'despesa' &&
                          (isAdmin ? (
                            <>
                              {sugestao && (
                                <button
                                  type="button"
                                  onClick={() => definirGrupo(sub, sugestao)}
                                  className="min-h-10 rounded-lg border border-alerta/40 bg-alerta/10 px-2.5 text-xs font-semibold text-alerta"
                                >
                                  Usar {rotuloGrupo(sugestao)}
                                </button>
                              )}
                              <select
                                value={sub.grupo_503020 ?? ''}
                                onChange={(e) => definirGrupo(sub, e.target.value || null)}
                                aria-label={`Grupo 50/30/20 de ${sub.nome}`}
                                className={`min-h-10 rounded-lg border px-2 text-sm ${
                                  sub.grupo_503020 ? 'border-borda text-texto' : 'border-alerta/50 text-alerta'
                                }`}
                              >
                                <option value="">Sem grupo</option>
                                {OPCOES_GRUPO.map((o) => (
                                  <option key={o.valor} value={o.valor}>
                                    {o.rotulo}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                sub.grupo_503020 ? 'bg-fundo text-texto-suave' : 'bg-alerta/12 text-alerta'
                              }`}
                            >
                              {rotuloGrupo(sub.grupo_503020)}
                            </span>
                          ))}
                        {isAdmin && (
                          <span className="flex items-center gap-3">
                            <button
                              onClick={() => abrirEdicaoSub(sub)}
                              className="text-xs text-texto-suave hover:underline"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => apagarSub(sub)}
                              aria-label={`Apagar ${sub.nome}`}
                              className="rounded-lg p-2.5 text-texto-suave transition-colors hover:bg-despesa/10 hover:text-despesa"
                            >
                              <IconeLixeira className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        )}
                        </span>
                      </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de categoria */}
      <Modal
        aberto={modalCategoria}
        titulo={editandoCategoria ? 'Editar categoria' : 'Nova categoria'}
        onFechar={() => setModalCategoria(false)}
      >
        <form onSubmit={salvarCategoria} className="space-y-4">
          <Campo rotulo="Nome">
            <input
              className={classeInput}
              value={formCategoria.nome}
              onChange={(e) => setFormCategoria({ ...formCategoria, nome: e.target.value })}
              placeholder="Ex: Alimentação"
              required
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Tipo">
              <select
                className={classeInput}
                value={formCategoria.tipo}
                onChange={(e) => setFormCategoria({ ...formCategoria, tipo: e.target.value })}
              >
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
            </Campo>

            {formCategoria.tipo === 'despesa' && (
              <Campo rotulo="Natureza">
                <select
                  className={classeInput}
                  value={formCategoria.natureza}
                  onChange={(e) =>
                    setFormCategoria({ ...formCategoria, natureza: e.target.value })
                  }
                >
                  <option value="">Não definida</option>
                  <option value="fixa">Fixa</option>
                  <option value="variavel">Variável</option>
                </select>
              </Campo>
            )}
          </div>

          <Mensagem texto={mensagem} />

          <div className="flex justify-end gap-2 pt-2">
            <BotaoSecundario type="button" onClick={() => setModalCategoria(false)}>
              Cancelar
            </BotaoSecundario>
            <BotaoPrimario type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </BotaoPrimario>
          </div>
        </form>
      </Modal>

      {/* Modal de subcategoria */}
      <Modal
        aberto={modalSub}
        titulo={editandoSub ? 'Editar subcategoria' : 'Nova subcategoria'}
        onFechar={() => setModalSub(false)}
      >
        <form onSubmit={salvarSub} className="space-y-4">
          <Campo rotulo="Categoria">
            <select
              className={classeInput}
              value={formSub.categoria_id}
              onChange={(e) => setFormSub({ ...formSub, categoria_id: e.target.value })}
              required
            >
              <option value="">Selecione...</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Nome da subcategoria">
            <input
              className={classeInput}
              value={formSub.nome}
              onChange={(e) => setFormSub({ ...formSub, nome: e.target.value })}
              placeholder="Ex: Supermercado"
              required
            />
          </Campo>

          <Mensagem texto={mensagem} />

          <div className="flex justify-end gap-2 pt-2">
            <BotaoSecundario type="button" onClick={() => setModalSub(false)}>
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
