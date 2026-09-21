'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '@/lib/supabaseClient'
import { buscarTudo } from '@/lib/buscarTudo'
import {
  chaveCompetencia,
  chaveMes,
  deslocarMes,
  limitesDoMes,
  moeda,
  rotuloMesCurto,
  rotuloMesLongo,
  somarDias,
} from '@/lib/formato'
import { IconeSeta } from '@/components/Icones'
import { CabecalhoPagina, Pagina, SeletorMultiplo } from '@/components/ui'

type Grupo503020 = 'necessidade' | 'desejo' | 'investimento' | 'deducao'
type Grupo = 'necessidade' | 'desejo' | 'investimento'

type Subcategoria = { id: string; categoria_id: string; nome: string; grupo_503020: Grupo503020 | null }
type Membro = { id: string; nome: string }

type TransacaoCalc = {
  id: string
  data: string
  valor: number
  tipo: 'receita' | 'despesa'
  escopo: string
  dono_id: string
  categoria_id: string | null
  subcategoria_id: string | null
  conta_id: string | null
  transferencia_id: string | null
  fatura_cartao_id: string | null
  neutro: boolean
}

const FAMILIAR = '__familiar__'
// Janela dos dashboards de tendência/resumo. O gráfico mensal antigo usa 6 meses;
// buscamos 12 meses do banco pra também alimentar o painel-resumo de 12 meses.
const MESES_TENDENCIA = 6
const MESES_RESUMO_LONGO = 12

const METAS: Record<Grupo, number> = {
  necessidade: 50,
  desejo: 30,
  investimento: 20,
}

const ROTULO_GRUPO: Record<Grupo, string> = {
  necessidade: 'Essenciais',
  desejo: 'Qualidade de Vida',
  investimento: 'Futuro',
}

const CONCEITO_GRUPO: Record<Grupo, string> = {
  necessidade: 'Sustentar',
  desejo: 'Desfrutar',
  investimento: 'Construir',
}

const PERGUNTA_GRUPO: Record<Grupo, string> = {
  necessidade: 'O que é indispensável para manter nossa família saudável, segura e funcionando?',
  desejo: 'O que podemos fazer para desfrutar das bênçãos de Deus com equilíbrio e gratidão?',
  investimento: 'Que decisões financeiras de hoje construirão a família que desejamos amanhã?',
}

const COR_GRUPO: Record<Grupo, string> = {
  necessidade: '#2a78d6',
  desejo: '#eda100',
  investimento: '#159d76',
}
const ROTULO_NAO_CLASSIFICADO = 'Não classificado'
const COR_NAO_CLASSIFICADO = '#94a3b8'

const QUADRO_COMPARATIVO: { grupo: Grupo; tradicional: string }[] = [
  { grupo: 'necessidade', tradicional: 'Necessidades' },
  { grupo: 'desejo', tradicional: 'Desejos' },
  { grupo: 'investimento', tradicional: 'Investimentos' },
]

type Resultado = {
  rendaBruta: number
  deducoes: number
  rendaLiquida: number
  buckets: Record<Grupo, number>
  naoClassificado: number
}

function passaQuem(t: TransacaoCalc, selecionados: string[]): boolean {
  if (selecionados.length === 0) return true
  if (t.escopo === 'familiar') return selecionados.includes(FAMILIAR)
  return selecionados.includes(t.dono_id)
}

