'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { buscarTudo } from '@/lib/buscarTudo'
import {
  chaveCompetencia,
  diasAte,
  hojeISO,
  limitesCompetencia,
  moeda,
  rotuloDia,
  rotuloMesLongo,
  situacaoVencimento,
  somarDias,
  textoVencimento,
} from '@/lib/formato'
import {
  CAMPOS_TRANSACAO_CALC,
  COR_GRUPO,
  METAS,
  ROTULO_GRUPO,
  calcular,
  type Grupo,
  type Resultado,
  type Subcategoria,
  type TransacaoCalc,
} from '@/lib/regra503020'
import { IconeBanco, IconeGrafico, IconeImportar, IconeMais } from '@/components/Icones'
import { EstadoVazio, LinhaLink, Pagina, Seta } from '@/components/ui'
import { linkResumo } from '@/lib/resumo'

type Pendencia = {
  id: string
  descricao: string
  valor: number
  tipo: string
  data_vencimento: string
}

type Movimento = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  categorias: { nome: string } | null
  contas: { nome: string; cor: string | null } | null
}

type Conta = { id: string; nome: string; cor: string | null; saldo_inicial: number; tipo: string }

const GRUPOS: Grupo[] = ['necessidade', 'desejo', 'investimento']

function porcento(valor: number): string {
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export default function InicioPage() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [nome, setNome] = useState('')
  const [contas, setContas] = useState<Conta[]>([])
  const [saldos, setSaldos] = useState<Record<string, number>>({})
  const [doMes, setDoMes] = useState<Movimento[]>([])
  const [lembretes, setLembretes] = useState<Pendencia[]>([])
  const [regua, setRegua] = useState<Resultado | null>(null)
  const [qtdPendencias, setQtdPendencias] = useState(0)

  const hoje = hojeISO()
  const mesAtual = chaveCompetencia(hoje)

  useEffect(() => {
    async function carregar() {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        router.push('/login')
        return
      }

      const { data: perfil } = await supabase
        .from('perfis')
        .select('nome')
        .eq('id', userData.user.id)
        .single()
      setNome(perfil?.nome ?? '')

      const { inicio, fim } = limitesCompetencia(mesAtual)
      const limiteLembrete = somarDias(hojeISO(), 7)

      const [
        { data: contasData },
        { data: todosMovimentos },
        { data: movimentosMes },
        { data: pendencias },
        { data: subcategorias },
        { data: transacoesRegua },
        { count: semOrigem },
        { count: semCategoria },
        { count: semSubcategoria },
      ] = await Promise.all([
        supabase.from('contas').select('id, nome, cor, saldo_inicial, tipo').order('nome'),
        buscarTudo((de, ate) =>
          supabase
            .from('transacoes')
            .select('conta_id, valor, tipo')
            .eq('status', 'pago')
            .order('id')
            .range(de, ate)
        ),
        supabase
          .from('transacoes')
          .select('id, data, descricao, valor, tipo, categorias(nome), contas(nome, cor)')
          .eq('status', 'pago')
          .is('transferencia_id', null)
          // O pagamento agregado de uma fatura de cartão é a mesma despesa das
          // compras já lançadas individualmente — contar as duas dobra o gasto
          .is('fatura_cartao_id', null)
          // Lançamento neutro (ex: adiantamento salarial já recebido fora do sistema)
          // existe só pro saldo bater, não é receita/despesa real
          .eq('neutro', false)
          .gte('data', inicio)
          .lte('data', fim)
          .order('data', { ascending: false }),
        // Lembretes: contas em aberto que vencem até 7 dias à frente
        supabase
          .from('transacoes')
          .select('id, descricao, valor, tipo, data_vencimento')
          .eq('status', 'pendente')
          .lte('data_vencimento', limiteLembrete)
          .order('data_vencimento'),
        // Régua 50/30/20: mesma conta da Calculadora, só que do mês atual
        supabase.from('subcategorias').select('id, categoria_id, nome, grupo_503020'),
        buscarTudo<TransacaoCalc>((de, ate) =>
          supabase
            .from('transacoes')
            .select(CAMPOS_TRANSACAO_CALC)
            .eq('status', 'pago')
            .gte('data', inicio)
            .lte('data', fim)
            .order('id')
            .range(de, ate)
        ),
        // Pendências de classificação (mesmos critérios da tela /pendencias)
        supabase
          .from('transacoes')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pago')
          .is('conta_id', null)
          .is('cartao_id', null)
          .is('transferencia_id', null)
          .is('fatura_cartao_id', null),
        supabase
          .from('transacoes')
          .select('id', { count: 'exact', head: true })
          .is('categoria_id', null)
          .is('transferencia_id', null)
          .is('fatura_cartao_id', null)
          .eq('neutro', false),
        supabase
          .from('transacoes')
          .select('id', { count: 'exact', head: true })
          .eq('tipo', 'despesa')
          .eq('status', 'pago')
          .not('categoria_id', 'is', null)
          .is('subcategoria_id', null)
          .is('transferencia_id', null)
          .is('fatura_cartao_id', null)
          .eq('neutro', false),
      ])

      const lista = (contasData ?? []) as Conta[]
      setContas(lista)

      const acumulado: Record<string, number> = {}
      for (const c of lista) acumulado[c.id] = Number(c.saldo_inicial)
      for (const m of todosMovimentos ?? []) {
        if (!m.conta_id || !(m.conta_id in acumulado)) continue
        acumulado[m.conta_id] += m.tipo === 'receita' ? Number(m.valor) : -Number(m.valor)
      }
      setSaldos(acumulado)

      setDoMes((movimentosMes ?? []) as unknown as Movimento[])
      setLembretes((pendencias ?? []) as Pendencia[])
      setQtdPendencias((semOrigem ?? 0) + (semCategoria ?? 0) + (semSubcategoria ?? 0))

      const subcategoriaMap = new Map(
        ((subcategorias ?? []) as Subcategoria[]).map((s) => [s.id, s])
      )
      const contaTipoMap = new Map(lista.map((c) => [c.id, c.tipo]))
      setRegua(calcular(transacoesRegua ?? [], subcategoriaMap, contaTipoMap))

      setCarregando(false)
    }
    carregar()
  }, [router, mesAtual])

  // "Saldo em contas" é só liquidez disponível — conta corrente e poupança.
  // Investimento entra no patrimônio, não aqui, pra não misturar caixa com aplicação.
  const saldoEmContas = contas
    .filter((c) => c.tipo === 'corrente' || c.tipo === 'poupanca')
    .reduce((soma, c) => soma + (saldos[c.id] ?? 0), 0)
  const receitasMes = doMes
    .filter((m) => m.tipo === 'receita')
    .reduce((s, m) => s + Number(m.valor), 0)
  const despesasMes = doMes
    .filter((m) => m.tipo === 'despesa')
    .reduce((s, m) => s + Number(m.valor), 0)
  const resultadoMes = receitasMes - despesasMes

  // Últimos lançamentos agrupados por dia ("Hoje", "Ontem", "Segunda-feira, 12 de out.")
  const ultimosPorDia = useMemo(() => {
    const mapa = new Map<string, Movimento[]>()
    for (const m of doMes.slice(0, 10)) {
      const lista = mapa.get(m.data)
      if (lista) lista.push(m)
      else mapa.set(m.data, [m])
    }
    return Array.from(mapa.entries())
  }, [doMes])

  const { inicio: inicioMes, fim: fimMes } = limitesCompetencia(mesAtual)
  const periodo = `${diaEMes(inicioMes)} a ${diaEMes(fimMes)}`

  const dataExtenso = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  if (carregando) {
    return (
      <Pagina>
        <p className="text-sm text-texto-suave">Carregando...</p>
      </Pagina>
    )
  }

  return (
    <Pagina>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-texto sm:text-3xl">
          {rotuloMesLongo(mesAtual)}
        </h1>
        <p className="mt-1 text-sm text-texto-suave">
          {nome ? `Olá, ${nome}. ` : ''}Hoje é {dataExtenso}.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* O mês numa frase */}
          <section aria-label="Resumo do mês">
            <p className="text-lg leading-snug text-texto">
              Neste mês entraram{' '}
              <Link
                href={linkResumo({
                  de: inicioMes,
                  ate: fimMes,
                  regra: 'resultado',
                  tipo: 'receita',
                  titulo: 'Entradas do mês',
                })}
                className="font-bold whitespace-nowrap text-receita underline decoration-dotted underline-offset-4"
              >
                {moeda(receitasMes)}
              </Link>{' '}
              e saíram{' '}
              <Link
                href={linkResumo({
                  de: inicioMes,
                  ate: fimMes,
                  regra: 'resultado',
                  tipo: 'despesa',
                  titulo: 'Saídas do mês',
                })}
                className="font-bold whitespace-nowrap text-despesa underline decoration-dotted underline-offset-4"
              >
                {moeda(despesasMes)}
              </Link>
              .
            </p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm text-texto-suave">
                {resultadoMes >= 0 ? 'Sobrou' : 'Faltaram'}
              </span>
              <span
                className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${
                  resultadoMes >= 0 ? 'text-receita' : 'text-despesa'
                }`}
              >
                {moeda(Math.abs(resultadoMes))}
              </span>
            </p>
            <p className="mt-1 text-xs text-texto-suave">
              Mês de competência: {periodo}, por causa do salário que cai no fim do mês.
            </p>
          </section>

          {qtdPendencias > 0 && (
            <Link
              href="/pendencias"
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-alerta/30 bg-alerta/10 px-4 py-3 transition-colors hover:bg-alerta/15"
            >
              <span className="text-texto">
                <strong className="font-semibold">{qtdPendencias}</strong>{' '}
                {qtdPendencias === 1 ? 'pendência' : 'pendências'} de classificação (conta, categoria ou subcategoria)
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-alerta">
                Resolver <Seta />
              </span>
            </Link>
          )}

          <ReguaMes resultado={regua} de={inicioMes} ate={fimMes} />

          {/* Contas a vencer */}
          <section className="cartao p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-texto">Contas a vencer</h2>
              <Link
                href="/contas-pagar"
                className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-primaria hover:underline"
              >
                Ver tudo
              </Link>
            </div>

            {lembretes.length === 0 ? (
              <p className="py-3 text-sm text-texto-suave">
                Nenhuma conta em aberto vence nos próximos 7 dias.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-borda">
                  {lembretes.slice(0, 5).map((p) => (
                    <li
                      key={p.id}
                      className="flex min-h-14 items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-texto">{p.descricao}</p>
                        <span className={`mt-1 ${classeChipVencimento(p.data_vencimento)}`}>
                          {textoVencimento(p.data_vencimento)}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 whitespace-nowrap font-semibold ${
                          p.tipo === 'receita' ? 'text-receita' : 'text-texto'
                        }`}
                      >
                        {moeda(p.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
                {lembretes.length > 5 && (
                  <p className="mt-2 text-sm text-texto-suave">
                    E mais {lembretes.length - 5} conta{lembretes.length - 5 > 1 ? 's' : ''}.
                  </p>
                )}
              </>
            )}
          </section>

          {/* Últimos do mês, por dia */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-texto">Últimos lançamentos</h2>
              <Link
                href="/transacoes"
                className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-primaria hover:underline"
              >
                Ver todos
              </Link>
            </div>

            {ultimosPorDia.length === 0 ? (
              <EstadoVazio
                titulo="Nenhum lançamento neste mês"
                descricao="Registre um gasto ou importe o extrato do banco."
                acao={
                  <Link
                    href="/lancamentos"
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primaria px-4 text-sm font-semibold text-sobre-cor hover:bg-primaria-escura"
                  >
                    <IconeMais className="h-4 w-4" />
                    Novo lançamento
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {ultimosPorDia.map(([dia, itens]) => (
                  <div key={dia}>
                    <div className="flex items-baseline justify-between px-1 pb-1 text-sm font-medium text-texto-suave">
                      <span>{rotuloDia(dia)}</span>
                      <span>{moedaComSinal(totalDoDia(itens))}</span>
                    </div>
                    <ul className="cartao divide-y divide-borda px-4">
                      {itens.map((m) => (
                        <ItemMovimento key={m.id} movimento={m} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-6">
          <section className="cartao p-4">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-base font-semibold text-texto">Saldo nas contas</h2>
              <Link
                href="/contas"
                className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-primaria hover:underline"
              >
                Contas
              </Link>
            </div>

            {contas.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-texto-suave">Nenhuma conta cadastrada.</p>
                <Link
                  href="/contas"
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primaria hover:underline"
                >
                  Cadastrar conta
                </Link>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-borda">
                  {contas.map((c) => (
                    <li key={c.id}>
                      <LinhaLink href={`/extrato?conta=${c.id}`} className="min-h-12">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white"
                            style={{ backgroundColor: c.cor ?? '#2a78d6' }}
                          >
                            <IconeBanco className="h-3.5 w-3.5" />
                          </span>
                          <span className="truncate text-texto">{c.nome}</span>
                        </span>
                        <span
                          className={`whitespace-nowrap font-semibold ${
                            (saldos[c.id] ?? 0) >= 0 ? 'text-texto' : 'text-despesa'
                          }`}
                        >
                          {moeda(saldos[c.id] ?? 0)}
                        </span>
                      </LinhaLink>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-borda pt-3">
                  <span className="text-sm text-texto-suave">Em conta corrente e poupança</span>
                  <span
                    className={`whitespace-nowrap font-bold ${
                      saldoEmContas >= 0 ? 'text-texto' : 'text-despesa'
                    }`}
                  >
                    {moeda(saldoEmContas)}
                  </span>
                </div>
              </>
            )}
          </section>

          <section className="cartao p-4">
            <h2 className="mb-3 text-base font-semibold text-texto">Atalhos</h2>
            <div className="space-y-2">
              <Link
                href="/lancamentos"
                className="flex min-h-12 items-center gap-3 rounded-lg border border-borda px-3 text-texto transition-colors hover:bg-fundo"
              >
                <IconeMais className="h-5 w-5 text-primaria" />
                Novo lançamento
              </Link>
              <Link
                href="/importar"
                className="flex min-h-12 items-center gap-3 rounded-lg border border-borda px-3 text-texto transition-colors hover:bg-fundo"
              >
                <IconeImportar className="h-5 w-5 text-primaria" />
                Importar extrato
              </Link>
              <Link
                href="/dashboard"
                className="flex min-h-12 items-center gap-3 rounded-lg border border-borda px-3 text-texto transition-colors hover:bg-fundo"
              >
                <IconeGrafico className="h-5 w-5 text-primaria" />
                Ver relatórios
              </Link>
            </div>
          </section>
        </div>
      </div>
    </Pagina>
  )
}

/**
 * Régua do mês: quanto da renda líquida foi para Essenciais, Qualidade de Vida
 * e Futuro, com as marcas de 50% e 80% (50 + 30) para comparar com a meta.
 */
function ReguaMes({
  resultado,
  de,
  ate,
}: {
  resultado: Resultado | null
  de: string
  ate: string
}) {
  if (!resultado) return null
  const base = resultado.rendaLiquida

  const cabecalho = (
    <div className="mb-1 flex items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-texto">Para onde foi a renda</h2>
      <Link
        href="/calculadora-50-30-20"
        className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-primaria hover:underline"
      >
        Calculadora
      </Link>
    </div>
  )

  if (base <= 0) {
    return (
      <section className="cartao p-4">
        {cabecalho}
        <p className="py-3 text-sm text-texto-suave">
          A régua 50/30/20 aparece quando a renda deste mês for lançada.
        </p>
      </section>
    )
  }

  const perc = (valor: number) => (valor / base) * 100
  const percNaoClassificado = perc(resultado.naoClassificado)
  const somaPerc = GRUPOS.reduce((s, g) => s + perc(resultado.buckets[g]), 0) + percNaoClassificado
  // Se o mês gastou mais que a renda, a régua encolhe para caber tudo
  const escala = Math.max(100, somaPerc)
  const largura = (p: number) => `${(p / escala) * 100}%`

  const descricaoBarra = [
    ...GRUPOS.map((g) => `${ROTULO_GRUPO[g]} ${porcento(perc(resultado.buckets[g]))}`),
    resultado.naoClassificado > 0 ? `sem grupo ${porcento(percNaoClassificado)}` : '',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <section className="cartao p-4">
      {cabecalho}

      <div className="relative mt-1 mb-3 pt-5">
        <div
          className="flex h-6 gap-0.5 overflow-hidden rounded-md bg-fundo"
          role="img"
          aria-label={descricaoBarra}
        >
          {GRUPOS.map((g) => (
            <span
              key={g}
              className="block h-full"
              style={{ width: largura(perc(resultado.buckets[g])), backgroundColor: COR_GRUPO[g] }}
            />
          ))}
          {resultado.naoClassificado > 0 && (
            <span
              className="listras-sem-grupo block h-full"
              style={{ width: largura(percNaoClassificado) }}
            />
          )}
        </div>
        {[50, 80].map((marco) => (
          <span
            key={marco}
            aria-hidden="true"
            className="absolute top-0 -bottom-1 border-l-2 border-dashed border-texto"
            style={{ left: largura(marco) }}
          >
            <span className="absolute -top-0.5 left-1 text-xs font-semibold text-texto-suave">
              {marco}%
            </span>
          </span>
        ))}
      </div>

      <ul className="divide-y divide-borda">
        {GRUPOS.map((g) => {
          const p = perc(resultado.buckets[g])
          const meta = METAS[g]
          // Futuro tem meta mínima; os outros dois, meta máxima
          const ok = g === 'investimento' ? p >= meta - 0.5 : p <= meta + 0.5
          const textoMeta = g === 'investimento' ? `meta ${meta}% ou mais` : `meta até ${meta}%`
          const textoSituacao =
            g === 'investimento' ? (ok ? 'na meta' : 'abaixo') : ok ? 'dentro' : 'acima'
          return (
            <li key={g}>
              <Link
                href={linkResumo({ de, ate, regra: '503020', grupo: g, titulo: ROTULO_GRUPO[g] })}
                className="-mx-2 grid grid-cols-[0.75rem_1fr_auto_auto] items-center gap-x-2.5 gap-y-0.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-fundo"
              >
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: COR_GRUPO[g] }} />
                <span className="font-semibold text-texto">{ROTULO_GRUPO[g]}</span>
                <span className="text-right font-semibold text-texto">
                  {moeda(resultado.buckets[g])}
                </span>
                <span className="row-span-2 self-center">
                  <Seta />
                </span>
                <span className="col-start-2 col-end-4 flex items-center justify-between gap-2 text-sm text-texto-suave">
                  <span>
                    {porcento(p)} da renda, {textoMeta}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold ${
                      ok ? 'bg-fundo text-texto-suave' : 'bg-alerta/12 text-alerta'
                    }`}
                  >
                    {textoSituacao}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
        {resultado.naoClassificado > 0 && (
          <li>
            <Link
              href={linkResumo({
                de,
                ate,
                regra: '503020',
                grupo: 'sem',
                titulo: 'Sem grupo 50/30/20',
              })}
              className="-mx-2 grid grid-cols-[0.75rem_1fr_auto_auto] items-center gap-x-2.5 gap-y-0.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-fundo"
            >
              <span className="listras-sem-grupo h-3 w-3 rounded-sm" />
              <span className="font-semibold text-texto">Sem grupo</span>
              <span className="text-right font-semibold text-texto">
                {moeda(resultado.naoClassificado)}
              </span>
              <span className="row-span-2 self-center">
                <Seta />
              </span>
              <span className="col-start-2 col-end-4 text-sm text-texto-suave">
                {porcento(percNaoClassificado)} da renda em subcategorias ainda sem grupo 50/30/20
              </span>
            </Link>
          </li>
        )}
      </ul>
    </section>
  )
}

function ItemMovimento({ movimento }: { movimento: Movimento }) {
  const receita = movimento.tipo === 'receita'
  const detalhe = [movimento.categorias?.nome ?? 'Sem categoria', movimento.contas?.nome]
    .filter(Boolean)
    .join(', ')
  return (
    <li className="flex min-h-14 items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-medium text-texto">{movimento.descricao}</p>
        <p className="truncate text-sm text-texto-suave">{detalhe}</p>
      </div>
      <span
        className={`shrink-0 whitespace-nowrap font-semibold ${receita ? 'text-receita' : 'text-despesa'}`}
      >
        {receita ? '+' : '−'}
        {moeda(movimento.valor)}
      </span>
    </li>
  )
}

function totalDoDia(itens: Movimento[]): number {
  return itens.reduce((s, m) => s + (m.tipo === 'receita' ? Number(m.valor) : -Number(m.valor)), 0)
}

function moedaComSinal(valor: number): string {
  return `${valor >= 0 ? '+' : '−'}${moeda(Math.abs(valor))}`
}

/** "2026-09-26" → "26 de set." */
function diaEMes(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}

function classeChipVencimento(iso: string): string {
  const base = 'inline-flex rounded-full px-2.5 py-0.5 text-sm font-medium'
  const situacao = situacaoVencimento(iso)
  if (situacao === 'vencida') return `${base} bg-despesa/10 text-despesa`
  if (situacao === 'hoje' || diasAte(iso) === 1) return `${base} bg-alerta/12 text-alerta`
  return `${base} bg-fundo text-texto-suave`
}
