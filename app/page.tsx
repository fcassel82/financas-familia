'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { chaveMes, dataBR, hojeISO, limitesDoMes, moeda, rotuloMesLongo } from '@/lib/formato'
import { IconeBanco, IconeGrafico, IconeMais } from '@/components/Icones'
import { EstadoVazio, Pagina } from '@/components/ui'

type Movimento = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  categorias: { nome: string } | null
  contas: { nome: string; cor: string | null } | null
}

type Conta = { id: string; nome: string; cor: string | null; saldo_inicial: number }

export default function InicioPage() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [nome, setNome] = useState('')
  const [contas, setContas] = useState<Conta[]>([])
  const [saldos, setSaldos] = useState<Record<string, number>>({})
  const [doMes, setDoMes] = useState<Movimento[]>([])

  const hoje = hojeISO()
  const mesAtual = chaveMes(new Date())

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

      const { inicio, fim } = limitesDoMes(mesAtual)

      const [{ data: contasData }, { data: todosMovimentos }, { data: movimentosMes }] =
        await Promise.all([
          supabase.from('contas').select('id, nome, cor, saldo_inicial').order('nome'),
          supabase.from('transacoes').select('conta_id, valor, tipo'),
          supabase
            .from('transacoes')
            .select('id, data, descricao, valor, tipo, categorias(nome), contas(nome, cor)')
            .gte('data', inicio)
            .lte('data', fim)
            .order('data', { ascending: false }),
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
      setCarregando(false)
    }
    carregar()
  }, [router, mesAtual])

  const saldoEmContas = contas.reduce((soma, c) => soma + (saldos[c.id] ?? 0), 0)
  const receitasMes = doMes
    .filter((m) => m.tipo === 'receita')
    .reduce((s, m) => s + Number(m.valor), 0)
  const despesasMes = doMes
    .filter((m) => m.tipo === 'despesa')
    .reduce((s, m) => s + Number(m.valor), 0)
  const resultadoMes = receitasMes - despesasMes

  const lancamentosDeHoje = doMes.filter((m) => m.data === hoje)
  const ultimos = doMes.slice(0, 8)

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
      {/* Saudação */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-texto sm:text-2xl">
          Olá{nome ? `, ${nome}` : ''}
        </h1>
        <p className="mt-1 text-sm text-texto-suave first-letter:uppercase">{dataExtenso}</p>
      </div>

      {/* Cartões de resumo */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="cartao p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">
            Saldo em contas
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${saldoEmContas >= 0 ? 'text-texto' : 'text-despesa'}`}
          >
            {moeda(saldoEmContas)}
          </p>
        </div>

        <div className="cartao p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">
            Receitas do mês
          </p>
          <p className="mt-1 text-2xl font-bold text-receita">{moeda(receitasMes)}</p>
        </div>

        <div className="cartao p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">
            Despesas do mês
          </p>
          <p className="mt-1 text-2xl font-bold text-despesa">{moeda(despesasMes)}</p>
        </div>

        <div className="cartao p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">
            Resultado do mês
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${resultadoMes >= 0 ? 'text-receita' : 'text-despesa'}`}
          >
            {moeda(resultadoMes)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna principal */}
        <div className="space-y-6 lg:col-span-2">
          {/* Hoje */}
          <section className="cartao p-4">
            <h2 className="mb-3 text-sm font-semibold text-texto">Lançamentos de hoje</h2>
            {lancamentosDeHoje.length === 0 ? (
              <p className="py-6 text-center text-sm text-texto-suave">
                Nenhum lançamento hoje.
              </p>
            ) : (
              <ul className="divide-y divide-borda">
                {lancamentosDeHoje.map((m) => (
                  <ItemMovimento key={m.id} movimento={m} />
                ))}
              </ul>
            )}
          </section>

          {/* Últimos do mês */}
          <section className="cartao p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-texto">
                Últimos lançamentos · {rotuloMesLongo(mesAtual)}
              </h2>
              <Link href="/transacoes" className="text-xs font-medium text-primaria hover:underline">
                Ver todos
              </Link>
            </div>

            {ultimos.length === 0 ? (
              <EstadoVazio
                titulo="Nenhum lançamento este mês"
                descricao="Comece registrando um gasto ou importando o extrato do banco."
                acao={
                  <Link
                    href="/lancamentos"
                    className="inline-flex items-center gap-2 rounded-lg bg-primaria px-4 py-2.5 text-sm font-semibold text-white hover:bg-primaria-escura"
                  >
                    <IconeMais className="h-4 w-4" />
                    Novo lançamento
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-borda">
                {ultimos.map((m) => (
                  <ItemMovimento key={m.id} movimento={m} mostrarData />
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-6">
          <section className="cartao p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-texto">Saldo por conta</h2>
              <Link href="/contas" className="text-xs font-medium text-primaria hover:underline">
                Gerenciar
              </Link>
            </div>

            {contas.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-texto-suave">Nenhuma conta cadastrada.</p>
                <Link
                  href="/contas"
                  className="mt-2 inline-block text-sm font-medium text-primaria hover:underline"
                >
                  Cadastrar conta
                </Link>
              </div>
            ) : (
              <ul className="space-y-2">
                {contas.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white"
                        style={{ backgroundColor: c.cor ?? '#2a78d6' }}
                      >
                        <IconeBanco className="h-3.5 w-3.5" />
                      </span>
                      <span className="truncate text-sm text-texto">{c.nome}</span>
                    </span>
                    <span
                      className={`whitespace-nowrap text-sm font-semibold ${
                        (saldos[c.id] ?? 0) >= 0 ? 'text-texto' : 'text-despesa'
                      }`}
                    >
                      {moeda(saldos[c.id] ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cartao p-4">
            <h2 className="mb-3 text-sm font-semibold text-texto">Atalhos</h2>
            <div className="space-y-2">
              <Link
                href="/lancamentos"
                className="flex items-center gap-3 rounded-lg border border-borda px-3 py-2.5 text-sm text-texto transition-colors hover:bg-fundo"
              >
                <IconeMais className="h-4 w-4 text-primaria" />
                Novo lançamento
              </Link>
              <Link
                href="/importar"
                className="flex items-center gap-3 rounded-lg border border-borda px-3 py-2.5 text-sm text-texto transition-colors hover:bg-fundo"
              >
                <IconeBanco className="h-4 w-4 text-primaria" />
                Importar extrato
              </Link>
              <Link
                href="/dashboard"
                className="flex items-center gap-3 rounded-lg border border-borda px-3 py-2.5 text-sm text-texto transition-colors hover:bg-fundo"
              >
                <IconeGrafico className="h-4 w-4 text-primaria" />
                Ver relatórios
              </Link>
            </div>
          </section>
        </div>
      </div>
    </Pagina>
  )
}

function ItemMovimento({
  movimento,
  mostrarData = false,
}: {
  movimento: Movimento
  mostrarData?: boolean
}) {
  const receita = movimento.tipo === 'receita'
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-texto">{movimento.descricao}</p>
        <p className="truncate text-xs text-texto-suave">
          {mostrarData ? `${dataBR(movimento.data)} · ` : ''}
          {movimento.categorias?.nome ?? 'Sem categoria'}
          {movimento.contas?.nome ? ` · ${movimento.contas.nome}` : ''}
        </p>
      </div>
      <span
        className={`shrink-0 whitespace-nowrap text-sm font-semibold ${
          receita ? 'text-receita' : 'text-despesa'
        }`}
      >
        {receita ? '+' : '−'} {moeda(movimento.valor)}
      </span>
    </li>
  )
}