function calcular(
  transacoes: TransacaoCalc[],
  subcategoriaMap: Map<string, Subcategoria>,
  contaTipoMap: Map<string, string>
): Resultado {
  let rendaBruta = 0
  let deducoes = 0
  let naoClassificado = 0
  const buckets = { necessidade: 0, desejo: 0, investimento: 0 }
  const transferencias = new Map<string, TransacaoCalc[]>()

  for (const t of transacoes) {
    if (t.neutro || t.fatura_cartao_id) continue

    if (t.transferencia_id) {
      const lista = transferencias.get(t.transferencia_id) ?? []
      lista.push(t)
      transferencias.set(t.transferencia_id, lista)
      continue
    }

    if (t.tipo === 'receita') {
      rendaBruta += t.valor
      continue
    }

    const sub = t.subcategoria_id ? subcategoriaMap.get(t.subcategoria_id) : null
    const grupo = sub?.grupo_503020 ?? null
    if (grupo === 'deducao') deducoes += t.valor
    else if (grupo === 'necessidade' || grupo === 'desejo' || grupo === 'investimento')
      buckets[grupo] += t.valor
    else naoClassificado += t.valor
  }

  // Aporte para conta de investimento (ex: aplicação em Cofrinhos) conta como
  // "Investimentos e futuro" — resgate (o caminho inverso) não conta como gasto nem receita
  for (const legs of transferencias.values()) {
    const despesaLeg = legs.find((l) => l.tipo === 'despesa')
    const receitaLeg = legs.find((l) => l.tipo === 'receita')
    if (!despesaLeg || !receitaLeg) continue
    const tipoOrigem = despesaLeg.conta_id ? contaTipoMap.get(despesaLeg.conta_id) : null
    const tipoDestino = receitaLeg.conta_id ? contaTipoMap.get(receitaLeg.conta_id) : null
    if (tipoDestino === 'investimento' && tipoOrigem !== 'investimento') {
      buckets.investimento += despesaLeg.valor
    }
  }

  return { rendaBruta, deducoes, rendaLiquida: rendaBruta - deducoes, buckets, naoClassificado }
}

function agruparPorSubcategoria(
  transacoes: TransacaoCalc[],
  grupo: Grupo,
  subcategoriaMap: Map<string, Subcategoria>,
  aportesInvestimento: number
) {
  const totais = new Map<string, number>()
  for (const t of transacoes) {
    if (t.neutro || t.fatura_cartao_id || t.transferencia_id || t.tipo !== 'despesa') continue
    const sub = t.subcategoria_id ? subcategoriaMap.get(t.subcategoria_id) : null
    if ((sub?.grupo_503020 ?? null) !== grupo) continue
    const nome = sub?.nome ?? 'Outro'
    totais.set(nome, (totais.get(nome) ?? 0) + t.valor)
  }
  if (grupo === 'investimento' && aportesInvestimento > 0) {
    totais.set('Aportes / Aplicações', (totais.get('Aportes / Aplicações') ?? 0) + aportesInvestimento)
  }
  return Array.from(totais.entries())
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor)
}

function calcularAportes(transacoes: TransacaoCalc[], contaTipoMap: Map<string, string>): number {
  const transferencias = new Map<string, TransacaoCalc[]>()
  for (const t of transacoes) {
    if (!t.transferencia_id) continue
    const lista = transferencias.get(t.transferencia_id) ?? []
    lista.push(t)
    transferencias.set(t.transferencia_id, lista)
  }
  let total = 0
  for (const legs of transferencias.values()) {
    const despesaLeg = legs.find((l) => l.tipo === 'despesa')
    const receitaLeg = legs.find((l) => l.tipo === 'receita')
    if (!despesaLeg || !receitaLeg) continue
    const tipoOrigem = despesaLeg.conta_id ? contaTipoMap.get(despesaLeg.conta_id) : null
    const tipoDestino = receitaLeg.conta_id ? contaTipoMap.get(receitaLeg.conta_id) : null
    if (tipoDestino === 'investimento' && tipoOrigem !== 'investimento') total += despesaLeg.valor
  }
  return total
}

