'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import type { User } from '@supabase/supabase-js'

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [carregando, setCarregando] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function checkUser() {
      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        router.push('/login')
      } else {
        setUser(data.user)
      }
      setCarregando(false)
    }
    checkUser()
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <h1 className="mb-2 text-2xl font-semibold text-gray-800">
        Bem-vindo(a), {user?.email}
      </h1>
      <p className="mb-6 text-gray-500">Finanças da Família</p>
      <button
        onClick={handleLogout}
        className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
      >
        Sair
      </button>
    </div>
  )
}
