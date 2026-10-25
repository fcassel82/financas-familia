'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { buscarTudo } from '@/lib/buscarTudo'
import { chaveCompetencia, dataBR, hojeISO, moeda, rotuloMesLongo } from '@/lib/formato'
import {
  CAMPOS_LANCAMENTO_INVESTIMENTO,
  dataUltimaAtualizacao,
  estaDesatualizado,
  historicoPorMes,
  resumoDoAno,
  saldoDaConta,
  type LancamentoInvestimento,
  type LinhaHistorico,
} from '@/lib/investimentos'
import { IconeMais } from '@/components/Icones'
import { BotaoSecundario, CabecalhoPagina, EstadoVazio, Mensagem, Pagina } from '@/components/ui'
import AtualizarSaldo from './AtualizarSaldo'

type ContaInvestimento = {
  id: string
  nome: string
  instituicao: string | null
  escopo: string
  saldo_inicial: number
  saldo_conferido_em: string | null
}

type Investimento = ContaInvestimento & {
  saldo: number
  rendeu: number
  aporteEmpresa: number
  ultima: string | null
  desatualizado: boolean
  historico: LinhaHistorico[]
}

const classeBotaoNovo =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primaria px-4 text-sm font-semibold text-sobre-cor transition-colors hover:bg-primaria-escura'

