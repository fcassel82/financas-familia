'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  chaveMes,
  dataBR,
  deslocarMes,
  limitesDoMes,
  moeda,
  rotuloMesLongo,
} from '@/lib/formato'
import { IconeSeta } from '@/components/Icones'
import { CabecalhoPagina, Campo, EstadoVazio, Pagina, classeInput } from '@/components/ui'

type Conta = { id: string; nome: string; cor: string | null; saldo_inicial: number }

type Movimento = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  transferencia_id: string | null
  categorias: { nome: string } | null
}

export default function ExtratoPage() {
  const [contas, setContas] = useState<Conta[]>([])
  const [contaId, setContaId] = useState('')
  const [mes, setMes] = useState(chaveMes(new Date()))
  const [movimentos, setMovimentos] = useState<Movimento[]>([])
  const [saldoAnterior, setSaldoAnterior] = useState(0)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregarContas() {
      const { data } = await supabase
        .from('contas')
        .select('id, nome, cor, saldo_inicial')
        .order('nome')
      const lista = (data ?? []) as Conta[]
      setContas(lista)
      if (lista.length && !contaId) setContaId(lista[0].id)
      if (!lista.length) setCarregando(false)
    }
    carregarContas()
    // contaId de propósito fora das dependências: só define o padrão na 1ª carga
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const carregar = useCallback(async () => {
    if (!contaId) return

    const conta = contas.find((c) => c.id === contaId)
    const { inicio, fim } = limitesDoMes(mes)

    const [{ data: anteriores }, { data: doMes }] = await Promise.all([
      // Tudo que já aconteceu ANTES do período, para montar o saldo de abertura
      supabase
        .from('transacoes')
        .select('valor, tipo')
        .eq('conta_id', contaId)
        .eq('status', 'pago')
        .lt('data', inicio),
      supabase
        .from('transacoes')
        .select('id, data, descricao, valor, tipo, transferencia_id, categorias(nome)')
        .eq('conta_id', contaId)
        .eq('status', 'pago')
        .gte('data', inicio)
        .lte('data', fim)
        .order('data'),
    ])

    let abertura = Number(conta?.saldo_inicial ?? 0)
    for (const m of anteriores ?? []) {
      abertura += m.tipo === 'receita' ? Number(m.valor) : -Number(m.valor)
    }

    setSaldoAnterior(abertura)
    setMovimentos((doMes ?? []) as unknown as Movimento[])
    setCarregando(false)
  }, [contaId, mes, contas])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  // Saldo corrente linha a linha, como num extrato bancário
  const linhas = useMemo(() => {
    const resultado: (Movimento & { saldoApos: number })[] = []
    let acumulado = saldoAnterior
    for (const m of movimentos) {
      acumulado += m.tipo === 'receita' ? Number(m.valor) : -Number(m.valor)
      resultado.push({ ...m, saldoApos: acumulado })
    }
    return resultado
  }, [movimentos, saldoAnterior])

  const entradas = movimentos
    .filter((m) => m.tipo === 'receita')
    .reduce((s, m) => s + Number(m.valor), 0)
  const saidas = movimentos
    .filter((m) => m.tipo === 'despesa')
    .reduce((s, m) => s + Number(m.valor), 0)
  const saldoFinal = saldoAnterior + entradas - saidas

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Extrato de Contas"
        descricao="Movimentações de uma conta, com saldo acumulado linha a linha."
      />

      {contas.length === 0 && !carregando ? (
        <EstadoVazio
          titulo="Nenhuma conta cadastrada"
          descricao="Cadastre uma conta para ver o extrato dela."
          acao={
            <a
              href="/contas"
              className="inline-flex items-center gap-2 rounded-lg bg-primaria px-4 py-2.5 text-sm font-semibold text-white hover:bg-primaria-escura"
            >
              Cadastrar conta
            </a>
          }
        />
      ) : (
        <>
          <div className="cartao mb-4 grid gap-4 p-4 sm:grid-cols-2">
            <Campo rotulo="Conta">
              <select
                className={classeInput}
                value={contaId}
                onChange={(e) => setContaId(e.target.value)}
              >
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-texto">Mês</span>
              <div className="flex items-center justify-between rounded-lg border border-borda px-1 py-0.5">
                <button
                  onClick={() => setMes(deslocarMes(mes, -1))}
                  aria-label="Mês anterior"
                  className="rounded p-1.5 text-texto-suave hover:bg-fundo"
                >
                  <IconeSeta direcao="esquerda" className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium text-texto">{rotuloMesLongo(mes)}</span>
                <button
                  onClick={() => setMes(deslocarMes(mes, 1))}
                  aria-label="Próximo mês"
                  className="rounded p-1.5 text-texto-suave hover:bg-fundo"
                >
                  <IconeSeta direcao="direita" className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Resumo do período */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Saldo anterior</p>
              <p className="whitespace-nowrap text-base font-semibold text-texto">
                {moeda(saldoAnterior)}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Entradas</p>
              <p className="whitespace-nowrap text-base font-semibold text-receita">
                {moeda(entradas)}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Saídas</p>
              <p className="whitespace-nowrap text-base font-semibold text-despesa">
                {moeda(saidas)}
              </p>
            </div>
            <div className="cartao p-3">
              <p className="text-xs text-texto-suave">Saldo final</p>
              <p
                className={`whitespace-nowrap text-base font-semibold ${
                  saldoFinal >= 0 ? 'text-texto' : 'text-despesa'
                }`}
              >
                {moeda(saldoFinal)}
              </p>
            </div>
          </div>

          {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

          {!carregando && linhas.length === 0 && (
            <EstadoVazio
              titulo="Nenhuma movimentação neste mês"
              descricao={`A conta não teve entradas nem saídas em ${rotuloMesLongo(mes).toLowerCase()}.`}
            />
          )}

          {!carregando && linhas.length > 0 && (
            <div className="cartao overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-borda bg-fundo/60 text-left text-xs text-texto-suave">
                    <th className="p-3 font-medium">Data</th>
                    <th className="p-3 font-medium">Descrição</th>
                    <th className="p-3 text-right font-medium">Valor</th>
                    <th className="p-3 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {linhas.map((l) => {
                    const receita = l.tipo === 'receita'
                    return (
                      <tr key={l.id}>
                        <td className="whitespace-nowrap p-3 text-texto-suave">{dataBR(l.data)}</td>
                        <td className="p-3">
                          <p className="text-texto">{l.descricao}</p>
                          <p className="text-xs text-texto-suave">
                            {l.transferencia_id
                              ? 'Transferência'
                              : (l.categorias?.nome ?? 'Sem categoria')}
                          </p>
                        </td>
                        <td
                          className={`whitespace-nowrap p-3 text-right font-medium ${
                            receita ? 'text-receita' : 'text-despesa'
                          }`}
                        >
                          {receita ? '+' : '−'} {moeda(l.valor)}
                        </td>
                        <td
                          className={`whitespace-nowrap p-3 text-right font-semibold ${
                            l.saldoApos >= 0 ? 'text-texto' : 'text-despesa'
                          }`}
                        >
                          {moeda(l.saldoApos)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Pagina>
  )
}
