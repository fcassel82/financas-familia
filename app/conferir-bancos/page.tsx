'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { buscarTudo } from '@/lib/buscarTudo'
import { dataBR, moeda, somarDias } from '@/lib/formato'
import { CabecalhoPagina, EstadoVazio, Pagina } from '@/components/ui'

/**
 * Conferência da integração com a Pluggy: mostra o que viria dos bancos e o
 * que já existe no app. Só leitura; nada é gravado.
 */

type TransacaoBanco = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  status: string | null
  categoria: string | null
  comerciante: string | null
  parcela: number | null
  parcelas: number | null
}
type ContaBanco = {
  id: string
  nome: string
  tipo: string
  subtipo: string | null
  numero: string | null
  saldo: number | null
  transacoes: TransacaoBanco[]
  erro?: string
}
type Resposta = {
  de: string
  ate: string
  itens: { itemId: string; contas: ContaBanco[]; erro?: string }[]
}
type LancamentoApp = {
  id: string
  data: string
  descricao: string
  valor: number
  contas: { nome: string } | null
  cartoes_credito: { nome: string } | null
}

const centavos = (v: number) => Math.round(Math.abs(Number(v)) * 100)

/** Casa cada transação do banco com um lançamento do app: mesmo valor e até 2 dias de diferença */
function casar(contas: ContaBanco[], lancamentos: LancamentoApp[]): Map<string, LancamentoApp> {
  const usados = new Set<string>()
  const casados = new Map<string, LancamentoApp>()
  for (const conta of contas) {
    for (const t of conta.transacoes) {
      const alvo = centavos(t.valor)
      const de = somarDias(t.data, -2)
      const ate = somarDias(t.data, 2)
      const achado = lancamentos.find(
        (l) => !usados.has(l.id) && centavos(l.valor) === alvo && l.data >= de && l.data <= ate
      )
      if (achado) {
        usados.add(achado.id)
        casados.set(t.id, achado)
      }
    }
  }
  return casados
}

