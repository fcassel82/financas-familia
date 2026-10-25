'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { hojeISO, moeda } from '@/lib/formato'
import { calcularAtualizacao } from '@/lib/investimentos'
import {
  BotaoPrimario,
  BotaoSecundario,
  Campo,
  InputMoeda,
  Modal,
  classeInput,
} from '@/components/ui'

type ContaAtualizada = { id: string; nome: string; escopo: string }

/** "um aporte da empresa de R$ 387,41 e um rendimento de R$ 312,40" */
function descreverLancamentos(aporte: number, rendimento: number): string[] {
  const partes: string[] = []
  if (aporte > 0) partes.push(`um aporte da empresa de ${moeda(aporte)}`)
  if (rendimento > 0) partes.push(`um rendimento de ${moeda(rendimento)}`)
  if (rendimento < 0) partes.push(`uma desvalorização de ${moeda(Math.abs(rendimento))}`)
  return partes
}

/**
 * Janela do "Atualizar saldo": a pessoa digita o saldo do extrato e o app lança
 * a diferença como rendimento (ou desvalorização), já marcada e neutra.
 * O pai monta este componente só quando a janela abre, então o estado começa limpo.
 */
export default function AtualizarSaldo({
  conta,
  saldoApp,
  onFechar,
  onSalvo,
}: {
  conta: ContaAtualizada
  saldoApp: number
  onFechar: () => void
  onSalvo: (mensagem: string) => void
}) {
  const [saldoBanco, setSaldoBanco] = useState('')
  const [aporte, setAporte] = useState('')
  const [data, setData] = useState(hojeISO())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const calculo =
    saldoBanco === ''
      ? null
      : calcularAtualizacao(saldoApp, Number(saldoBanco), Number(aporte || 0))
  const partes = calculo ? descreverLancamentos(calculo.aporte, calculo.rendimento) : []

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!calculo) return
    setSalvando(true)
    setErro('')

    const { data: userData } = await supabase.auth.getUser()
    const usuario = userData.user?.id
    const base = {
      conta_id: conta.id,
      data,
      status: 'pago',
      neutro: true,
      escopo: conta.escopo,
      dono_id: usuario,
      lancado_por: usuario,
    }

    const linhas = []
    if (calculo.aporte > 0) {
      linhas.push({
        ...base,
        descricao: 'Aporte da empresa',
        tipo: 'receita',
        valor: calculo.aporte,
        movimento_investimento: 'aporte_empresa',
      })
    }
    if (calculo.rendimento !== 0) {
      linhas.push({
        ...base,
        descricao: calculo.rendimento > 0 ? 'Rendimento' : 'Desvalorização',
        tipo: calculo.rendimento > 0 ? 'receita' : 'despesa',
        valor: Math.abs(calculo.rendimento),
        movimento_investimento: 'rendimento',
      })
    }

    if (linhas.length > 0) {
      const { error } = await supabase.from('transacoes').insert(linhas)
      if (error) {
        setErro('Não foi possível atualizar o saldo. Tente novamente.')
        setSalvando(false)
        return
      }
    }

    // Só o dono da conta ou o administrador podem gravar a data; para os
    // outros a regra de acesso recusa em silêncio e a data vem do último
    // lançamento marcado (ver dataUltimaAtualizacao)
    await supabase.from('contas').update({ saldo_conferido_em: data }).eq('id', conta.id)

    onSalvo(
      partes.length > 0 ? `Saldo atualizado. Lançado ${partes.join(' e ')}.` : 'Saldo atualizado.'
    )
  }

  return (
    <Modal aberto titulo={`Atualizar saldo: ${conta.nome}`} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <div className="flex items-baseline justify-between gap-3 rounded-lg bg-fundo px-3 py-2.5">
          <span className="text-sm text-texto-suave">Saldo no app</span>
          <span className="font-semibold text-texto">{moeda(saldoApp)}</span>
        </div>

        <Campo rotulo="Saldo no banco hoje">
          <InputMoeda
            valor={saldoBanco}
            onChange={setSaldoBanco}
            required
            aria-label="Saldo no banco hoje"
          />
        </Campo>

        <Campo rotulo="Aporte da empresa desde a última atualização (opcional)">
          <InputMoeda valor={aporte} onChange={setAporte} aria-label="Aporte da empresa" />
        </Campo>

        <Campo rotulo="Data">
          <input
            type="date"
            className={classeInput}
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
          />
        </Campo>

        {calculo && (
          <p
            className="rounded-lg border border-borda px-3 py-2.5 text-sm text-texto"
            aria-live="polite"
          >
            {partes.length > 0
              ? `Vai lançar ${partes.join(' e ')}.`
              : 'O saldo já confere, nada a lançar.'}
          </p>
        )}

        {erro && <p className="text-sm text-despesa">{erro}</p>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <BotaoSecundario type="button" onClick={onFechar}>
            Cancelar
          </BotaoSecundario>
          <BotaoPrimario type="submit" disabled={!calculo || salvando}>
            {salvando ? 'Atualizando...' : 'Atualizar saldo'}
          </BotaoPrimario>
        </div>
      </form>
    </Modal>
  )
}
