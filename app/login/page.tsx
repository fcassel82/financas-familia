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
    <div className="flex min-h-screen items-center justify-center bg-fundo px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-primaria">Finanças da Família</h1>
          <p className="mt-2 text-base text-texto-suave">Entre para acessar suas contas</p>
        </div>

        <form onSubmit={handleSubmit} className="cartao p-6">
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
            className="min-h-12 w-full rounded-lg bg-primaria text-base font-semibold text-sobre-cor transition-colors hover:bg-primaria-escura disabled:opacity-50"
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
