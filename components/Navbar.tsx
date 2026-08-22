'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()

  if (pathname === '/login') {
    return null
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const linkClasse = (rota: string) =>
    `text-sm ${pathname === rota ? 'font-semibold text-blue-600' : 'text-gray-600 hover:text-gray-900'}`

  return (
    <nav className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-semibold text-gray-800">
          Finanças da Família
        </Link>
        <Link href="/dashboard" className={linkClasse('/dashboard')}>
          Dashboard
        </Link>
        <Link href="/transacoes" className={linkClasse('/transacoes')}>
          Lançamentos
        </Link>
        <Link href="/lancamentos" className={linkClasse('/lancamentos')}>
          + Novo
        </Link>
        <Link href="/importar" className={linkClasse('/importar')}>
          Importar
        </Link>
      </div>
      <button
        onClick={handleLogout}
        className="text-sm text-red-600 hover:text-red-700"
      >
        Sair
      </button>
    </nav>
  )
}