function BarraProgresso({ grupo, valor, base }: { grupo: Grupo; valor: number; base: number }) {
  const meta = METAS[grupo]
  const percReal = base > 0 ? (valor / base) * 100 : 0
  const dentro = percReal <= meta + 0.5
  const larguraBarra = Math.min(100, (percReal / meta) * 100)

  return (
    <div className="cartao p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-texto">{ROTULO_GRUPO[grupo]}</h3>
        <span className="text-xs font-medium text-texto-suave">meta {meta}%</span>
      </div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide" style={{ color: COR_GRUPO[grupo] }}>
        {CONCEITO_GRUPO[grupo]}
      </p>
      <p className="mb-2 text-2xl font-bold text-texto">{moeda(valor)}</p>
      <div className="mb-1.5 h-2.5 w-full overflow-hidden rounded-full bg-fundo">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${larguraBarra}%`,
            backgroundColor: dentro ? COR_GRUPO[grupo] : '#dc4c4c',
          }}
        />
      </div>
      <p className={`mb-2 text-xs font-medium ${dentro ? 'text-texto-suave' : 'text-despesa'}`}>
        {percReal.toFixed(1)}% da renda líquida
        {!dentro && ` — ${(percReal - meta).toFixed(1)} pontos acima da meta`}
      </p>
      <p className="border-t border-borda pt-2 text-[11px] italic text-texto-suave">
        {PERGUNTA_GRUPO[grupo]}
      </p>
    </div>
  )
}

/** Pizza colorida com a composição do período — Essenciais / Qualidade de Vida / Futuro / Não classificado */
function GraficoPizzaClassificacao({ resultado }: { resultado: Resultado }) {
  const dados = (
    [
      ['necessidade', resultado.buckets.necessidade, COR_GRUPO.necessidade],
      ['desejo', resultado.buckets.desejo, COR_GRUPO.desejo],
      ['investimento', resultado.buckets.investimento, COR_GRUPO.investimento],
      [ROTULO_NAO_CLASSIFICADO, resultado.naoClassificado, COR_NAO_CLASSIFICADO],
    ] as const
  )
    .map(([chave, valor, cor]) => ({
      nome: chave === ROTULO_NAO_CLASSIFICADO ? chave : ROTULO_GRUPO[chave as Grupo],
      valor,
      cor,
    }))
    .filter((d) => d.valor > 0)

  if (dados.length === 0) {
    return <p className="py-14 text-center text-xs text-texto-suave">Nenhum gasto neste período.</p>
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius={48} outerRadius={80} paddingAngle={2}>
            {dados.map((d) => (
              <Cell key={d.nome} fill={d.cor} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => moeda(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Painel-resumo agregando vários meses de uma vez (usado nos dashboards de 6 e 12 meses) */
function PainelResumoPeriodo({
  titulo,
  resultado,
  detalhe,
}: {
  titulo: string
  resultado: Resultado
  detalhe: Record<Grupo, { nome: string; valor: number }[]>
}) {
  const totalGasto =
    resultado.buckets.necessidade + resultado.buckets.desejo + resultado.buckets.investimento + resultado.naoClassificado
  const sobra = resultado.rendaLiquida - totalGasto
  const grupos: Grupo[] = ['necessidade', 'desejo', 'investimento']

  return (
    <section className="cartao p-4">
      <h2 className="mb-4 text-base font-semibold text-texto">{titulo}</h2>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-texto-suave">Renda líquida</p>
          <p className="text-lg font-bold text-texto">{moeda(resultado.rendaLiquida)}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-texto-suave">Gasto/investido</p>
          <p className="text-lg font-bold text-texto">{moeda(totalGasto)}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-texto-suave">Sobra</p>
          <p className={`text-lg font-bold ${sobra >= 0 ? 'text-receita' : 'text-despesa'}`}>{moeda(sobra)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GraficoPizzaClassificacao resultado={resultado} />

        <div className="flex flex-col justify-center gap-3">
          {grupos.map((grupo) => {
            const meta = METAS[grupo]
            const valor = resultado.buckets[grupo]
            const perc = resultado.rendaLiquida > 0 ? (valor / resultado.rendaLiquida) * 100 : 0
            const dentro = perc <= meta + 0.5
            return (
              <div key={grupo}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-texto">{ROTULO_GRUPO[grupo]}</span>
                  <span className={dentro ? 'text-texto-suave' : 'font-medium text-despesa'}>
                    {perc.toFixed(1)}% <span className="text-texto-suave">(meta {meta}%)</span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-fundo">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (perc / meta) * 100)}%`,
                      backgroundColor: dentro ? COR_GRUPO[grupo] : '#dc4c4c',
                    }}
                  />
                </div>
              </div>
            )
          })}
          {resultado.naoClassificado > 0 && (
            <p className="text-xs text-texto-suave">
              <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: COR_NAO_CLASSIFICADO }} />{' '}
              Não classificado: <span className="font-medium text-texto">{moeda(resultado.naoClassificado)}</span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 border-t border-borda pt-4 sm:grid-cols-3">
        {grupos.map((grupo) => (
          <div key={grupo}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-suave">
              {ROTULO_GRUPO[grupo]}
            </h3>
            {detalhe[grupo].length === 0 ? (
              <p className="text-xs text-texto-suave">Nenhum gasto.</p>
            ) : (
              <ul className="space-y-1">
                {detalhe[grupo].slice(0, 5).map((item) => (
                  <li key={item.nome} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-texto-suave">{item.nome}</span>
                    <span className="shrink-0 font-medium text-texto">{moeda(item.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export default function Calculadora503020Page() {
  const [carregando, setCarregando] = useState(true)
  const [mesAtual, setMesAtual] = useState(() => chaveMes(new Date()))
  const [quemFiltro, setQuemFiltro] = useState<string[]>([])
  const [membros, setMembros] = useState<Membro[]>([])
  const [transacoes, setTransacoes] = useState<TransacaoCalc[]>([])
  const [subcategoriaMap, setSubcategoriaMap] = useState<Map<string, Subcategoria>>(new Map())
  const [contaTipoMap, setContaTipoMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    async function carregarListas() {
      const [{ data: subs }, { data: contas }, { data: perfis }] = await Promise.all([
        supabase.from('subcategorias').select('id, categoria_id, nome, grupo_503020'),
        supabase.from('contas').select('id, tipo'),
        supabase.from('perfis').select('id, nome').order('nome'),
      ])
      if (subs) setSubcategoriaMap(new Map(subs.map((s) => [s.id, s as Subcategoria])))
      if (contas) setContaTipoMap(new Map(contas.map((c) => [c.id, c.tipo])))
      if (perfis) setMembros(perfis)
    }
    carregarListas()
  }, [])

  useEffect(() => {
    async function carregar() {
      setCarregando(true)
      const inicioJanela = deslocarMes(mesAtual, -(MESES_RESUMO_LONGO - 1))
      const { inicio: inicioCalendario } = limitesDoMes(inicioJanela)
      // O salário cai perto do fim do mês mas já conta pro mês de competência
      // seguinte — sem essa folga, perderíamos o salário do fim do mês anterior
      // ao início da janela (ver chaveCompetencia)
      const inicio = somarDias(inicioCalendario, -7)
      const { fim } = limitesDoMes(mesAtual)

      const { data } = await buscarTudo<TransacaoCalc>((de, ate) =>
        supabase
          .from('transacoes')
          .select(
            'id, data, valor, tipo, escopo, dono_id, categoria_id, subcategoria_id, conta_id, transferencia_id, fatura_cartao_id, neutro'
          )
          .eq('status', 'pago')
          .gte('data', inicio)
          .lte('data', fim)
          .order('id')
          .range(de, ate)
      )
      setTransacoes(data ?? [])
      setCarregando(false)
    }
    carregar()
  }, [mesAtual])

  const opcoesQuem = useMemo(
    () => [...membros.map((m) => ({ id: m.id, nome: m.nome })), { id: FAMILIAR, nome: 'Familiar (compartilhado)' }],
    [membros]
  )

  const transacoesFiltradas = useMemo(
    () => transacoes.filter((t) => passaQuem(t, quemFiltro)),
    [transacoes, quemFiltro]
  )

  // Agrupa tudo por mês de competência (não mês calendário) uma única vez
  const porCompetencia = useMemo(() => {
    const mapa = new Map<string, TransacaoCalc[]>()
    for (const t of transacoesFiltradas) {
      const chave = chaveCompetencia(t.data)
      const lista = mapa.get(chave)
      if (lista) lista.push(t)
      else mapa.set(chave, [t])
    }
    return mapa
  }, [transacoesFiltradas])

  const chavesLongo = useMemo(() => {
    const chaves: string[] = []
    for (let i = MESES_RESUMO_LONGO - 1; i >= 0; i--) chaves.push(deslocarMes(mesAtual, -i))
    return chaves
  }, [mesAtual])
  const chavesCurto = useMemo(
    () => chavesLongo.slice(MESES_RESUMO_LONGO - MESES_TENDENCIA),
    [chavesLongo]
  )

  const transacoesDoMes = useMemo(() => porCompetencia.get(mesAtual) ?? [], [porCompetencia, mesAtual])

  const resultado = useMemo(
    () => calcular(transacoesDoMes, subcategoriaMap, contaTipoMap),
    [transacoesDoMes, subcategoriaMap, contaTipoMap]
  )

  const aportesDoMes = useMemo(
    () => calcularAportes(transacoesDoMes, contaTipoMap),
    [transacoesDoMes, contaTipoMap]
  )

  // Gráfico de tendência mensal — igual ao original: 6 meses, barras lado a lado
  const tendencia = useMemo(() => {
    return chavesCurto.map((chave) => {
      const doMes = porCompetencia.get(chave) ?? []
      const r = calcular(doMes, subcategoriaMap, contaTipoMap)
      const base = r.rendaLiquida
      return {
        mes: rotuloMesCurto(chave),
        [ROTULO_GRUPO.necessidade]: base > 0 ? Number(((r.buckets.necessidade / base) * 100).toFixed(1)) : 0,
        [ROTULO_GRUPO.desejo]: base > 0 ? Number(((r.buckets.desejo / base) * 100).toFixed(1)) : 0,
        [ROTULO_GRUPO.investimento]: base > 0 ? Number(((r.buckets.investimento / base) * 100).toFixed(1)) : 0,
      }
    })
  }, [chavesCurto, porCompetencia, subcategoriaMap, contaTipoMap])

  const totalGasto =
    resultado.buckets.necessidade + resultado.buckets.desejo + resultado.buckets.investimento + resultado.naoClassificado
  const sobra = resultado.rendaLiquida - totalGasto

  const detalheNecessidade = agruparPorSubcategoria(transacoesDoMes, 'necessidade', subcategoriaMap, 0)
  const detalheDesejo = agruparPorSubcategoria(transacoesDoMes, 'desejo', subcategoriaMap, 0)
  const detalheInvestimento = agruparPorSubcategoria(transacoesDoMes, 'investimento', subcategoriaMap, aportesDoMes)

  // Painel-resumo dos últimos 6 meses de competência
  const transacoes6Meses = useMemo(
    () => chavesCurto.flatMap((c) => porCompetencia.get(c) ?? []),
    [chavesCurto, porCompetencia]
  )
  const resultado6 = useMemo(
    () => calcular(transacoes6Meses, subcategoriaMap, contaTipoMap),
    [transacoes6Meses, subcategoriaMap, contaTipoMap]
  )
  const aportes6 = useMemo(() => calcularAportes(transacoes6Meses, contaTipoMap), [transacoes6Meses, contaTipoMap])
  const detalhe6: Record<Grupo, { nome: string; valor: number }[]> = {
    necessidade: agruparPorSubcategoria(transacoes6Meses, 'necessidade', subcategoriaMap, 0),
    desejo: agruparPorSubcategoria(transacoes6Meses, 'desejo', subcategoriaMap, 0),
    investimento: agruparPorSubcategoria(transacoes6Meses, 'investimento', subcategoriaMap, aportes6),
  }

  // Painel-resumo dos últimos 12 meses de competência
  const transacoes12Meses = useMemo(
    () => chavesLongo.flatMap((c) => porCompetencia.get(c) ?? []),
    [chavesLongo, porCompetencia]
  )
  const resultado12 = useMemo(
    () => calcular(transacoes12Meses, subcategoriaMap, contaTipoMap),
    [transacoes12Meses, subcategoriaMap, contaTipoMap]
  )
  const aportes12 = useMemo(
    () => calcularAportes(transacoes12Meses, contaTipoMap),
    [transacoes12Meses, contaTipoMap]
  )
  const detalhe12: Record<Grupo, { nome: string; valor: number }[]> = {
    necessidade: agruparPorSubcategoria(transacoes12Meses, 'necessidade', subcategoriaMap, 0),
    desejo: agruparPorSubcategoria(transacoes12Meses, 'desejo', subcategoriaMap, 0),
    investimento: agruparPorSubcategoria(transacoes12Meses, 'investimento', subcategoriaMap, aportes12),
  }

  if (carregando && transacoes.length === 0) {
    return (
      <Pagina>
        <p className="text-sm text-texto-suave">Carregando...</p>
      </Pagina>
    )
  }

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Calculadora 50/30/20"
        descricao="Essenciais, Qualidade de Vida e Futuro — sobre a renda líquida (já sem INSS/IRRF)"
      />

      {/* Quadro comparativo: modelo tradicional x nossa adaptação */}
      <section className="cartao mb-6 overflow-x-auto p-4">
        <h2 className="mb-3 text-sm font-semibold text-texto">Nosso modelo 50/30/20</h2>
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda text-left text-xs font-medium uppercase tracking-wide text-texto-suave">
              <th className="py-2 pr-3">Modelo tradicional</th>
              <th className="py-2 pr-3">Nossa adaptação</th>
              <th className="py-2 pr-3">Conceito</th>
              <th className="py-2">Pergunta norteadora</th>
            </tr>
          </thead>
          <tbody>
            {QUADRO_COMPARATIVO.map(({ grupo, tradicional }) => (
              <tr key={grupo} className="border-b border-borda last:border-0">
                <td className="py-2.5 pr-3 text-texto-suave">{tradicional}</td>
                <td className="py-2.5 pr-3 font-semibold" style={{ color: COR_GRUPO[grupo] }}>
                  {ROTULO_GRUPO[grupo]}
                </td>
                <td className="py-2.5 pr-3 text-texto">{CONCEITO_GRUPO[grupo]}</td>
                <td className="py-2.5 text-texto-suave italic">{PERGUNTA_GRUPO[grupo]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Seletor de mês + filtro de quem */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="cartao flex flex-1 items-center justify-between p-2">
          <button
            onClick={() => setMesAtual(deslocarMes(mesAtual, -1))}
            aria-label="Mês anterior"
            className="rounded-lg p-2 text-texto-suave transition-colors hover:bg-fundo"
          >
            <IconeSeta direcao="esquerda" />
          </button>
          <span className="text-sm font-semibold text-texto">{rotuloMesLongo(mesAtual)}</span>
          <button
            onClick={() => setMesAtual(deslocarMes(mesAtual, 1))}
            aria-label="Próximo mês"
            className="rounded-lg p-2 text-texto-suave transition-colors hover:bg-fundo"
          >
            <IconeSeta direcao="direita" />
          </button>
        </div>
        <div className="sm:w-64">
          <SeletorMultiplo
            rotulo="Quem"
            opcoes={opcoesQuem}
            selecionados={quemFiltro}
            onChange={setQuemFiltro}
            placeholder="Todos"
          />
        </div>
      </div>
      <p className="-mt-2 mb-6 text-[11px] text-texto-suave">
        Mês de competência, não calendário: o salário que cai no fim de um mês já conta como renda do mês
        seguinte, junto com os gastos dele.
      </p>

      {/* KPIs de renda */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="cartao p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">Renda líquida</p>
          <p className="mt-1 text-2xl font-bold text-texto">{moeda(resultado.rendaLiquida)}</p>
          <p className="mt-1 text-[11px] text-texto-suave">
            Bruta {moeda(resultado.rendaBruta)} − descontos obrigatórios {moeda(resultado.deducoes)}
          </p>
        </div>
        <div className="cartao p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">Total gasto/investido</p>
          <p className="mt-1 text-2xl font-bold text-texto">{moeda(totalGasto)}</p>
        </div>
        <div className="cartao p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">Sobra do mês</p>
          <p className={`mt-1 text-2xl font-bold ${sobra >= 0 ? 'text-receita' : 'text-despesa'}`}>
            {moeda(sobra)}
          </p>
        </div>
      </div>

      {/* As 3 barras */}
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <BarraProgresso grupo="necessidade" valor={resultado.buckets.necessidade} base={resultado.rendaLiquida} />
        <BarraProgresso grupo="desejo" valor={resultado.buckets.desejo} base={resultado.rendaLiquida} />
        <BarraProgresso grupo="investimento" valor={resultado.buckets.investimento} base={resultado.rendaLiquida} />
      </div>

      {/* Não classificado */}
      {resultado.naoClassificado > 0 && (
        <div className="mb-6 rounded-xl border border-alerta/30 bg-alerta/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-texto">Não classificado</p>
              <p className="text-xs text-texto-suave">
                Lançamentos sem categoria/subcategoria mapeada — não entram em nenhuma das 3 barras acima
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-texto">{moeda(resultado.naoClassificado)}</p>
              <Link href="/transacoes" className="text-xs font-medium text-primaria hover:underline">
                Ver lançamentos
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Detalhamento por grupo */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {(
          [
            ['necessidade', detalheNecessidade],
            ['desejo', detalheDesejo],
            ['investimento', detalheInvestimento],
          ] as const
        ).map(([grupo, itens]) => (
          <div key={grupo} className="cartao p-4">
            <h3 className="mb-3 text-sm font-semibold text-texto">{ROTULO_GRUPO[grupo]}</h3>
            {itens.length === 0 ? (
              <p className="text-xs text-texto-suave">Nenhum gasto neste período.</p>
            ) : (
              <ul className="space-y-1.5">
                {itens.slice(0, 8).map((item) => (
                  <li key={item.nome} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-texto-suave">{item.nome}</span>
                    <span className="shrink-0 font-medium text-texto">{moeda(item.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Tendência dos últimos meses */}
      <section className="mb-6 cartao p-4">
        <h2 className="mb-3 text-sm font-semibold text-texto">
          Evolução — % da renda líquida (últimos {MESES_TENDENCIA} meses)
        </h2>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tendencia} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit="%" />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={50} stroke={COR_GRUPO.necessidade} strokeDasharray="4 4" />
              <ReferenceLine y={30} stroke={COR_GRUPO.desejo} strokeDasharray="4 4" />
              <ReferenceLine y={20} stroke={COR_GRUPO.investimento} strokeDasharray="4 4" />
              <Bar dataKey={ROTULO_GRUPO.necessidade} fill={COR_GRUPO.necessidade} radius={[4, 4, 0, 0]} />
              <Bar dataKey={ROTULO_GRUPO.desejo} fill={COR_GRUPO.desejo} radius={[4, 4, 0, 0]} />
              <Bar dataKey={ROTULO_GRUPO.investimento} fill={COR_GRUPO.investimento} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] text-texto-suave">
          Linhas tracejadas mostram a meta de cada grupo (50% / 30% / 20%).
        </p>
      </section>

      {/* Dashboards-resumo: 6 e 12 meses agregados */}
      <div className="space-y-6">
        <PainelResumoPeriodo
          titulo={`Resumo dos últimos ${MESES_TENDENCIA} meses`}
          resultado={resultado6}
          detalhe={detalhe6}
        />
        <PainelResumoPeriodo
          titulo={`Resumo dos últimos ${MESES_RESUMO_LONGO} meses`}
          resultado={resultado12}
          detalhe={detalhe12}
        />
      </div>
    </Pagina>
  )
}
