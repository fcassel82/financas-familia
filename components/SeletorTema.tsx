'use client'

import { useState } from 'react'
import { escolherTema, lerTema, type Tema } from '@/lib/tema'
import { IconeAutomatico, IconeLua, IconeSol } from './Icones'

const OPCOES: { tema: Tema; rotulo: string; Icone: typeof IconeSol }[] = [
  { tema: 'claro', rotulo: 'Claro', Icone: IconeSol },
  { tema: 'escuro', rotulo: 'Escuro', Icone: IconeLua },
  { tema: 'sistema', rotulo: 'Automático', Icone: IconeAutomatico },
]

/**
 * Escolha entre claro, escuro e automático. Só aparece depois do login
 * (o AppShell não renderiza o menu no servidor), então ler o localStorage
 * direto no useState não causa diferença de hidratação.
 */
export default function SeletorTema() {
  const [tema, setTema] = useState<Tema>(() => lerTema())

  function selecionar(novo: Tema) {
    setTema(novo)
    escolherTema(novo)
  }

  return (
    <div
      role="radiogroup"
      aria-label="Aparência"
      className="grid grid-cols-3 gap-1 rounded-xl border border-borda bg-fundo p-1"
    >
      {OPCOES.map(({ tema: opcao, rotulo, Icone }) => {
        const selecionada = tema === opcao
        return (
          <button
            key={opcao}
            type="button"
            role="radio"
            aria-checked={selecionada}
            onClick={() => selecionar(opcao)}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[13px] transition-colors ${
              selecionada
                ? 'border border-borda bg-superficie font-semibold text-primaria shadow-sm'
                : 'border border-transparent font-medium text-texto-suave hover:text-texto'
            }`}
          >
            <Icone className="h-5 w-5" />
            {rotulo}
          </button>
        )
      })}
    </div>
  )
}