export default function InvestimentosPage() {
  const [contas, setContas] = useState<ContaInvestimento[]>([])
  const [lancamentos, setLancamentos] = useState<LancamentoInvestimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aberto, setAberto] = useState<string | null>(null)
  const [atualizando, setAtualizando] = useState<Investimento | null>(null)
  const [mensagem, setMensagem] = useState('')

  const hoje = hojeISO()
  const ano = Number(hoje.slice(0, 4))
  const mesAtual = chaveCompetencia(hoje)

  const carregar = useCallback(async () => {
    // Quem vê cada investimento é a regra de acesso da conta: familiar todos,
    // pessoal só o dono. Não há checagem de administrador aqui.
    const { data: contasData } = await supabase
      .from('contas')
      .select('id, nome, instituicao, escopo, saldo_inicial, saldo_conferido_em')
      .eq('tipo', 'investimento')
      .eq('ativo', true)
      .order('nome')
    const lista = (contasData ?? []) as ContaInvestimento[]

    let lancs: LancamentoInvestimento[] = []
    if (lista.length > 0) {
      const { data } = await buscarTudo<LancamentoInvestimento>((de, ate) =>
        supabase
          .from('transacoes')
          .select(CAMPOS_LANCAMENTO_INVESTIMENTO)
          .in(
            'conta_id',
            lista.map((c) => c.id)
          )
          .order('id')
          .range(de, ate)
      )
      lancs = data
    }

    setContas(lista)
    setLancamentos(lancs)
    setCarregando(false)
  }, [])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const investimentos = useMemo<Investimento[]>(
    () =>
      contas.map((c) => {
        const daConta = lancamentos.filter((l) => l.conta_id === c.id)
        const { rendeu, aporteEmpresa } = resumoDoAno(daConta, ano)
        const ultima = dataUltimaAtualizacao(c.saldo_conferido_em, daConta)
        return {
          ...c,
          saldo: saldoDaConta(c.saldo_inicial, daConta),
          rendeu,
          aporteEmpresa,
          ultima,
          desatualizado: estaDesatualizado(ultima, hoje),
          historico: historicoPorMes(daConta, mesAtual),
        }
      }),
    [contas, lancamentos, ano, hoje, mesAtual]
  )

  const total = investimentos.reduce((s, i) => s + i.saldo, 0)
  const rendeuNoAno = investimentos.reduce((s, i) => s + i.rendeu, 0)
  const aporteNoAno = investimentos.reduce((s, i) => s + i.aporteEmpresa, 0)
  const doMes = investimentos.flatMap((i) => i.historico.filter((h) => h.chave === mesAtual))
  const aplicadoNoMes = doMes.reduce((s, h) => s + h.aplicado, 0)
  const resgatadoNoMes = doMes.reduce((s, h) => s + h.resgatado, 0)

  async function aoSalvar(texto: string) {
    setAtualizando(null)
    setMensagem(texto)
    await carregar()
  }

  const novo = (
    <Link href="/contas?novo=investimento" className={classeBotaoNovo}>
      <IconeMais className="h-4 w-4" />
      Novo investimento
    </Link>
  )

  return (
    <Pagina>
      <CabecalhoPagina titulo="Investimentos" acao={novo} />

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {!carregando && investimentos.length === 0 && (
        <EstadoVazio
          titulo="Nenhum investimento cadastrado"
          descricao="Cadastre uma conta do tipo investimento para acompanhar saldo e rendimento aqui."
          acao={novo}
        />
      )}

      {!carregando && investimentos.length > 0 && (
        <div className="space-y-6">
          <section aria-label="Resumo dos investimentos">
            <p className="text-lg leading-snug text-texto">
              Vocês têm <strong className="font-bold whitespace-nowrap">{moeda(total)}</strong> em{' '}
              {investimentos.length} investimento{investimentos.length > 1 ? 's' : ''}.
            </p>
            <p className="mt-1 text-texto-suave">
              Em {ano}{' '}
              {rendeuNoAno >= 0 ? 'renderam ' : 'perderam '}
              <strong className={`font-semibold whitespace-nowrap ${rendeuNoAno >= 0 ? 'text-receita' : 'text-despesa'}`}>
                {moeda(Math.abs(rendeuNoAno))}
              </strong>{' '}
              e a empresa aportou{' '}
              <strong className="font-semibold whitespace-nowrap text-texto">{moeda(aporteNoAno)}</strong>.
            </p>
          </section>

          {mensagem && <Mensagem texto={mensagem} />}

          <ul className="grid gap-4 md:grid-cols-2">
            {investimentos.map((inv) => (
              <li key={inv.id} className="cartao self-start">
                <button
                  type="button"
                  onClick={() => setAberto((atual) => (atual === inv.id ? null : inv.id))}
                  aria-expanded={aberto === inv.id}
                  className="flex w-full items-start justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-texto">{inv.nome}</p>
                    <p className="mt-0.5 text-sm text-texto-suave">
                      {inv.instituicao ? `${inv.instituicao}, ` : ''}
                      {inv.ultima ? `atualizado em ${dataBR(inv.ultima)}` : 'nunca atualizado'}
                    </p>
                    {inv.desatualizado && (
                      <span className="mt-1.5 inline-flex rounded-full bg-alerta/12 px-2.5 py-0.5 text-sm font-medium text-alerta">
                        desatualizado
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold whitespace-nowrap text-texto">{moeda(inv.saldo)}</p>
                    <p
                      className={`text-sm whitespace-nowrap ${
                        inv.rendeu > 0 ? 'text-receita' : inv.rendeu < 0 ? 'text-despesa' : 'text-texto-suave'
                      }`}
                    >
                      {inv.rendeu < 0 ? 'perdeu' : 'rendeu'} {moeda(Math.abs(inv.rendeu))} em {ano}
                    </p>
                  </div>
                </button>

                <div className="flex items-center justify-between gap-2 px-4 pb-4">
                  <BotaoSecundario onClick={() => setAtualizando(inv)} className="min-h-11">
                    Atualizar saldo
                  </BotaoSecundario>
                  <button
                    type="button"
                    onClick={() => setAberto((atual) => (atual === inv.id ? null : inv.id))}
                    className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-primaria hover:underline"
                  >
                    {aberto === inv.id ? 'Ocultar histórico' : 'Ver histórico'}
                  </button>
                </div>

                {aberto === inv.id && <Historico linhas={inv.historico} />}
              </li>
            ))}
          </ul>

          <section className="cartao p-4">
            <h2 className="text-base font-semibold text-texto">{rotuloMesLongo(mesAtual)}</h2>
            <p className="mt-1 text-texto">
              Neste mês vocês aplicaram{' '}
              <strong className="font-semibold whitespace-nowrap">{moeda(aplicadoNoMes)}</strong> e resgataram{' '}
              <strong className="font-semibold whitespace-nowrap">{moeda(resgatadoNoMes)}</strong>.
            </p>
            <Link
              href="/calculadora-50-30-20"
              className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primaria hover:underline"
            >
              Ver na Calculadora 50/30/20
            </Link>
          </section>
        </div>
      )}

      {atualizando && (
        <AtualizarSaldo
          conta={atualizando}
          saldoApp={atualizando.saldo}
          onFechar={() => setAtualizando(null)}
          onSalvo={aoSalvar}
        />
      )}
    </Pagina>
  )
}

const COLUNAS: { campo: keyof Omit<LinhaHistorico, 'chave'>; rotulo: string }[] = [
  { campo: 'aplicado', rotulo: 'Aplicado' },
  { campo: 'resgatado', rotulo: 'Resgatado' },
  { campo: 'aporteEmpresa', rotulo: 'Aporte da empresa' },
  { campo: 'rendimento', rotulo: 'Rendeu' },
]

/** Histórico por mês de competência: só mostra os valores que existem no mês */
function Historico({ linhas }: { linhas: LinhaHistorico[] }) {
  if (linhas.length === 0) {
    return (
      <p className="border-t border-borda px-4 py-3 text-sm text-texto-suave">
        Nenhum movimento nos últimos 12 meses.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-borda border-t border-borda px-4">
      {linhas.map((linha) => (
        <li key={linha.chave} className="py-3">
          <p className="text-sm font-semibold text-texto">{rotuloMesLongo(linha.chave)}</p>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {COLUNAS.filter(({ campo }) => linha[campo] !== 0).map(({ campo, rotulo }) => (
              <div key={campo} className="flex justify-between gap-2">
                <dt className="text-texto-suave">{rotulo}</dt>
                <dd
                  className={`font-medium whitespace-nowrap ${
                    campo === 'rendimento' && linha[campo] < 0 ? 'text-despesa' : 'text-texto'
                  }`}
                >
                  {campo === 'rendimento' && linha[campo] < 0 ? '−' : ''}
                  {moeda(Math.abs(linha[campo]))}
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  )
}
