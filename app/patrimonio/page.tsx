'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { supabase } from '@/lib/supabaseClient'
import { moeda } from '@/lib/formato'
import { avaliarImovel, calcularDepreciacao, type BemParaDepreciar } from '@/lib/calculos'
import { CabecalhoPagina, Pagina } from '@/components/ui'

type Conta = { id: string; nome: string; tipo: string; saldo_inicial: number }
type MovimentoConta = { conta_id: string | null; valor: number; tipo: string }
type Bem = BemParaDepreciar & { id: string; nome: string }
type Veiculo = { id: string; nome: string; valor_pago: number | null; valor_fipe: number | null }
type Imovel = {
  id: string
  nome: string
  valor_pago: number
  data_aquisicao: string
  indice_base: number | null
  valor_avaliado_manual: number | null
}
type Investimento = { id: string; nome: string; tipo: string; valor_investido: number }
type Divida = { id: string; nome: string; saldo_devedor: number; valor_parcela: number | null }
type Pendencia = { valor: number; tipo: string; fatura_cartao_id: string | null }

const CORES_COMPOSICAO = ['#2a78d6', '#159d76', '#eb6834', '#7c4dcc', '#d98324']

function CartaoNumero({
  titulo,
  valor,
  detalhe,
  cor = 'text-texto',
}: {
  titulo: string
  valor: string
  detalhe?: string
  cor?: string
}) {
  return (
    <div className="cartao p-4">
      <p className="text-xs text-texto-suave">{titulo}</p>
      <p className={`mt-1 whitespace-nowrap text-lg font-bold sm:text-xl ${cor}`}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-texto-suave">{detalhe}</p>}
    </div>
  )
}

/** Uma linha de composição, com barra proporcional ao maior item */
function LinhaComposicao({
  rotulo,
  valor,
  maximo,
  cor,
  href,
}: {
  rotulo: string
  valor: number
  maximo: number
  cor: string
  href?: string
}) {
  const largura = maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        {href ? (
          <Link href={href} className="truncate text-texto hover:text-primaria hover:underline">
            {rotulo}
          </Link>
        ) : (
          <span className="truncate text-texto">{rotulo}</span>
        )}
        <span className="whitespace-nowrap font-medium text-texto">{moeda(valor)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-fundo">
        <div className="h-full rounded-full" style={{ width: `${largura}%`, backgroundColor: cor }} />
      </div>
    </div>
  )
}

