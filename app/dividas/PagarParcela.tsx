'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { dataBR, hojeISO, moeda, somarDias } from '@/lib/formato'
import { dividirPagamento, tabelaSAC, type DividaSAC } from '@/lib/divida'
import { BotaoPrimario, BotaoSecundario, Campo, InputMoeda, Mensagem, Modal, classeInput } from '@/components/ui'
import { sincronizarDivida, type Divida, type ParcelaRegistrada } from './tipos'

type Conta = { id: string; nome: string }
type Candidato = { id: string; data: string; descricao: string; valor: number; contas: { nome: string } | null }

/**
 * Registra uma parcela paga. O banco debita a parcela inteira da conta da
 * escola (que não está no app); a escola fica com a amortização e a família
 * transfere a sua parte. Só essa parte vira lançamento nas contas da família —
 * ou se liga a um lançamento que já veio do banco, para não duplicar.
 */
export function PagarParcela({
  divida,
  sac,
  pagas,
  onFechar,
  onSalvo,
}: {
  divida: Divida
  sac: DividaSAC
  pagas: ParcelaRegistrada[]
  onFechar: () => void
  onSalvo: (mensagem: string) => void
}) {
  // Sugestões: a parcela estimada na tabela, e a escola pagando a amortização
  const proxima = useMemo(() => tabelaSAC(sac, pagas).find((l) => !l.paga) ?? null, [sac, pagas])

  const [contas, setContas] = useState<Conta[]>([])
  const [candidatos, setCandidatos] = useState<Candidato[]>([])
  const [data, setData] = useState(hojeISO())
  const [valor, setValor] = useState(proxima ? String(proxima.valor) : '')
  const [parteTerceiros, setParteTerceiros] = useState(proxima ? String(proxima.amortizacao) : '0')
  const [contaId, setContaId] = useState('')
  const [ligarA, setLigarA] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const divisao = dividirPagamento(sac, pagas, parseFloat(valor || '0'))
  const parteFamilia = Math.round((parseFloat(valor || '0') - parseFloat(parteTerceiros || '0')) * 100) / 100

  useEffect(() => {
    supabase
      .from('contas')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')
      .then(({ data: lista }) => setContas(((lista ?? []) as Conta[]).filter((c) => c.id !== divida.conta_id)))
  }, [divida.conta_id])

  // Lançamentos que já vieram do banco com o valor da parte da família
  useEffect(() => {
    if (parteFamilia <= 0) return
    const ligados = pagas.map((p) => p.transacao_id).filter(Boolean) as string[]
    supabase
      .from('transacoes')
      .select('id, data, descricao, valor, contas(nome)')
      .eq('tipo', 'despesa')
      .not('conta_id', 'is', null)
      .gte('data', somarDias(data, -10))
      .lte('data', somarDias(data, 10))
      .gte('valor', parteFamilia - 1)
      .lte('valor', parteFamilia + 1)
      .order('data')
      .then(({ data: lista }) =>
        setCandidatos(((lista ?? []) as unknown as Candidato[]).filter((c) => !ligados.includes(c.id)))
      )
  }, [data, parteFamilia, pagas])

  // Só vale a ligação com um lançamento que ainda está na lista
  const ligar = candidatos.some((c) => c.id === ligarA) ? ligarA : ''

  if (!proxima || !divisao) return null

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!divisao) return
    if (divisao.juros < 0) {
      setMensagem('Não: o valor pago é menor que a amortização da parcela.')
      return
    }
    if (parteFamilia < 0) {
      setMensagem('Não: a parte da escola é maior que a parcela.')
      return
    }
    if (parteFamilia > 0 && !ligar && !contaId) {
      setMensagem('Não: escolha de qual conta saiu a sua parte.')
      return
    }
    setSalvando(true)
    setMensagem('')

    let transacaoId: string | null = null
    const subId = divida.subcategoria_parcela_id
    let categoriaId: string | null = null
    if (subId) {
      const { data: sub } = await supabase.from('subcategorias').select('categoria_id').eq('id', subId).single()
      categoriaId = sub?.categoria_id ?? null
    }
    const classificacao = { categoria_id: categoriaId, subcategoria_id: subId, neutro: false }

    if (parteFamilia > 0 && ligar) {
      const { error } = await supabase.from('transacoes').update(classificacao).eq('id', ligar)
      if (error) return falhar('Erro ao ligar o lançamento: ' + error.message)
      transacaoId = ligar
    } else if (parteFamilia > 0) {
      const { data: userData } = await supabase.auth.getUser()
      const usuario = userData.user?.id
      const { data: criada, error } = await supabase
        .from('transacoes')
        .insert({
          ...classificacao,
          data,
          descricao: `Parcela ${divisao.numero}/${sac.parcelas_total} ${divida.nome} (minha parte)`,
          valor: parteFamilia,
          tipo: 'despesa',
          status: 'pago',
          escopo: divida.escopo,
          conta_id: contaId,
          dono_id: usuario,
          lancado_por: usuario,
        })
        .select('id')
        .single()
      if (error) return falhar('Erro ao lançar a sua parte: ' + error.message)
      transacaoId = criada.id
    }

    const nova = {
      divida_id: divida.id,
      numero: divisao.numero,
      pago_em: data,
      amortizacao: divisao.amortizacao,
      juros: divisao.juros,
      pago_terceiros: parseFloat(parteTerceiros || '0'),
      transacao_id: transacaoId,
    }
    const { error } = await supabase.from('parcelas_divida').insert(nova)
    if (error) return falhar('Erro ao registrar a parcela: ' + error.message)

    await sincronizarDivida(divida, sac, [...pagas, nova])
    onSalvo(`Parcela ${divisao.numero} registrada.`)
  }

  function falhar(texto: string) {
    setMensagem(texto)
    setSalvando(false)
  }

  return (
    <Modal aberto titulo={`Pagar parcela ${divisao.numero}/${sac.parcelas_total}`} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Data do pagamento">
            <input type="date" className={classeInput} value={data} onChange={(e) => setData(e.target.value)} required />
          </Campo>
          <Campo rotulo="Valor real da parcela">
            <InputMoeda valor={valor} onChange={setValor} required />
          </Campo>
        </div>

        <div className="rounded-lg bg-fundo px-3 py-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-texto-suave">Amortização (abate a dívida)</span>
            <span className="font-medium text-texto">{moeda(divisao.amortizacao)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-texto-suave">Juros</span>
            <span className="font-medium text-texto">{moeda(Math.max(0, divisao.juros))}</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Parte paga pela escola">
            <InputMoeda valor={parteTerceiros} onChange={setParteTerceiros} />
          </Campo>
          <div>
            <p className="mb-1.5 text-sm font-medium text-texto">Sua parte</p>
            <p className="rounded-lg border border-borda px-3 py-2 text-right text-sm font-semibold tabular-nums text-despesa">
              {moeda(parteFamilia)}
            </p>
          </div>
        </div>

        {parteFamilia > 0 && candidatos.length > 0 && (
          <Campo rotulo="Já veio do banco? Ligue ao lançamento">
            <select className={classeInput} value={ligarA} onChange={(e) => setLigarA(e.target.value)}>
              <option value="">Não, criar um lançamento novo</option>
              {candidatos.map((c) => (
                <option key={c.id} value={c.id}>
                  {dataBR(c.data)} · {c.descricao} · {moeda(c.valor)}
                  {c.contas ? ` · ${c.contas.nome}` : ''}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {parteFamilia > 0 && !ligar && (
          <Campo rotulo="De qual conta saiu a sua parte">
            <select className={classeInput} value={contaId} onChange={(e) => setContaId(e.target.value)}>
              <option value="">Escolha a conta</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <Mensagem texto={mensagem} />

        <div className="flex justify-end gap-2 pt-2">
          <BotaoSecundario type="button" onClick={onFechar}>
            Cancelar
          </BotaoSecundario>
          <BotaoPrimario type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Registrar pagamento'}
          </BotaoPrimario>
        </div>
      </form>
    </Modal>
  )
}
