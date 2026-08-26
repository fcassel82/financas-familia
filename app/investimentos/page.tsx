'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { dataBR, hojeISO, moeda } from '@/lib/formato'
import { IconeCofre, IconeLixeira, IconeMais } from '@/components/Icones'
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

type Investimento = {
  id: string
  nome: string
  tipo: string | null
  instituicao: string | null
  valor_investido: number
  data_investimento: string | null
}

const TIPOS = [
  'Renda Fixa',
  'Tesouro Direto',
  'CDB',
  'LCI / LCA',
  'Fundo de Investimento',
  'Ações',
  'FII',
  'Previdência Privada',
  'Cripto',
  'Outro',
]

export default function InvestimentosPage() {
  const [investimentos, setInvestimentos] = useState<Investimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState({
    nome: '',
    tipo: TIPOS[0],
    instituicao: '',
    valor_investido: '',
    data_investimento: hojeISO(),
  })
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    const { data: perfil } = userId
      ? await supabase.from('perfis').select('papel').eq('id', userId).single()
      : { data: null }

    const admin = perfil?.papel === 'admin'
    setIsAdmin(admin)

    if (admin) {
      const { data } = await supabase
        .from('investimentos')
        .select('id, nome, tipo, instituicao, valor_investido, data_investimento')
        .order('data_investimento', { ascending: false })
      setInvestimentos((data ?? []) as Investimento[])
    }

    setCarregando(false)
  }, [])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  function abrirNovo() {
    setEditandoId(null)
    setForm({
      nome: '',
      tipo: TIPOS[0],
      instituicao: '',
      valor_investido: '',
      data_investimento: hojeISO(),
    })
    setMensagem('')
    setModalAberto(true)
  }

  function abrirEdicao(inv: Investimento) {
    setEditandoId(inv.id)
    setForm({
      nome: inv.nome,
      tipo: inv.tipo ?? TIPOS[0],
      instituicao: inv.instituicao ?? '',
      valor_investido: String(inv.valor_investido),
      data_investimento: inv.data_investimento ?? hojeISO(),
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
      valor_investido: parseFloat(form.valor_investido || '0'),
      data_investimento: form.data_investimento,
    }

    const { error } = editandoId
      ? await supabase.from('investimentos').update(registro).eq('id', editandoId)
      : await supabase.from('investimentos').insert({ ...registro, dono_id: userId })

    setSalvando(false)
    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }
    setModalAberto(false)
    carregar()
  }

  async function apagar(inv: Investimento) {
    if (!window.confirm(`Apagar o investimento "${inv.nome}"?`)) return
    const { error } = await supabase.from('investimentos').delete().eq('id', inv.id)
    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    carregar()
  }

  const total = investimentos.reduce((soma, i) => soma + Number(i.valor_investido), 0)

  if (!carregando && !isAdmin) {
    return (
      <Pagina>
        <CabecalhoPagina titulo="Investimentos" />
        <EstadoVazio
          titulo="Acesso restrito"
          descricao="A carteira de investimentos é visível apenas para o administrador."
        />
      </Pagina>
    )
  }

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Carteira de Investimentos"
        descricao="Visível apenas para o administrador."
        acao={
          <BotaoPrimario onClick={abrirNovo}>
            <IconeMais className="h-4 w-4" />
            Novo investimento
          </BotaoPrimario>
        }
      />

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {!carregando && investimentos.length === 0 && (
        <EstadoVazio
          titulo="Nenhum investimento cadastrado"
          descricao="Registre seus aportes para acompanhar o total investido."
          acao={<BotaoPrimario onClick={abrirNovo}>Cadastrar primeiro investimento</BotaoPrimario>}
        />
      )}

      {!carregando && investimentos.length > 0 && (
        <>
          <div className="cartao mb-5 flex items-center justify-between p-4">
            <span className="text-sm text-texto-suave">Total investido</span>
            <span className="whitespace-nowrap text-xl font-bold text-primaria">{moeda(total)}</span>
          </div>

          <div className="cartao divide-y divide-borda">
            {investimentos.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primaria/10 text-primaria">
                    <IconeCofre className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-texto">{inv.nome}</p>
                    <p className="truncate text-xs text-texto-suave">
                      {inv.tipo}
                      {inv.instituicao ? ` · ${inv.instituicao}` : ''}
                      {inv.data_investimento ? ` · ${dataBR(inv.data_investimento)}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="whitespace-nowrap font-semibold text-texto">
                    {moeda(inv.valor_investido)}
                  </span>
                  <button
                    onClick={() => abrirEdicao(inv)}
                    className="text-xs font-medium text-primaria hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => apagar(inv)}
                    aria-label={`Apagar ${inv.nome}`}
                    className="rounded p-1.5 text-texto-suave transition-colors hover:bg-despesa/10 hover:text-despesa"
                  >
                    <IconeLixeira className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal
        aberto={modalAberto}
        titulo={editandoId ? 'Editar investimento' : 'Novo investimento'}
        onFechar={() => setModalAberto(false)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <Campo rotulo="Nome">
            <input
              className={classeInput}
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Tesouro Selic 2029"
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
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Instituição (opcional)">
              <input
                className={classeInput}
                value={form.instituicao}
                onChange={(e) => setForm({ ...form, instituicao: e.target.value })}
                placeholder="Ex: Itaú, XP"
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Valor investido (R$)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={form.valor_investido}
                onChange={(e) => setForm({ ...form, valor_investido: e.target.value })}
                required
              />
            </Campo>
            <Campo rotulo="Data do aporte">
              <input
                type="date"
                className={classeInput}
                value={form.data_investimento}
                onChange={(e) => setForm({ ...form, data_investimento: e.target.value })}
                required
              />
            </Campo>
          </div>

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
