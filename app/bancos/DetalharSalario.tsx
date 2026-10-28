'use client'

import { useState } from 'react'
import { moeda } from '@/lib/formato'
import { liquidoSalario, type LinhaSalario } from '@/lib/salario'
import { IconeLixeira } from '@/components/Icones'
import { BotaoPrimario, BotaoSecundario, InputMoeda, Modal, classeInput } from '@/components/ui'

type Categoria = { id: string; nome: string; tipo: string }
type Subcategoria = { id: string; nome: string; categoria_id: string }
type Linha = Omit<LinhaSalario, 'valor'> & { chave: number; valor: string }

/**
 * Janela do "Detalhar salário": as linhas do último contracheque, editáveis.
 * Só confirma quando a soma bate com o crédito do banco.
 */
export default function DetalharSalario({
  valorBanco,
  linhasIniciais,
  categorias,
  subcategorias,
  nomeConta,
  onFechar,
  onConfirmar,
}: {
  valorBanco: number
  linhasIniciais: LinhaSalario[]
  categorias: Categoria[]
  subcategorias: Subcategoria[]
  nomeConta: (id: string) => string
  onFechar: () => void
  onConfirmar: (linhas: LinhaSalario[]) => Promise<void>
}) {
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    linhasIniciais.map((l, i) => ({ ...l, chave: i, valor: Number(l.valor).toFixed(2) }))
  )
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const finais: LinhaSalario[] = linhas.map((l) => ({
    id: l.id,
    descricao: l.descricao,
    categoria_id: l.categoria_id,
    subcategoria_id: l.subcategoria_id,
    tipo: l.tipo,
    valor: Number(l.valor || 0),
    neutro: l.neutro,
    contaDestino: l.contaDestino,
  }))
  const soma = liquidoSalario(finais)
  const diferenca = Math.round((valorBanco - soma) * 100) / 100
  const completas = finais.every((l) => l.valor > 0 && (l.contaDestino || l.descricao.trim()))
  const pronto = diferenca === 0 && completas && finais.length > 0

  function alterar(chave: number, mudanca: Partial<Linha>) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)))
  }

  function acrescentar() {
    setLinhas((atual) => [
      ...atual,
      {
        chave: Math.max(-1, ...atual.map((l) => l.chave)) + 1,
        descricao: '',
        categoria_id: null,
        subcategoria_id: null,
        tipo: 'receita',
        valor: '',
        neutro: false,
      },
    ])
  }

  async function confirmar() {
    setSalvando(true)
    setErro('')
    try {
      await onConfirmar(finais)
    } catch {
      setErro('Não foi possível lançar o salário. Tente novamente.')
      setSalvando(false)
    }
  }

  return (
    <Modal aberto titulo="Detalhar salário" onFechar={onFechar}>
      <p className="mb-3 text-sm text-texto-suave">
        Linhas do último contracheque. Corrija o que mudou e acrescente o que faltar (Horas Extras,
        por exemplo).
      </p>
      <ul className="space-y-3">
        {linhas.map((l) => (
          <li key={l.chave} className="rounded-lg border border-borda p-3">
            {l.contaDestino ? (
              <p className="mb-2 text-sm font-semibold text-texto">
                Transferência → {nomeConta(l.contaDestino)}
              </p>
            ) : (
              <div className="mb-2 grid gap-2 sm:grid-cols-2">
                <input
                  className={classeInput}
                  value={l.descricao}
                  onChange={(e) => alterar(l.chave, { descricao: e.target.value })}
                  placeholder="Descrição"
                  aria-label="Descrição"
                />
                <select
                  className={classeInput}
                  value={`${l.categoria_id ?? ''}|${l.subcategoria_id ?? ''}`}
                  onChange={(e) => {
                    const [cat, sub] = e.target.value.split('|')
                    alterar(l.chave, { categoria_id: cat || null, subcategoria_id: sub || null })
                  }}
                  aria-label="Categoria"
                >
                  <option value="|">Sem categoria</option>
                  {categorias.map((c) => (
                    <optgroup key={c.id} label={c.nome}>
                      <option value={`${c.id}|`}>{c.nome}</option>
                      {subcategorias
                        .filter((s) => s.categoria_id === c.id)
                        .map((s) => (
                          <option key={s.id} value={`${c.id}|${s.id}`}>
                            {c.nome} / {s.nome}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {!l.contaDestino && (
                <select
                  className={`${classeInput} w-auto`}
                  value={l.tipo}
                  onChange={(e) => alterar(l.chave, { tipo: e.target.value as Linha['tipo'] })}
                  aria-label="Receita ou desconto"
                >
                  <option value="receita">Receita</option>
                  <option value="despesa">Desconto</option>
                </select>
              )}
              <div className="min-w-32 flex-1">
                <InputMoeda
                  valor={l.valor}
                  onChange={(v) => alterar(l.chave, { valor: v })}
                  aria-label={`Valor de ${l.descricao || 'linha'}`}
                />
              </div>
              {l.neutro && (
                <span className="rounded-full bg-fundo px-2 py-0.5 text-xs text-texto-suave">
                  neutro
                </span>
              )}
              <button
                type="button"
                onClick={() => setLinhas((atual) => atual.filter((x) => x.chave !== l.chave))}
                aria-label={`Remover ${l.descricao || 'linha'}`}
                className="rounded-lg p-2.5 text-texto-suave transition-colors hover:bg-despesa/10 hover:text-despesa"
              >
                <IconeLixeira className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={acrescentar}
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primaria hover:underline"
      >
        + Linha
      </button>

      <p
        className={`mt-3 rounded-lg px-3 py-2.5 text-sm ${diferenca === 0 ? 'bg-fundo text-texto' : 'bg-alerta/10 text-texto'}`}
        aria-live="polite"
      >
        Soma {moeda(soma)} · Banco {moeda(valorBanco)}{' '}
        {diferenca === 0 ? '✓' : `· diferença de ${moeda(Math.abs(diferenca))}`}
      </p>
      {!completas && (
        <p className="mt-1 text-sm text-texto-suave">Toda linha precisa de descrição e valor.</p>
      )}
      {erro && <p className="mt-2 text-sm text-despesa">{erro}</p>}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BotaoSecundario type="button" onClick={onFechar}>
          Cancelar
        </BotaoSecundario>
        <BotaoPrimario type="button" onClick={confirmar} disabled={!pronto || salvando}>
          {salvando ? 'Lançando...' : 'Confirmar'}
        </BotaoPrimario>
      </div>
    </Modal>
  )
}
