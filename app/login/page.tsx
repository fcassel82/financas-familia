'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { classeInput } from '@/components/ui'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setCarregando(false)

    if (error) {
      setErro('E-mail ou senha incorretos.')
      return
    }

    router.replace('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-marinho px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-white">
            Finanças <span className="text-primaria">da Família</span>
          </h1>
          <p className="mt-1 text-sm text-white/60">Entre para acessar suas contas</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl bg-superficie p-6 shadow-xl">
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-texto">E-mail</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={classeInput}
              required
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-texto">Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={classeInput}
              required
            />
          </label>

          {erro && <p className="mb-4 text-sm text-despesa">{erro}</p>}

          <button
            type="submit"
            disabled={carregando}
            className="w-full rounded-lg bg-primaria py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaria-escura disabled:opacity-50"
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
