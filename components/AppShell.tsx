'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  IconeAlerta,
  IconeBanco,
  IconeCarro,
  IconeCartao,
  IconeChama,
  IconeCofre,
  IconeEtiqueta,
  IconeFechar,
  IconeGrafico,
  IconeImportar,
  IconeInicio,
  IconeLista,
  IconeMais,
  IconeMenu,
  IconeSair,
  IconeSeta,
  IconeSofa,
} from './Icones'

type ItemNav = {
  rota: string
  rotulo: string
  Icone: ({ className }: { className?: string }) => React.ReactElement
}

const NAV_PRINCIPAL: ItemNav[] = [
  { rota: '/', rotulo: 'Início', Icone: IconeInicio },
  { rota: '/transacoes', rotulo: 'Lançamentos', Icone: IconeLista },
  { rota: '/contas-pagar', rotulo: 'A Pagar', Icone: IconeAlerta },
  { rota: '/dashboard', rotulo: 'Relatórios', Icone: IconeGrafico },
  { rota: '/importar', rotulo: 'Importar', Icone: IconeImportar },
]

const NAV_ANALISE: ItemNav[] = [
  { rota: '/previsao', rotulo: 'Previsão', Icone: IconeCofre },
  { rota: '/extrato', rotulo: 'Extrato', Icone: IconeLista },
  { rota: '/faturas', rotulo: 'Faturas', Icone: IconeCartao },
  { rota: '/transferencias', rotulo: 'Transferências', Icone: IconeSeta },
]

const NAV_PATRIMONIO: ItemNav[] = [
  { rota: '/bens', rotulo: 'Bens e Móveis', Icone: IconeSofa },
  { rota: '/veiculos', rotulo: 'Veículos', Icone: IconeCarro },
  { rota: '/gas', rotulo: 'Chuveiro a Gás', Icone: IconeChama },
]