export default function PatrimonioPage() {
  const [contas, setContas] = useState<Conta[]>([])
  const [movimentos, setMovimentos] = useState<MovimentoConta[]>([])
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [bens, setBens] = useState<Bem[]>([])
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [imoveis, setImoveis] = useState<Imovel[]>([])
  const [investimentos, setInvestimentos] = useState<Investimento[]>([])
  const [dividas, setDividas] = useState<Divida[]>([])
  const [indiceImovel, setIndiceImovel] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    const [
      { data: contasData },
      { data: movimentosData },
      { data: pendenciasData },
      { data: bensData },
      { data: veiculosData },
      { data: imoveisData },
      { data: investimentosData },
      { data: dividasData },
    ] = await Promise.all([
      supabase.from('contas').select('id, nome, tipo, saldo_inicial').order('nome'),
      supabase.from('transacoes').select('conta_id, valor, tipo').eq('status', 'pago'),
      supabase
        .from('transacoes')
        .select('valor, tipo, fatura_cartao_id')
        .eq('status', 'pendente')
        .eq('tipo', 'despesa'),
      supabase.from('bens').select('id, nome, valor_aquisicao, data_aquisicao, vida_util_anos, valor_residual'),
      supabase.from('veiculos').select('id, nome, valor_pago, valor_fipe').eq('ativo', true),
      supabase
        .from('imoveis')
        .select('id, nome, valor_pago, data_aquisicao, indice_base, valor_avaliado_manual'),
      supabase.from('investimentos').select('id, nome, tipo, valor_investido'),
      supabase.from('dividas').select('id, nome, saldo_devedor, valor_parcela').eq('quitada', false),
    ])

    setContas((contasData ?? []) as Conta[])
    setMovimentos((movimentosData ?? []) as MovimentoConta[])
    setPendencias((pendenciasData ?? []) as Pendencia[])
    setBens((bensData ?? []) as Bem[])
    setVeiculos((veiculosData ?? []) as Veiculo[])
    setImoveis((imoveisData ?? []) as Imovel[])
    setInvestimentos((investimentosData ?? []) as Investimento[])
    setDividas((dividasData ?? []) as Divida[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    // Busca de dados: o estado só muda depois do await da consulta, mas a regra
    // não distingue esse caso de um setState realmente síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  // Índice do BCB para corrigir o valor dos imóveis; sem ele, imóvel vale o que foi pago
  useEffect(() => {
    let cancelado = false
    async function buscar() {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      try {
        const resposta = await fetch('/api/indice-imovel', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!resposta.ok) return
        const json = await resposta.json()
        if (!cancelado) setIndiceImovel(json.atual ?? null)
      } catch {
        // Índice é um "nice to have": sem ele o imóvel entra pelo valor pago
      }
    }
    buscar()
    return () => {
      cancelado = true
    }
  }, [])

  /** Saldo de cada conta: saldo inicial + tudo que já foi efetivado nela */
  const saldosPorConta = useMemo(() => {
    const saldos: Record<string, number> = {}
    for (const c of contas) saldos[c.id] = Number(c.saldo_inicial)
    for (const m of movimentos) {
      if (!m.conta_id || !(m.conta_id in saldos)) continue
      saldos[m.conta_id] += m.tipo === 'receita' ? Number(m.valor) : -Number(m.valor)
    }
    return saldos
  }, [contas, movimentos])

  const numeros = useMemo(() => {
    const contasInvestimento = contas.filter((c) => c.tipo === 'investimento')
    const contasCorrentes = contas.filter((c) => c.tipo !== 'investimento')

    const saldoContasInvestimento = contasInvestimento.reduce(
      (s, c) => s + (saldosPorConta[c.id] ?? 0),
      0
    )
    const saldoContasCorrentes = contasCorrentes.reduce((s, c) => s + (saldosPorConta[c.id] ?? 0), 0)

    const totalImoveis = imoveis.reduce(
      (s, i) => s + avaliarImovel(i, indiceImovel).valorAtual,
      0
    )
    // Veículo vale o que a FIPE diz; sem consulta feita, vale o que foi pago
    const totalVeiculos = veiculos.reduce(
      (s, v) => s + Number(v.valor_fipe ?? v.valor_pago ?? 0),
      0
    )
    const totalBens = bens.reduce((s, b) => s + calcularDepreciacao(b).valorAtual, 0)
    const totalInvestimentos = investimentos.reduce((s, i) => s + Number(i.valor_investido), 0)

    // "Bens" no sentido de patrimônio físico + aplicações registradas
    const totalDosBens = totalImoveis + totalVeiculos + totalBens

    const ativos =
      totalDosBens + totalInvestimentos + saldoContasInvestimento + saldoContasCorrentes

    const totalDividas = dividas.reduce((s, d) => s + Number(d.saldo_devedor), 0)
    const faturasEmAberto = pendencias
      .filter((p) => p.fatura_cartao_id)
      .reduce((s, p) => s + Number(p.valor), 0)
    const contasAPagar = pendencias
      .filter((p) => !p.fatura_cartao_id)
      .reduce((s, p) => s + Number(p.valor), 0)
    const passivos = totalDividas + faturasEmAberto + contasAPagar

    // Aportes: o que está registrado em investimentos + o que foi transferido
    // para contas de investimento. A separação de rendimento/aporte patronal
    // ainda não existe — por isso ganho de capital não é estimado aqui.
    const valorInvestido = totalInvestimentos + saldoContasInvestimento

    return {
      totalImoveis,
      totalVeiculos,
      totalBens,
      totalInvestimentos,
      totalDosBens,
      saldoContasInvestimento,
      saldoContasCorrentes,
      ativos,
      totalDividas,
      faturasEmAberto,
      contasAPagar,
      passivos,
      patrimonioLiquido: ativos - passivos,
      valorInvestido,
      parcelasMes: dividas.reduce((s, d) => s + Number(d.valor_parcela ?? 0), 0),
    }
  }, [contas, saldosPorConta, imoveis, veiculos, bens, investimentos, dividas, pendencias, indiceImovel])

  const composicaoAtivos = useMemo(
    () =>
      [
        { nome: 'Imóveis', valor: numeros.totalImoveis, href: '/imoveis' },
        { nome: 'Veículos', valor: numeros.totalVeiculos, href: '/veiculos' },
        { nome: 'Bens e móveis', valor: numeros.totalBens, href: '/bens' },
        {
          nome: 'Investimentos',
          valor: numeros.totalInvestimentos + numeros.saldoContasInvestimento,
          href: '/investimentos',
        },
        { nome: 'Contas correntes', valor: numeros.saldoContasCorrentes, href: '/contas' },
      ].filter((item) => item.valor > 0),
    [numeros]
  )

  const composicaoPassivos = useMemo(
    () =>
      [
        { nome: 'Financiamentos e empréstimos', valor: numeros.totalDividas, href: '/dividas' },
        { nome: 'Faturas de cartão em aberto', valor: numeros.faturasEmAberto, href: '/faturas' },
        { nome: 'Contas a pagar', valor: numeros.contasAPagar, href: '/contas-pagar' },
      ].filter((item) => item.valor > 0),
    [numeros]
  )

  const maiorAtivo = Math.max(1, ...composicaoAtivos.map((a) => a.valor))
  const maiorPassivo = Math.max(1, ...composicaoPassivos.map((p) => p.valor))

  const semDados =
    !carregando &&
    numeros.ativos === 0 &&
    numeros.passivos === 0

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Investimentos e Patrimônio"
        descricao="Quanto você tem, quanto você deve e do que o seu patrimônio é feito."
      />

      {carregando && <p className="text-sm text-texto-suave">Carregando...</p>}

      {semDados && (
        <div className="cartao p-6 text-center">
          <p className="text-sm text-texto-suave">
            Ainda não há nada para somar. Cadastre{' '}
            <Link href="/imoveis" className="font-medium text-primaria hover:underline">
              imóveis
            </Link>
            ,{' '}
            <Link href="/veiculos" className="font-medium text-primaria hover:underline">
              veículos
            </Link>{' '}
            ou{' '}
            <Link href="/bens" className="font-medium text-primaria hover:underline">
              bens
            </Link>{' '}
            para o painel ganhar vida.
          </p>
        </div>
      )}

      {!carregando && !semDados && (
        <>
          {/* Patrimônio líquido em destaque */}
          <div className="mb-4 rounded-xl bg-marinho p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-white/70">Patrimônio líquido</p>
            <p className="mt-1 whitespace-nowrap text-3xl font-bold text-white sm:text-4xl">
              {moeda(numeros.patrimonioLiquido)}
            </p>
            <p className="mt-2 text-sm text-white/70">
              {moeda(numeros.ativos)} em ativos − {moeda(numeros.passivos)} em passivos
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CartaoNumero
              titulo="Ativos"
              valor={moeda(numeros.ativos)}
              detalhe="Bens + investimentos + contas"
              cor="text-receita"
            />
            <CartaoNumero
              titulo="Passivos"
              valor={moeda(numeros.passivos)}
              detalhe={
                numeros.parcelasMes > 0
                  ? `${moeda(numeros.parcelasMes)} em parcelas por mês`
                  : 'Dívidas, faturas e contas'
              }
              cor="text-despesa"
            />
            <CartaoNumero
              titulo="Total dos bens"
              valor={moeda(numeros.totalDosBens)}
              detalhe="Imóveis, veículos e móveis"
            />
            <CartaoNumero
              titulo="Valor investido"
              valor={moeda(numeros.valorInvestido)}
              detalhe="Saldo das aplicações — ainda com rendimento junto"
            />
          </div>

          {/* Ganho de capital ainda depende do detalhamento de aportes */}
          <div className="cartao mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-semibold text-texto">Ganho de capital</p>
              <p className="mt-0.5 text-xs text-texto-suave">
                Contas como FGTS e previdência trazem aporte patronal e rendimento misturados ao
                que você aportou. Separar isso é o próximo passo, que ficou para depois.
              </p>
            </div>
            <span className="whitespace-nowrap text-lg font-bold text-texto-suave">—</span>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Composição dos ativos */}
            <section className="cartao p-4">
              <h2 className="mb-1 text-sm font-semibold text-texto">Do que são feitos os ativos</h2>
              <p className="mb-4 text-xs text-texto-suave">
                Imóveis pelo valor corrigido, veículos pela FIPE e bens já depreciados.
              </p>

              {composicaoAtivos.length === 0 ? (
                <p className="py-6 text-center text-sm text-texto-suave">Nenhum ativo cadastrado.</p>
              ) : (
                <>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={composicaoAtivos}
                          dataKey="valor"
                          nameKey="nome"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={2}
                        >
                          {composicaoAtivos.map((item, i) => (
                            <Cell
                              key={item.nome}
                              fill={CORES_COMPOSICAO[i % CORES_COMPOSICAO.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(valor) => moeda(Number(valor ?? 0))}
                          contentStyle={{
                            borderRadius: '0.5rem',
                            border: '1px solid var(--borda)',
                            background: 'var(--superficie)',
                            fontSize: '0.875rem',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-4 space-y-3">
                    {composicaoAtivos.map((item, i) => (
                      <LinhaComposicao
                        key={item.nome}
                        rotulo={item.nome}
                        valor={item.valor}
                        maximo={maiorAtivo}
                        cor={CORES_COMPOSICAO[i % CORES_COMPOSICAO.length]}
                        href={item.href}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* Composição dos passivos */}
            <section className="cartao p-4">
              <h2 className="mb-1 text-sm font-semibold text-texto">O que você ainda deve</h2>
              <p className="mb-4 text-xs text-texto-suave">
                Saldo devedor dos financiamentos, faturas fechadas e contas em aberto.
              </p>

              {composicaoPassivos.length === 0 ? (
                <div className="rounded-lg bg-receita/10 p-4 text-center">
                  <p className="text-sm font-medium text-receita">Nenhuma dívida em aberto.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {composicaoPassivos.map((item) => (
                    <LinhaComposicao
                      key={item.nome}
                      rotulo={item.nome}
                      valor={item.valor}
                      maximo={maiorPassivo}
                      cor="var(--despesa)"
                      href={item.href}
                    />
                  ))}
                </div>
              )}

              {dividas.length > 0 && (
                <div className="mt-5 border-t border-borda pt-4">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-texto-suave">
                    Financiamentos em aberto
                  </p>
                  <ul className="space-y-2">
                    {dividas.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-texto">{d.nome}</span>
                        <span className="whitespace-nowrap font-medium text-despesa">
                          {moeda(d.saldo_devedor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          <p className="mt-6 text-center text-xs text-texto-suave">
            O passivo considera as faturas já fechadas — compras do ciclo do cartão que ainda não
            fechou entram quando a fatura fechar. Cadastre em{' '}
            <Link href="/dividas" className="font-medium text-primaria hover:underline">
              Dívidas e Financiamentos
            </Link>{' '}
            o que ainda falta pagar.
          </p>
        </>
      )}
    </Pagina>
  )
}
