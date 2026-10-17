'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  IconeBanco,
  IconeBroto,
  IconeCamadas,
  IconeCarro,
  IconeCartao,
  IconeChama,
  IconeDivida,
  IconeDocumento,
  IconeEtiqueta,
  IconeFatura,
  IconeFechar,
  IconeGrafico,
  IconeImovel,
  IconeImportar,
  IconeInicio,
  IconeLista,
  IconeMais,
  IconeMenu,
  IconePercentual,
  IconeRelogio,
  IconeSair,
  IconeSofa,
  IconeTendencia,
  IconeTransferir,
} from './Icones'
import SeletorTema from './SeletorTema'

type ItemNav = {
  rota: string
  rotulo: string
  Icone: ({ className }: { className?: string }) => React.ReactElement
}

type GrupoNav = { titulo: string; itens: ItemNav[] }

const INICIO: ItemNav = { rota: '/', rotulo: 'Início', Icone: IconeInicio }
const LANCAMENTOS: ItemNav = { rota: '/transacoes', rotulo: 'Lançamentos', Icone: IconeLista }
const A_PAGAR: ItemNav = { rota: '/contas-pagar', rotulo: 'A pagar', Icone: IconeRelogio }

// Cada tela tem um ícone só dela, e o nome diz o que a tela mostra
const GRUPOS_NAV: GrupoNav[] = [
  {
    titulo: 'Dia a dia',
    itens: [
      INICIO,
      LANCAMENTOS,
      A_PAGAR,
      { rota: '/faturas', rotulo: 'Faturas do cartão', Icone: IconeFatura },
      { rota: '/transferencias', rotulo: 'Transferências', Icone: IconeTransferir },
      { rota: '/extrato', rotulo: 'Extrato', Icone: IconeDocumento },
    ],
  },
  {
    titulo: 'Planejar',
    itens: [
      { rota: '/dashboard', rotulo: 'Relatórios', Icone: IconeGrafico },
      { rota: '/previsao', rotulo: 'Previsão', Icone: IconeTendencia },
      { rota: '/calculadora-50-30-20', rotulo: 'Calculadora 50/30/20', Icone: IconePercentual },
    ],
  },
  {
    titulo: 'Patrimônio',
    itens: [
      // /patrimonio soma tudo o que a família tem; /investimentos são as aplicações
      { rota: '/patrimonio', rotulo: 'Patrimônio', Icone: IconeCamadas },
      { rota: '/investimentos', rotulo: 'Investimentos', Icone: IconeBroto },
      { rota: '/imoveis', rotulo: 'Imóveis', Icone: IconeImovel },
      { rota: '/bens', rotulo: 'Bens e móveis', Icone: IconeSofa },
      { rota: '/dividas', rotulo: 'Dívidas', Icone: IconeDivida },
    ],
  },
  {
    titulo: 'Casa e carro',
    itens: [
      { rota: '/veiculos', rotulo: 'Veículos', Icone: IconeCarro },
      { rota: '/gas', rotulo: 'Chuveiro a gás', Icone: IconeChama },
    ],
  },
  {
    titulo: 'Ajustes',
    itens: [
      { rota: '/contas', rotulo: 'Contas', Icone: IconeBanco },
      { rota: '/cartoes', rotulo: 'Cartões', Icone: IconeCartao },
      { rota: '/categorias', rotulo: 'Categorias', Icone: IconeEtiqueta },
      { rota: '/importar', rotulo: 'Importar', Icone: IconeImportar },
    ],
  },
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

  // Fecha o menu do celular com a tecla Esc
  useEffect(() => {
    if (!menuAberto) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuAberto(false)
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [menuAberto])

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

  // "/contas" não pode acender junto com "/contas-pagar"
  const ativo = (rota: string) =>
    rota === '/' ? pathname === '/' : pathname === rota || pathname.startsWith(`${rota}/`)

  const classeItemLateral = (rota: string) =>
    `flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
      ativo(rota)
        ? 'bg-primaria/10 font-semibold text-primaria'
        : 'text-texto hover:bg-fundo'
    }`

  const classeAbaInferior = (selecionada: boolean) =>
    `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[12px] font-medium ${
      selecionada ? 'text-primaria' : 'text-texto-suave'
    }`

  return (
    <div className="min-h-screen bg-fundo">
      {/* ---------- Menu lateral (desktop) ---------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-borda bg-superficie lg:flex">
        <div className="px-6 py-6">
          <Link href="/" className="text-lg font-extrabold tracking-tight text-primaria">
            Finanças da Família
          </Link>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {GRUPOS_NAV.map((grupo) => (
            <div key={grupo.titulo}>
              <p className="px-3 pb-1 text-xs font-semibold text-texto-suave">{grupo.titulo}</p>
              <div className="space-y-0.5">
                {grupo.itens.map(({ rota, rotulo, Icone }) => (
                  <Link key={rota} href={rota} className={classeItemLateral(rota)}>
                    <Icone className="h-5 w-5 shrink-0" />
                    {rotulo}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-borda p-3">
          <div className="mb-3">
            <p className="mb-1.5 px-1 text-xs font-semibold text-texto-suave">Aparência</p>
            <SeletorTema />
          </div>
          <Link
            href="/lancamentos"
            className="mb-2 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primaria px-3 text-sm font-semibold text-sobre-cor transition-colors hover:bg-primaria-escura"
          >
            <IconeMais className="h-4 w-4" />
            Novo lançamento
          </Link>
          <div className="flex items-center justify-between gap-2 pl-2">
            <span className="truncate text-sm text-texto-suave">{nome}</span>
            <button
              onClick={sair}
              aria-label="Sair"
              title="Sair"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-texto-suave transition-colors hover:bg-fundo hover:text-texto"
            >
              <IconeSair className="h-5 w-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ---------- Barra superior (mobile) ---------- */}
      <header className="sticky top-0 z-20 flex min-h-13 items-center border-b border-borda bg-superficie px-4 lg:hidden">
        <Link
          href="/"
          onClick={() => setMenuAberto(false)}
          className="text-base font-extrabold tracking-tight text-primaria"
        >
          Finanças da Família
        </Link>
      </header>

      {/* ---------- Menu (mobile): tela inteira, entre a barra de cima e a de baixo ---------- */}
      {menuAberto && (
        <div
          className="fixed inset-0 z-10 overflow-y-auto bg-fundo px-4 pt-17 pb-28 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-texto">Menu</h1>
            <button
              onClick={() => setMenuAberto(false)}
              aria-label="Fechar menu"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-borda bg-superficie text-texto"
            >
              <IconeFechar />
            </button>
          </div>

          <div className="space-y-5">
            {GRUPOS_NAV.map((grupo) => (
              <section key={grupo.titulo}>
                <h2 className="mb-1.5 px-1 text-sm font-semibold text-texto-suave">{grupo.titulo}</h2>
                <ul className="divide-y divide-borda rounded-xl border border-borda bg-superficie px-3">
                  {grupo.itens.map(({ rota, rotulo, Icone }) => (
                    <li key={rota}>
                      <Link
                        href={rota}
                        onClick={() => setMenuAberto(false)}
                        className={`flex min-h-13 items-center gap-3 text-[15px] ${
                          ativo(rota) ? 'font-semibold text-primaria' : 'font-medium text-texto'
                        }`}
                      >
                        <Icone className="h-5 w-5 shrink-0 text-primaria" />
                        {rotulo}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <section>
              <h2 className="mb-1.5 px-1 text-sm font-semibold text-texto-suave">Aparência</h2>
              <div className="rounded-xl border border-borda bg-superficie p-3">
                <SeletorTema />
                <p className="mt-2 px-1 text-sm text-texto-suave">
                  Automático segue o modo do celular ou do computador.
                </p>
              </div>
            </section>

            <section>
              <ul className="divide-y divide-borda rounded-xl border border-borda bg-superficie px-3">
                {nome && (
                  <li className="flex min-h-13 items-center text-[15px] text-texto-suave">
                    Conectado como {nome}
                  </li>
                )}
                <li>
                  <button
                    onClick={sair}
                    className="flex min-h-13 w-full items-center gap-3 text-[15px] font-medium text-texto"
                  >
                    <IconeSair className="h-5 w-5 shrink-0 text-primaria" />
                    Sair
                  </button>
                </li>
              </ul>
            </section>
          </div>
        </div>
      )}

      {/* ---------- Conteúdo ---------- */}
      <main className="pb-24 lg:ml-64 lg:pb-0">{children}</main>

      {/* ---------- Barra inferior (mobile) ---------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-borda bg-superficie pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Navegação principal"
      >
        {[INICIO, LANCAMENTOS].map(({ rota, rotulo, Icone }) => (
          <Link
            key={rota}
            href={rota}
            onClick={() => setMenuAberto(false)}
            className={classeAbaInferior(!menuAberto && ativo(rota))}
          >
            <Icone className="h-6 w-6" />
            {rotulo}
          </Link>
        ))}

        <Link
          href="/lancamentos"
          onClick={() => setMenuAberto(false)}
          aria-label="Novo lançamento"
          className="flex min-h-14 flex-1 flex-col items-center justify-end gap-0.5 pb-1.5 text-[12px] font-semibold text-texto"
        >
          <span className="-mt-6 flex h-13 w-13 items-center justify-center rounded-full border-4 border-superficie bg-primaria text-sobre-cor">
            <IconeMais className="h-6 w-6" />
          </span>
          Lançar
        </Link>

        <Link
          href={A_PAGAR.rota}
          onClick={() => setMenuAberto(false)}
          className={classeAbaInferior(!menuAberto && ativo(A_PAGAR.rota))}
        >
          <A_PAGAR.Icone className="h-6 w-6" />
          {A_PAGAR.rotulo}
        </Link>

        <button
          onClick={() => setMenuAberto((aberto) => !aberto)}
          aria-expanded={menuAberto}
          className={classeAbaInferior(menuAberto)}
        >
          <IconeMenu className="h-6 w-6" />
          Menu
        </button>
      </nav>
    </div>
  )
}
