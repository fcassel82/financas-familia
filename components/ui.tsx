'use client'

import { useEffect, useRef, useState } from 'react'
import { IconeFechar } from './Icones'

export function CabecalhoPagina({
  titulo,
  descricao,
  acao,
}: {
  titulo: string
  descricao?: string
  acao?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-texto sm:text-2xl">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-texto-suave">{descricao}</p>}
      </div>
      {acao}
    </div>
  )
}

export function Pagina({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
}

export function BotaoPrimario({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-primaria px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaria-escura disabled:opacity-50 ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function BotaoSecundario({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-borda bg-superficie px-4 py-2.5 text-sm font-medium text-texto transition-colors hover:bg-fundo disabled:opacity-50 ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function Campo({
  rotulo,
  children,
  className = '',
}: {
  rotulo: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-texto">{rotulo}</span>
      {children}
    </label>
  )
}

export const classeInput =
  'w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm text-texto outline-none focus:border-primaria focus:ring-3 focus:ring-primaria/12'

export function Modal({
  aberto,
  titulo,
  onFechar,
  children,
}: {
  aberto: boolean
  titulo: string
  onFechar: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!aberto) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberto, onFechar])

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="Fechar"
        onClick={onFechar}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-superficie p-5 shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-texto">{titulo}</h2>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded p-1.5 text-texto-suave hover:bg-fundo"
          >
            <IconeFechar />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Mensagem({ texto }: { texto: string }) {
  if (!texto) return null
  const erro = /^(erro|não|nenhum)/i.test(texto)
  return (
    <p className={`text-sm ${erro ? 'text-despesa' : 'text-receita'}`}>{texto}</p>
  )
}

/**
 * Dropdown de seleção múltipla via checkboxes (ex.: filtrar por várias
 * categorias ao mesmo tempo). Fecha ao clicar fora, sem depender de nenhuma
 * lib externa.
 */
export function SeletorMultiplo({
  rotulo,
  opcoes,
  selecionados,
  onChange,
  placeholder = 'Todas',
}: {
  rotulo: string
  opcoes: { id: string; nome: string }[]
  selecionados: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
}) {
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  function alternar(id: string) {
    onChange(
      selecionados.includes(id) ? selecionados.filter((s) => s !== id) : [...selecionados, id]
    )
  }

  const rotuloBotao =
    selecionados.length === 0
      ? placeholder
      : selecionados.length === 1
        ? (opcoes.find((o) => o.id === selecionados[0])?.nome ?? '1 selecionada')
        : `${selecionados.length} selecionadas`

  return (
    <div ref={containerRef} className="relative">
      <p className="mb-1.5 text-xs font-medium text-texto-suave">{rotulo}</p>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={`${classeInput} flex items-center justify-between gap-2 text-left`}
      >
        <span className="truncate">{rotuloBotao}</span>
        <span className="shrink-0 text-texto-suave">{aberto ? '▴' : '▾'}</span>
      </button>

      {aberto && (
        <div className="absolute z-20 mt-1 max-h-64 w-full min-w-[220px] overflow-y-auto rounded-lg border border-borda bg-superficie p-2 shadow-lg">
          {selecionados.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mb-1 block px-2 py-1 text-xs font-medium text-primaria hover:underline"
            >
              Limpar seleção
            </button>
          )}
          {opcoes.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-texto-suave">Nenhuma opção</p>
          ) : (
            opcoes.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-texto hover:bg-fundo"
              >
                <input
                  type="checkbox"
                  checked={selecionados.includes(o.id)}
                  onChange={() => alternar(o.id)}
                />
                <span className="truncate">{o.nome}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function EstadoVazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string
  descricao?: string
  acao?: React.ReactNode
}) {
  return (
    <div className="cartao px-6 py-12 text-center">
      <p className="font-medium text-texto">{titulo}</p>
      {descricao && <p className="mx-auto mt-1 max-w-sm text-sm text-texto-suave">{descricao}</p>}
      {acao && <div className="mt-4 flex justify-center">{acao}</div>}
    </div>
  )
}
