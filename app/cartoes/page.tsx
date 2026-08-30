'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { moeda } from '@/lib/formato'
import { IconeCartao, IconeLixeira, IconeMais } from '@/components/Icones'
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

type Cartao = {
  id: string
  nome: string
  bandeira: string | null
  limite: number | null
  dia_fechamento: number | null
  dia_vencimento: number | null
  conta_pagamento_id: string | null
  cor: string | null
  escopo: string
  dono_id: string
}

type Conta = { id: string; nome: string }
type Membro = { id: string; nome: string }

const CORES = ['#eb6834', '#2a78d6', '#159d76', '#7c4dcc', '#d98324', '#dc4c4c', '#1c3a52']

const FORM_VAZIO = {
  nome: '',
  bandeira: '',
  limite: '',
  dia_fechamento: '',
  dia_vencimento: '',
  conta_pagamento_id: '',
  cor: CORES[0],
  escopo: 'familiar',
}

export default function CartoesPage() {
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [gastoPorCartao, setGastoPorCartao] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [membros, setMembros] = useState<Membro[]>([])
  const [membroFiltro, setMembroFiltro] = useState('')

  const carregar = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    const [{ data: cartoesData }, { data: contasData }, { data: movimentos }, { data: perfil }] =
      await Promise.all([
        supabase.from('cartoes_credito').select('*').order('nome'),
        supabase.from('contas').select('id, nome').order('nome'),
        supabase.from('transacoes').select('cartao_id, valor, tipo').eq('status', 'pago'),
        userId
          ? supabase.from('perfis').select('papel').eq('id', userId).single()
          : Promise.resolve({ data: null }),
      ])

    setCartoes((cartoesData ?? []) as Cartao[])
    setContas((contasData ?? []) as Conta[])

    const admin = perfil?.papel === 'admin'
    setIsAdmin(admin)
    if (admin) {
      const { data: membrosData } = await supabase.from('perfis').select('id, nome').order('nome')
      if (membrosData) setMembros(membrosData)
    }

    const acumulado: Record<string, number> = {}
    for (const m of movimentos ?? []) {
      if (!m.cartao_id || m.tipo !== 'despesa') continue
      acumulado[m.cartao_id] = (acumulado[m.cartao_id] ?? 0) + Number(m.valor)
    }
    setGastoPorCartao(acumulado)
    setCarregando(false)
  }, [])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const cartoesVisiveis = membroFiltro
    ? cartoes.filter((c) => c.dono_id === membroFiltro)
    : cartoes

  function abrirNovo() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setMensagem('')
    setModalAberto(true)
  }

  function abrirEdicao(cartao: Cartao) {
    setEditandoId(cartao.id)
    setForm({
      nome: cartao.nome,
      bandeira: cartao.bandeira ?? '',
      limite: cartao.limite != null ? String(cartao.limite) : '',
      dia_fechamento: cartao.dia_fechamento != null ? String(cartao.dia_fechamento) : '',
      dia_vencimento: cartao.dia_vencimento != null ? String(cartao.dia_vencimento) : '',
      conta_pagamento_id: cartao.conta_pagamento_id ?? '',
      cor: cartao.cor ?? CORES[0],
      escopo: cartao.escopo,
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
      bandeira: form.bandeira || null,
      limite: form.limite ? parseFloat(form.limite) : null,
      dia_fechamento: form.dia_fechamento ? parseInt(form.dia_fechamento, 10) : null,
      dia_vencimento: form.dia_vencimento ? parseInt(form.dia_vencimento, 10) : null,
      conta_pagamento_id: form.conta_pagamento_id || null,
      cor: form.cor,
      escopo: form.escopo,
    }

    const { error } = editandoId
      ? await supabase.from('cartoes_credito').update(registro).eq('id', editandoId)
      : await supabase.from('cartoes_credito').insert({ ...registro, dono_id: userId })

    setSalvando(false)

    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }

    setModalAberto(false)
    carregar()
  }

  async function apagar(cartao: Cartao) {
    const confirmado = window.confirm(
      `Apagar o cartão "${cartao.nome}"?\n\nOs lançamentos ligados a ele NÃO serão apagados — apenas ficarão sem cartão.`
    )
    if (!confirmado) return

    const { error } = await supabase.from('cartoes_credito').delete().eq('id', cartao.id)
    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    carregar()
  }

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Cartões de Crédito"
        descricao="Cadastre seus cartões com limite, fechamento e vencimento da fatura."
        acao={
          <BotaoPrimario onClick={abrirNovo}>
            <IconeMais className="h-4 w-4" />
            Novo cartão
          </BotaoPrimario>
        }
      />

      {isAdmin && membros.length > 0 && (
        <div className="cartao mb-5 p-4">
          <Campo rotulo="Exibir cartões de">
            <select
              className={classeInput}
              value={membroFiltro}
              onChange={(e) => setMembroFiltro(e.target.value)}
            >
              <option value="">Todos os membros</option>
              {membros.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </Campo>
        </div>
      )}

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {!carregando && cartoes.length === 0 && (
        <EstadoVazio
          titulo="Nenhum cartão cadastrado"
          descricao="Cadastre seus cartões de crédito para separar as compras da fatura dos gastos da conta corrente."
          acao={<BotaoPrimario onClick={abrirNovo}>Cadastrar primeiro cartão</BotaoPrimario>}
        />
      )}

      {!carregando && cartoes.length > 0 && cartoesVisiveis.length === 0 && (
        <EstadoVazio
          titulo="Nenhum cartão deste membro"
          descricao="Tente outro membro no filtro acima."
        />
      )}

      {!carregando && cartoesVisiveis.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cartoesVisiveis.map((cartao) => {
            const gasto = gastoPorCartao[cartao.id] ?? 0
            const limite = cartao.limite ?? 0
            const percentual = limite > 0 ? Math.min(100, (gasto / limite) * 100) : 0
            return (
              <div key={cartao.id} className="cartao overflow-hidden">
                <div
                  className="flex items-start justify-between p-4 text-white"
                  style={{ backgroundColor: cartao.cor ?? CORES[0] }}
                >
                  <div className="flex items-center gap-3">
                    <IconeCartao className="h-5 w-5" />
                    <div>
                      <p className="font-medium">{cartao.nome}</p>
                      <p className="text-xs text-white/80">
                        {cartao.bandeira || 'Cartão de crédito'}
                        {cartao.escopo === 'pessoal' ? ' · Pessoal' : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => apagar(cartao)}
                    aria-label={`Apagar ${cartao.nome}`}
                    className="rounded p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                  >
                    <IconeLixeira className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 p-4">
                  <div>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="text-texto-suave">Gasto acumulado</span>
                      <span className="font-semibold text-texto">{moeda(gasto)}</span>
                    </div>
                    {limite > 0 && (
                      <>
                        <div className="h-1.5 overflow-hidden rounded-full bg-fundo">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${percentual}%`,
                              backgroundColor: percentual > 80 ? 'var(--despesa)' : 'var(--primaria)',
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-texto-suave">
                          Limite de {moeda(limite)}
                        </p>
                      </>
                    )}
                  </div>

                  {(cartao.dia_fechamento || cartao.dia_vencimento) && (
                    <div className="flex gap-4 text-xs text-texto-suave">
                      {cartao.dia_fechamento && <span>Fecha dia {cartao.dia_fechamento}</span>}
                      {cartao.dia_vencimento && <span>Vence dia {cartao.dia_vencimento}</span>}
                    </div>
                  )}

                  <button
                    onClick={() => abrirEdicao(cartao)}
                    className="text-xs font-medium text-primaria hover:underline"
                  >
                    Editar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        aberto={modalAberto}
        titulo={editandoId ? 'Editar cartão' : 'Novo cartão'}
        onFechar={() => setModalAberto(false)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome">
              <input
                className={classeInput}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Itaú Visa"
                required
              />
            </Campo>
            <Campo rotulo="Bandeira (opcional)">
              <input
                className={classeInput}
                value={form.bandeira}
                onChange={(e) => setForm({ ...form, bandeira: e.target.value })}
                placeholder="Ex: Visa, Mastercard"
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Limite (R$)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={form.limite}
                onChange={(e) => setForm({ ...form, limite: e.target.value })}
                placeholder="0,00"
              />
            </Campo>
            <Campo rotulo="Dia do fechamento">
              <input
                type="number"
                min="1"
                max="31"
                className={classeInput}
                value={form.dia_fechamento}
                onChange={(e) => setForm({ ...form, dia_fechamento: e.target.value })}
                placeholder="Ex: 5"
              />
            </Campo>
            <Campo rotulo="Dia do vencimento">
              <input
                type="number"
                min="1"
                max="31"
                className={classeInput}
                value={form.dia_vencimento}
                onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })}
                placeholder="Ex: 12"
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Conta usada no pagamento">
              <select
                className={classeInput}
                value={form.conta_pagamento_id}
                onChange={(e) => setForm({ ...form, conta_pagamento_id: e.target.value })}
              >
                <option value="">Nenhuma</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
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
