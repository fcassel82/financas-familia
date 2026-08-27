'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { dataBR, diasAte, hojeISO, moeda } from '@/lib/formato'
import { calcularDuracaoGas } from '@/lib/calculos'
import { IconeAlerta, IconeChama, IconeLixeira, IconeMais } from '@/components/Icones'
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

type Troca = {
  id: string
  data: string
  valor: number
  fornecedor: string | null
  observacoes: string | null
}

const FORM_VAZIO = {
  data: hojeISO(),
  valor: '',
  fornecedor: '',
  observacoes: '',
}

export default function GasPage() {
  const [trocas, setTrocas] = useState<Troca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('trocas_gas')
      .select('id, data, valor, fornecedor, observacoes')
      .order('data', { ascending: false })
    setTrocas((data ?? []) as Troca[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const comDuracao = useMemo(() => calcularDuracaoGas(trocas), [trocas])

  const resumo = useMemo(() => {
    const comDados = comDuracao.filter((t) => t.diasDuracao !== null)

    const duracaoMedia =
      comDados.length > 0
        ? comDados.reduce((s, t) => s + (t.diasDuracao ?? 0), 0) / comDados.length
        : null

    const custoDiaMedio =
      comDados.length > 0
        ? comDados.reduce((s, t) => s + (t.custoDia ?? 0), 0) / comDados.length
        : null

    // O botijão atual é o da troca mais recente; ainda está em uso
    const ultima = comDuracao[0] ?? null
    const diasEmUso = ultima ? -diasAte(ultima.data) : null

    const precoMedio =
      trocas.length > 0 ? trocas.reduce((s, t) => s + Number(t.valor), 0) / trocas.length : null

    return {
      duracaoMedia,
      custoDiaMedio,
      precoMedio,
      ultima,
      diasEmUso,
      // Estimativa de quando acaba, com base na duração média
      diasRestantes:
        duracaoMedia !== null && diasEmUso !== null
          ? Math.round(duracaoMedia - diasEmUso)
          : null,
      gastoTotal: trocas.reduce((s, t) => s + Number(t.valor), 0),
    }
  }, [comDuracao, trocas])

  function abrirNova() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setMensagem('')
    setModalAberto(true)
  }

  function abrirEdicao(t: Troca) {
    setEditandoId(t.id)
    setForm({
      data: t.data,
      valor: String(t.valor),
      fornecedor: t.fornecedor ?? '',
      observacoes: t.observacoes ?? '',
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
      data: form.data,
      valor: parseFloat(form.valor || '0'),
      fornecedor: form.fornecedor || null,
      observacoes: form.observacoes || null,
    }

    const { error } = editandoId
      ? await supabase.from('trocas_gas').update(registro).eq('id', editandoId)
      : await supabase.from('trocas_gas').insert({ ...registro, dono_id: userId })

    setSalvando(false)
    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }
    setModalAberto(false)
    carregar()
  }

  async function apagar(t: Troca) {
    if (!window.confirm(`Apagar a troca de ${dataBR(t.data)}?`)) return
    const { error } = await supabase.from('trocas_gas').delete().eq('id', t.id)
    if (error) {
      setMensagem('Erro ao apagar: ' + error.message)
      return
    }
    carregar()
  }

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Chuveiro a Gás"
        descricao="Trocas de botijão, para saber quanto dura e quanto custa por dia."
        acao={
          <BotaoPrimario onClick={abrirNova}>
            <IconeMais className="h-4 w-4" />
            Nova troca
          </BotaoPrimario>
        }
      />

      {trocas.length > 0 && (
        <>
          {/* Botijão em uso */}
          {resumo.ultima && (
            <div className="cartao mb-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-alerta/10 text-alerta">
                    <IconeChama className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-medium text-texto">Botijão em uso</p>
                    <p className="text-xs text-texto-suave">
                      Trocado em {dataBR(resumo.ultima.data)}
                      {resumo.diasEmUso !== null ? ` · há ${resumo.diasEmUso} dias` : ''}
                    </p>
                  </div>
                </div>
                <span className="whitespace-nowrap text-sm font-semibold text-texto">
                  {moeda(resumo.ultima.valor)}
                </span>
              </div>

              {resumo.duracaoMedia !== null && resumo.diasRestantes !== null && (
                <>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-fundo">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(0, ((resumo.diasEmUso ?? 0) / resumo.duracaoMedia) * 100))}%`,
                        backgroundColor:
                          resumo.diasRestantes <= 5 ? 'var(--despesa)' : 'var(--alerta)',
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-texto-suave">
                    {resumo.diasRestantes > 0
                      ? `Pela média, deve durar mais ${resumo.diasRestantes} dia${resumo.diasRestantes === 1 ? '' : 's'}.`
                      : `Já passou ${Math.abs(resumo.diasRestantes)} dia${Math.abs(resumo.diasRestantes) === 1 ? '' : 's'} da duração média — pode acabar a qualquer momento.`}
                  </p>
                </>
              )}

              {resumo.diasRestantes !== null && resumo.diasRestantes <= 5 && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-despesa/30 bg-despesa/5 p-3">
                  <IconeAlerta className="mt-0.5 h-4 w-4 shrink-0 text-despesa" />
                  <p className="text-xs text-despesa">
                    Vale já deixar um botijão reserva ou agendar a troca.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Médias */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Duração média</p>
              <p className="whitespace-nowrap text-base font-semibold text-texto sm:text-lg">
                {resumo.duracaoMedia ? `${Math.round(resumo.duracaoMedia)} dias` : '—'}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Custo por dia</p>
              <p className="whitespace-nowrap text-base font-semibold text-texto sm:text-lg">
                {resumo.custoDiaMedio ? moeda(resumo.custoDiaMedio) : '—'}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Preço médio</p>
              <p className="whitespace-nowrap text-base font-semibold text-texto sm:text-lg">
                {resumo.precoMedio ? moeda(resumo.precoMedio) : '—'}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Gasto total</p>
              <p className="whitespace-nowrap text-base font-semibold text-despesa sm:text-lg">
                {moeda(resumo.gastoTotal)}
              </p>
            </div>
          </div>
        </>
      )}

      <Mensagem texto={mensagem} />

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {!carregando && trocas.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma troca registrada"
          descricao="Registre cada troca de botijão. A partir da segunda, o app calcula quanto tempo cada um dura e o custo por dia."
          acao={<BotaoPrimario onClick={abrirNova}>Registrar primeira troca</BotaoPrimario>}
        />
      )}

      {!carregando && comDuracao.length > 0 && (
        <div className="cartao divide-y divide-borda">
          {comDuracao.map((t, i) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-texto">
                  {dataBR(t.data)}
                  {i === 0 && (
                    <span className="ml-2 rounded bg-alerta/10 px-1.5 py-0.5 text-xs font-normal text-alerta">
                      em uso
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-texto-suave">
                  {t.diasDuracao
                    ? `O botijão anterior durou ${t.diasDuracao} dias`
                    : 'Primeira troca registrada'}
                  {t.custoDia ? ` · ${moeda(t.custoDia)}/dia` : ''}
                  {t.fornecedor ? ` · ${t.fornecedor}` : ''}
                </p>
              </div>

              <span className="whitespace-nowrap text-sm font-semibold text-texto">
                {moeda(t.valor)}
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => abrirEdicao(t)}
                  className="text-xs font-medium text-primaria hover:underline"
                >
                  Editar
                </button>
                <button
                  onClick={() => apagar(t)}
                  aria-label="Apagar troca"
                  className="rounded p-1.5 text-texto-suave transition-colors hover:bg-despesa/10 hover:text-despesa"
                >
                  <IconeLixeira className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        aberto={modalAberto}
        titulo={editandoId ? 'Editar troca' : 'Nova troca de botijão'}
        onFechar={() => setModalAberto(false)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Data da troca">
              <input
                type="date"
                className={classeInput}
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                required
              />
            </Campo>
            <Campo rotulo="Valor pago (R$)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                required
              />
            </Campo>
          </div>

          <Campo rotulo="Fornecedor (opcional)">
            <input
              className={classeInput}
              value={form.fornecedor}
              onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
              placeholder="Ex: Ultragaz, distribuidora do bairro"
            />
          </Campo>

          <Campo rotulo="Observações (opcional)">
            <input
              className={classeInput}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              placeholder="Ex: mês com visitas, consumo maior"
            />
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