export default function ConferirBancosPage() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<Resposta | null>(null)
  const [casados, setCasados] = useState<Map<string, LancamentoApp>>(new Map())
  const [aberta, setAberta] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      const { data: sessao } = await supabase.auth.getSession()
      const token = sessao.session?.access_token
      const resposta = await fetch('/api/pluggy/conferencia', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const corpo = await resposta.json()
      if (cancelado) return
      if (!resposta.ok) {
        setErro(corpo.error ?? 'Não foi possível falar com a Pluggy.')
        setCarregando(false)
        return
      }
      const r = corpo as Resposta
      const { data: lancs } = await buscarTudo((de, ate) =>
        supabase
          .from('transacoes')
          .select('id, data, descricao, valor, contas(nome), cartoes_credito!cartao_id(nome)')
          .gte('data', somarDias(r.de, -2))
          .lte('data', somarDias(r.ate, 2))
          .order('id')
          .range(de, ate)
      )
      if (cancelado) return
      const contas = r.itens.flatMap((i) => i.contas)
      setDados(r)
      setCasados(casar(contas, lancs as unknown as LancamentoApp[]))
      setCarregando(false)
    }
    carregar().catch(() => {
      if (!cancelado) {
        setErro('Não foi possível falar com a Pluggy. Tente de novo em instantes.')
        setCarregando(false)
      }
    })
    return () => {
      cancelado = true
    }
  }, [])

  const contas = dados?.itens.flatMap((i) => i.contas) ?? []
  const totalTransacoes = contas.reduce((s, c) => s + c.transacoes.length, 0)
  const totalCasadas = contas.reduce(
    (s, c) => s + c.transacoes.filter((t) => casados.has(t.id)).length,
    0
  )

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Conferir bancos"
        descricao="O que a Pluggy traz dos seus bancos, comparado com o que já está no app. Só conferência: nada é gravado."
      />

      {carregando && (
        <p className="text-sm text-texto-suave">
          Buscando nos bancos... pode levar alguns segundos.
        </p>
      )}

      {!carregando && erro && <EstadoVazio titulo={erro} />}

      {!carregando && dados && (
        <div className="space-y-5">
          <section className="cartao p-4">
            <p className="text-texto">
              De {dataBR(dados.de)} a {dataBR(dados.ate)}: <strong>{contas.length}</strong> contas e
              cartões, <strong>{totalTransacoes}</strong> transações.{' '}
              <strong>{totalCasadas}</strong> já parecem estar no app (mesmo valor, até 2 dias de
              diferença); <strong>{totalTransacoes - totalCasadas}</strong> seriam novas.
            </p>
          </section>

          {dados.itens
            .filter((i) => i.erro)
            .map((i) => (
              <p
                key={i.itemId}
                className="rounded-lg border border-despesa/30 bg-despesa/10 px-4 py-3 text-sm text-despesa"
              >
                Conexão {i.itemId.slice(0, 8)}…: {i.erro}
              </p>
            ))}

          {contas.map((conta) => {
            const novas = conta.transacoes.filter((t) => !casados.has(t.id)).length
            return (
              <section key={conta.id} className="cartao overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAberta((a) => (a === conta.id ? null : conta.id))}
                  aria-expanded={aberta === conta.id}
                  className="flex w-full items-start justify-between gap-3 p-4 text-left"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-texto">{conta.nome}</span>
                    <span className="block text-sm text-texto-suave">
                      {conta.tipo === 'CREDIT'
                        ? 'Cartão de crédito'
                        : conta.subtipo === 'SAVINGS_ACCOUNT'
                          ? 'Poupança'
                          : 'Conta'}
                      {conta.numero ? `, ${conta.numero}` : ''}: {conta.transacoes.length}{' '}
                      transações, {novas} novas
                    </span>
                    {conta.erro && <span className="block text-sm text-despesa">{conta.erro}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs text-texto-suave">
                      {conta.tipo === 'CREDIT' ? 'Fatura atual' : 'Saldo no banco'}
                    </span>
                    <span className="block font-bold whitespace-nowrap text-texto">
                      {moeda(conta.saldo ?? 0)}
                    </span>
                  </span>
                </button>

                {aberta === conta.id && (
                  <ul className="divide-y divide-borda border-t border-borda px-4">
                    {conta.transacoes.length === 0 && (
                      <li className="py-3 text-sm text-texto-suave">
                        Nenhuma transação no período.
                      </li>
                    )}
                    {[...conta.transacoes]
                      .sort((a, b) => b.data.localeCompare(a.data))
                      .map((t) => {
                        const noApp = casados.get(t.id)
                        return (
                          <li key={t.id} className="py-2.5">
                            <div className="flex items-start justify-between gap-3">
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-texto">
                                  {t.descricao}
                                </span>
                                <span className="block text-sm text-texto-suave">
                                  {dataBR(t.data)}
                                  {t.categoria ? `, ${t.categoria}` : ''}
                                  {t.parcelas ? `, parcela ${t.parcela ?? '?'}/${t.parcelas}` : ''}
                                  {t.status && t.status !== 'POSTED'
                                    ? `, ${t.status.toLowerCase()}`
                                    : ''}
                                </span>
                              </span>
                              <span
                                className={`shrink-0 font-semibold whitespace-nowrap ${
                                  t.tipo === 'CREDIT' ? 'text-receita' : 'text-despesa'
                                }`}
                              >
                                {t.tipo === 'CREDIT' ? '+' : '−'}
                                {moeda(Math.abs(t.valor))}
                              </span>
                            </div>
                            <span
                              className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                noApp ? 'bg-fundo text-texto-suave' : 'bg-primaria/10 text-primaria'
                              }`}
                            >
                              {noApp
                                ? `Já no app: ${noApp.descricao} (${noApp.contas?.nome ?? noApp.cartoes_credito?.nome ?? 'sem conta'})`
                                : 'Nova'}
                            </span>
                          </li>
                        )
                      })}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </Pagina>
  )
}