const NAV_CADASTROS: ItemNav[] = [
  { rota: '/contas', rotulo: 'Contas', Icone: IconeBanco },
  { rota: '/cartoes', rotulo: 'Cartões', Icone: IconeCartao },
  { rota: '/categorias', rotulo: 'Categorias', Icone: IconeEtiqueta },
  { rota: '/investimentos', rotulo: 'Investimentos', Icone: IconeCofre },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuAberto, setMenuAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [sessaoOk, setSessaoOk] = useState<boolean | null>(null)

  const naTelaDeLogin = pathname === '/login'

  useEffect(() => {
    if (naTelaDeLogin) return

    async function verificarSessao() {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setSessaoOk(false)
        router.replace('/login')
        return
      }
      setSessaoOk(true)

      const { data: perfil } = await supabase
        .from('perfis')
        .select('nome')
        .eq('id', data.session.user.id)
        .single()
      setNome(perfil?.nome ?? data.session.user.email ?? '')
    }
    verificarSessao()

    // Sessão do Supabase expira em ~1h. Sem isto, o app continuaria renderizando
    // telas vazias (R$ 0,00) em vez de pedir login de novo.
    const { data: assinatura } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'SIGNED_OUT' || !sessao) {
        setSessaoOk(false)
        router.replace('/login')
      }
    })

    return () => assinatura.subscription.unsubscribe()
  }, [naTelaDeLogin, router])

  async function sair() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (naTelaDeLogin) {
    return <>{children}</>
  }

  // Evita piscar telas vazias enquanto a sessão é verificada
  if (sessaoOk !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fundo">
        <p className="text-sm text-texto-suave">Carregando...</p>
      </div>
    )
  }

  const ativo = (rota: string) => (rota === '/' ? pathname === '/' : pathname.startsWith(rota))

  const classeItemLateral = (rota: string) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
      ativo(rota)
        ? 'bg-white/12 font-semibold text-white'
        : 'text-white/70 hover:bg-white/8 hover:text-white'
    }`

  return (
    <div className="min-h-screen bg-fundo">
      {/* ---------- Menu lateral (desktop) ---------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-marinho lg:flex">
        <div className="px-5 py-6">
          <Link href="/" className="text-lg font-semibold text-white">
            Finanças <span className="text-primaria">da Família</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {NAV_PRINCIPAL.map(({ rota, rotulo, Icone }) => (
            <Link key={rota} href={rota} className={classeItemLateral(rota)}>
              <Icone className="h-5 w-5 shrink-0" />
              {rotulo}
            </Link>
          ))}

          <p className="px-3 pt-5 pb-1 text-xs font-medium uppercase tracking-wider text-white/40">
            Análise
          </p>
          {NAV_ANALISE.map(({ rota, rotulo, Icone }) => (
            <Link key={rota} href={rota} className={classeItemLateral(rota)}>
              <Icone className="h-5 w-5 shrink-0" />
              {rotulo}
            </Link>
          ))}

          <p className="px-3 pt-5 pb-1 text-xs font-medium uppercase tracking-wider text-white/40">
            Casa e Bens
          </p>
          {NAV_PATRIMONIO.map(({ rota, rotulo, Icone }) => (
            <Link key={rota} href={rota} className={classeItemLateral(rota)}>
              <Icone className="h-5 w-5 shrink-0" />
              {rotulo}
            </Link>
          ))}

          <p className="px-3 pt-5 pb-1 text-xs font-medium uppercase tracking-wider text-white/40">
            Cadastros
          </p>
          {NAV_CADASTROS.map(({ rota, rotulo, Icone }) => (
            <Link key={rota} href={rota} className={classeItemLateral(rota)}>
              <Icone className="h-5 w-5 shrink-0" />
              {rotulo}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <Link
            href="/lancamentos"
            className="mb-2 flex items-center justify-center gap-2 rounded-lg bg-primaria px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaria-escura"
          >
            <IconeMais className="h-4 w-4" />
            Novo lançamento
          </Link>
          <div className="flex items-center justify-between px-2 py-1">
            <span className="truncate text-xs text-white/60">{nome}</span>
            <button
              onClick={sair}
              aria-label="Sair"
              title="Sair"
              className="rounded p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <IconeSair className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ---------- Barra superior (mobile) ---------- */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-borda bg-superficie px-4 py-3 lg:hidden">
        <Link href="/" className="text-base font-semibold text-texto">
          Finanças <span className="text-primaria">da Família</span>
        </Link>
        <button
          onClick={() => setMenuAberto(true)}
          aria-label="Abrir menu"
          className="rounded-lg p-1.5 text-texto-suave hover:bg-fundo"
        >
          <IconeMenu />
        </button>
      </header>

      {/* ---------- Menu deslizante (mobile) ---------- */}
      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Fechar menu"
            onClick={() => setMenuAberto(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col bg-marinho">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-sm font-semibold text-white">{nome}</span>
              <button
                onClick={() => setMenuAberto(false)}
                aria-label="Fechar menu"
                className="rounded p-1.5 text-white/70 hover:bg-white/10"
              >
                <IconeFechar />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3">
              {NAV_PRINCIPAL.map(({ rota, rotulo, Icone }) => (
                <Link
                  key={rota}
                  href={rota}
                  onClick={() => setMenuAberto(false)}
                  className={classeItemLateral(rota)}
                >
                  <Icone className="h-5 w-5 shrink-0" />
                  {rotulo}
                </Link>
              ))}
              <p className="px-3 pt-5 pb-1 text-xs font-medium uppercase tracking-wider text-white/40">
                Análise
              </p>
              {NAV_ANALISE.map(({ rota, rotulo, Icone }) => (
                <Link
                  key={rota}
                  href={rota}
                  onClick={() => setMenuAberto(false)}
                  className={classeItemLateral(rota)}
                >
                  <Icone className="h-5 w-5 shrink-0" />
                  {rotulo}
                </Link>
              ))}
              <p className="px-3 pt-5 pb-1 text-xs font-medium uppercase tracking-wider text-white/40">
                Casa e Bens
              </p>
              {NAV_PATRIMONIO.map(({ rota, rotulo, Icone }) => (
                <Link
                  key={rota}
                  href={rota}
                  onClick={() => setMenuAberto(false)}
                  className={classeItemLateral(rota)}
                >
                  <Icone className="h-5 w-5 shrink-0" />
                  {rotulo}
                </Link>
              ))}
              <p className="px-3 pt-5 pb-1 text-xs font-medium uppercase tracking-wider text-white/40">
                Cadastros
              </p>
              {NAV_CADASTROS.map(({ rota, rotulo, Icone }) => (
                <Link
                  key={rota}
                  href={rota}
                  onClick={() => setMenuAberto(false)}
                  className={classeItemLateral(rota)}
                >
                  <Icone className="h-5 w-5 shrink-0" />
                  {rotulo}
                </Link>
              ))}
            </nav>

            <div className="border-t border-white/10 p-3">
              <button
                onClick={sair}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 hover:bg-white/10 hover:text-white"
              >
                <IconeSair className="h-5 w-5" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Conteúdo ---------- */}
      <main className="pb-24 lg:ml-60 lg:pb-0">{children}</main>

      {/* ---------- Barra inferior (mobile) ---------- */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-borda bg-superficie lg:hidden">
        {NAV_PRINCIPAL.slice(0, 2).map(({ rota, rotulo, Icone }) => (
          <Link
            key={rota}
            href={rota}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${
              ativo(rota) ? 'text-primaria' : 'text-texto-suave'
            }`}
          >
            <Icone className="h-5 w-5" />
            {rotulo}
          </Link>
        ))}

        <div className="flex flex-1 justify-center">
          <Link
            href="/lancamentos"
            aria-label="Novo lançamento"
            className="-mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-primaria text-white shadow-lg shadow-primaria/30"
          >
            <IconeMais className="h-6 w-6" />
          </Link>
        </div>

        {NAV_PRINCIPAL.slice(2, 4).map(({ rota, rotulo, Icone }) => (
          <Link
            key={rota}
            href={rota}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${
              ativo(rota) ? 'text-primaria' : 'text-texto-suave'
            }`}
          >
            <Icone className="h-5 w-5" />
            {rotulo}
          </Link>
        ))}
      </nav>
    </div>
  )
}
