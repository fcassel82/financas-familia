/**
 * Junta o que veio da Pluggy com o que já está na caixa de entrada.
 *
 * Compra de cartão na fatura aberta chega PENDING e só vira POSTED quando a
 * fatura fecha; nessa troca a Pluggy pode devolver a mesma compra com outro id
 * (docs.pluggy.ai, "Credit card transactions and the statement cycle"). Para a
 * compra não aparecer duas vezes, a nova assume a linha antiga: pelo providerId
 * (id da instituição, o único estável) ou, sem ele, pela mesma conta, valor e
 * data próxima. A linha mantém a situação e os lançamentos que o Fred já
 * confirmou; só a que ainda está em "revisar" recebe data, descrição e valor novos.
 *
 * Imports relativos de propósito: o Vitest testa este arquivo sem o alias "@/".
 */

export type LinhaBanco = {
  id: string
  conta_banco_id: string
  data: string
  descricao: string
  valor: number
  tipo: 'receita' | 'despesa'
  pagamento_cartao: boolean
  categoria_banco: string | null
  comerciante: string | null
  parcela: number | null
  parcelas: number | null
  pendente_banco: boolean
  provider_id: string | null
}

export type ExistenteBanco = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  situacao: string
  pendente_banco: boolean
  provider_id: string | null
}

export type PlanoMescla = {
  inserir: LinhaBanco[]
  atualizar: { idAtual: string; mudanca: Partial<LinhaBanco> }[]
}

const DIAS_PENDENTE = 3

function centavos(v: number): number {
  return Math.round(Number(v) * 100)
}

function diasEntre(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
}

/** O que muda numa linha que já existe */
function mudancasDe(e: ExistenteBanco, r: LinhaBanco): Partial<LinhaBanco> {
  const m: Partial<LinhaBanco> = {}
  if (e.pendente_banco !== r.pendente_banco) m.pendente_banco = r.pendente_banco
  if (r.provider_id && e.provider_id !== r.provider_id) m.provider_id = r.provider_id
  // Já revisada: o que o Fred confirmou não muda por baixo dele
  if (e.situacao === 'revisar') {
    if (e.data !== r.data) m.data = r.data
    if (e.descricao !== r.descricao) m.descricao = r.descricao
    if (centavos(e.valor) !== centavos(r.valor)) m.valor = r.valor
  }
  return m
}

export function mesclarTransacoesBanco(
  novas: LinhaBanco[],
  existentes: ExistenteBanco[]
): PlanoMescla {
  const porId = new Map(existentes.map((e) => [e.id, e]))
  const idsNovos = new Set(novas.map((r) => r.id))
  // Só pode ser assumida a linha que a Pluggy deixou de devolver
  const sumidas = existentes.filter((e) => !idsNovos.has(e.id))
  const usadas = new Set<string>()
  const plano: PlanoMescla = { inserir: [], atualizar: [] }

  for (const r of novas) {
    const mesma = porId.get(r.id)
    if (mesma) {
      const m = mudancasDe(mesma, r)
      if (Object.keys(m).length > 0) plano.atualizar.push({ idAtual: mesma.id, mudanca: m })
      continue
    }

    const candidatas = sumidas.filter((e) => !usadas.has(e.id))
    const porProvider = r.provider_id
      ? candidatas.find((e) => e.provider_id === r.provider_id)
      : undefined
    const porValor = candidatas
      .filter(
        (e) =>
          !e.provider_id &&
          e.tipo === r.tipo &&
          centavos(e.valor) === centavos(r.valor) &&
          (e.pendente_banco
            ? diasEntre(e.data, r.data) <= DIAS_PENDENTE
            : e.data === r.data && e.descricao === r.descricao)
      )
      .sort((a, b) => diasEntre(a.data, r.data) - diasEntre(b.data, r.data))[0]
    const antiga = porProvider ?? porValor

    if (antiga) {
      usadas.add(antiga.id)
      plano.atualizar.push({ idAtual: antiga.id, mudanca: { id: r.id, ...mudancasDe(antiga, r) } })
    } else {
      plano.inserir.push(r)
    }
  }
  return plano
}
