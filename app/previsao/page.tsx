'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { dataBR, diasAte, hojeISO, moeda, somarDias } from '@/lib/formato'
import { IconeAlerta } from '@/components/Icones'
import { CabecalhoPagina, Campo, Pagina, classeInput } from '@/components/ui'

type Pendencia = { valor: number; tipo: string; data_vencimento: string; descricao: string }

export default function PrevisaoPage() {
  const [saldoAtual, setSaldoAtual] = useState(0)
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [carregando, setCarregando] = useState(true)

  const [dataAlvo, setDataAlvo] = useState(somarDias(hojeISO(), 30))
  const [simValor, setSimValor] = useState('')
  const [simData, setSimData] = useState(hojeISO())
  const [simParcelas, setSimParcelas] = useState('1')

  useEffect(() => {
    async function carregar() {
      const [{ data: contas }, { data: movimentos }, { data: pend }] = await Promise.all([
        supabase.from('contas').select('id, saldo_inicial'),
        supabase.from('transacoes').select('conta_id, valor, tipo').eq('status', 'pago'),
        supabase
          .from('transacoes')
          .select('valor, tipo, data_vencimento, descricao')
          .eq('status', 'pendente')
          .order('data_vencimento'),
      ])

      const idsContas = new Set((contas ?? []).map((c) => c.id))
      let saldo = (contas ?? []).reduce((s, c) => s + Number(c.saldo_inicial), 0)
      for (const m of movimentos ?? []) {
        if (!m.conta_id || !idsContas.has(m.conta_id)) continue
        saldo += m.tipo === 'receita' ? Number(m.valor) : -Number(m.valor)
      }

      setSaldoAtual(saldo)
      setPendencias((pend ?? []) as Pendencia[])
      setCarregando(false)
    }
    carregar()
  }, [])

  const aReceber = pendencias
    .filter((p) => p.tipo === 'receita')
    .reduce((s, p) => s + Number(p.valor), 0)
  const aPagar = pendencias
    .filter((p) => p.tipo === 'despesa')
    .reduce((s, p) => s + Number(p.valor), 0)

  /** Saldo geral: o que está em conta hoje, mais o que entra, menos o que sai */
  const saldoGeral = saldoAtual + aReceber - aPagar

  /** Previsão: só considera pendências que vencem até a data escolhida */
  const previsao = useMemo(() => {
    let projetado = saldoAtual
    for (const p of pendencias) {
      if (p.data_vencimento > dataAlvo) continue
      projetado += p.tipo === 'receita' ? Number(p.valor) : -Number(p.valor)
    }
    return projetado
  }, [saldoAtual, pendencias, dataAlvo])

  const pendenciasNoPeriodo = pendencias.filter((p) => p.data_vencimento <= dataAlvo)

  /** Simulação: impacto de uma compra nova sobre a previsão */
  const simulacao = useMemo(() => {
    const total = parseFloat(simValor || '0')
    const n = Math.max(1, parseInt(simParcelas || '1', 10))
    if (total <= 0) return null

    // Conta só as parcelas que caem até a data alvo da previsão
    const valorParcela = total / n
    let parcelasNoPeriodo = 0
    for (let i = 0; i < n; i++) {
      const [ano, mes, dia] = simData.split('-').map(Number)
      const d = new Date(ano, mes - 1 + i, dia)
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (iso <= dataAlvo) parcelasNoPeriodo++
    }

    const impacto = valorParcela * parcelasNoPeriodo
    return {
      valorParcela,
      parcelasNoPeriodo,
      totalParcelas: n,
      impacto,
      saldoDepois: previsao - impacto,
    }
  }, [simValor, simParcelas, simData, dataAlvo, previsao])

  const diasFrente = diasAte(dataAlvo)

  if (carregando) {
    return (
      <Pagina>
        <CabecalhoPagina titulo="Previsão e Simulação" />
        <p className="text-sm text-texto-suave">Carregando...</p>
      </Pagina>
    )
  }

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Previsão e Simulação"
        descricao="Como seu saldo deve ficar considerando as contas a pagar e receber."
      />

      {/* Totalizadores */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="cartao p-4">
          <p className="text-xs text-texto-suave">Saldo em contas</p>
          <p
            className={`mt-1 whitespace-nowrap text-lg font-bold sm:text-xl ${
              saldoAtual >= 0 ? 'text-texto' : 'text-despesa'
            }`}
          >
            {moeda(saldoAtual)}
          </p>
        </div>
        <div className="cartao p-4">
          <p className="text-xs text-texto-suave">A receber</p>
          <p className="mt-1 whitespace-nowrap text-lg font-bold text-receita sm:text-xl">
            {moeda(aReceber)}
          </p>
        </div>
        <div className="cartao p-4">
          <p className="text-xs text-texto-suave">A pagar</p>
          <p className="mt-1 whitespace-nowrap text-lg font-bold text-despesa sm:text-xl">
            {moeda(aPagar)}
          </p>
        </div>
        <div className="rounded-xl bg-marinho p-4 shadow-sm">
          <p className="text-xs text-white/70">Saldo geral</p>
          <p className="mt-1 whitespace-nowrap text-lg font-bold text-white sm:text-xl">
            {moeda(saldoGeral)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Previsão em data futura */}
        <section className="cartao p-4">
          <h2 className="mb-3 text-sm font-semibold text-texto">Previsão de saldo</h2>

          <Campo rotulo="Saldo previsto para o dia">
            <input
              type="date"
              className={classeInput}
              value={dataAlvo}
              onChange={(e) => setDataAlvo(e.target.value)}
            />
          </Campo>

          <div className="mt-4 rounded-lg bg-fundo p-4 text-center">
            <p className="text-xs text-texto-suave">
              Em {dataBR(dataAlvo)}
              {diasFrente >= 0 ? ` · daqui a ${diasFrente} dia${diasFrente === 1 ? '' : 's'}` : ''}
            </p>
            <p
              className={`mt-1 text-2xl font-bold ${
                previsao >= 0 ? 'text-receita' : 'text-despesa'
              }`}
            >
              {moeda(previsao)}
            </p>
            <p className="mt-1 text-xs text-texto-suave">
              {pendenciasNoPeriodo.length === 0
                ? 'Nenhuma conta em aberto vence até lá.'
                : `Considerando ${pendenciasNoPeriodo.length} conta${
                    pendenciasNoPeriodo.length === 1 ? '' : 's'
                  } com vencimento até esta data.`}
            </p>
          </div>

          {previsao < 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-despesa/30 bg-despesa/5 p-3">
              <IconeAlerta className="mt-0.5 h-4 w-4 shrink-0 text-despesa" />
              <p className="text-xs text-despesa">
                O saldo previsto fica negativo nesta data.
              </p>
            </div>
          )}

          {pendenciasNoPeriodo.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-borda pt-3">
              {pendenciasNoPeriodo.slice(0, 6).map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-texto-suave">
                    {dataBR(p.data_vencimento)} · {p.descricao}
                  </span>
                  <span
                    className={`shrink-0 font-medium ${
                      p.tipo === 'receita' ? 'text-receita' : 'text-despesa'
                    }`}
                  >
                    {p.tipo === 'receita' ? '+' : '−'} {moeda(p.valor)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Simulação de compra */}
        <section className="cartao p-4">
          <h2 className="mb-1 text-sm font-semibold text-texto">Simulação de compra</h2>
          <p className="mb-3 text-xs text-texto-suave">
            Veja como uma compra afetaria o saldo previsto, sem registrar nada.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Valor total (R$)">
              <input
                type="number"
                step="0.01"
                className={classeInput}
                value={simValor}
                onChange={(e) => setSimValor(e.target.value)}
                placeholder="0,00"
              />
            </Campo>
            <Campo rotulo="Parcelas">
              <input
                type="number"
                min="1"
                max="120"
                className={classeInput}
                value={simParcelas}
                onChange={(e) => setSimParcelas(e.target.value)}
              />
            </Campo>
          </div>

          <Campo rotulo="Primeira parcela em" className="mt-4">
            <input
              type="date"
              className={classeInput}
              value={simData}
              onChange={(e) => setSimData(e.target.value)}
            />
          </Campo>

          {simulacao ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg bg-fundo p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-texto-suave">
                    {simulacao.totalParcelas}x de {moeda(simulacao.valorParcela)}
                  </span>
                  <span className="font-medium text-texto">
                    {moeda(parseFloat(simValor))}
                  </span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-texto-suave">
                    Pesa até {dataBR(dataAlvo)} ({simulacao.parcelasNoPeriodo} de{' '}
                    {simulacao.totalParcelas})
                  </span>
                  <span className="font-medium text-despesa">− {moeda(simulacao.impacto)}</span>
                </div>
              </div>

              <div
                className={`rounded-lg p-4 text-center ${
                  simulacao.saldoDepois >= 0 ? 'bg-receita/10' : 'bg-despesa/10'
                }`}
              >
                <p className="text-xs text-texto-suave">Saldo previsto depois da compra</p>
                <p
                  className={`mt-1 text-2xl font-bold ${
                    simulacao.saldoDepois >= 0 ? 'text-receita' : 'text-despesa'
                  }`}
                >
                  {moeda(simulacao.saldoDepois)}
                </p>
                <p className="mt-1 text-xs text-texto-suave">
                  {simulacao.saldoDepois >= 0
                    ? 'A compra cabe no orçamento previsto.'
                    : 'O saldo ficaria negativo — reavalie ou parcele em mais vezes.'}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-fundo p-4 text-center text-sm text-texto-suave">
              Informe um valor para simular.
            </p>
          )}
        </section>
      </div>

      <p className="mt-6 text-center text-xs text-texto-suave">
        A previsão usa as contas cadastradas em{' '}
        <Link href="/contas-pagar" className="font-medium text-primaria hover:underline">
          Contas a Pagar e Receber
        </Link>
        . Gastos não cadastrados não entram na conta.
      </p>
    </Pagina>
  )
}
