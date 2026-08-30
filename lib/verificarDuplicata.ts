import { supabase } from './supabaseClient'

export type Duplicata = { id: string; data: string; descricao: string; valor: number; tipo: string }

/**
 * Um lançamento é considerado duplicata de outro quando tem a mesma data,
 * o mesmo tipo, o mesmo valor e a mesma descrição (sem diferenciar
 * maiúsculas/minúsculas). Essa combinação é rara o suficiente por acaso —
 * duas compras diferentes no mesmo dia e valor quase nunca têm a mesma
 * descrição também — para servir de sinal confiável sem soar alarme à toa.
 */
function ehMesmoLancamento(
  a: { data: string; descricao: string; valor: number; tipo: string },
  b: { data: string; descricao: string; valor: number; tipo: string }
): boolean {
  return (
    a.data === b.data &&
    a.tipo === b.tipo &&
    Math.abs(a.valor - b.valor) < 0.005 &&
    a.descricao.trim().toLowerCase() === b.descricao.trim().toLowerCase()
  )
}

/**
 * Procura um lançamento já existente igual ao que está prestes a ser
 * criado. Usado no formulário de novo lançamento — uma consulta só, pontual.
 */
export async function verificarDuplicata(
  data: string,
  descricao: string,
  valor: number,
  tipo: string
): Promise<Duplicata[]> {
  if (!data || !descricao.trim() || !valor) return []

  const { data: encontrados } = await supabase
    .from('transacoes')
    .select('id, data, descricao, valor, tipo')
    .eq('data', data)
    .eq('tipo', tipo)
    .eq('valor', valor)
    .ilike('descricao', descricao.trim())

  return (encontrados ?? []) as Duplicata[]
}

export type LinhaParaChecar = { data: string; descricao: string; valor: number; tipo: string }

/**
 * Mesma checagem, mas para várias linhas de uma vez (importação em lote).
 * Busca só uma vez os lançamentos existentes no período coberto pelas
 * linhas e compara em memória, em vez de uma consulta por linha.
 */
export async function verificarDuplicatasEmLote(
  linhas: LinhaParaChecar[]
): Promise<Map<number, Duplicata[]>> {
  const resultado = new Map<number, Duplicata[]>()
  const comData = linhas.filter((l) => l.data)
  if (comData.length === 0) return resultado

  const datas = comData.map((l) => l.data).sort()
  const { data: existentes } = await supabase
    .from('transacoes')
    .select('id, data, descricao, valor, tipo')
    .gte('data', datas[0])
    .lte('data', datas[datas.length - 1])

  if (!existentes || existentes.length === 0) return resultado

  linhas.forEach((linha, indice) => {
    const encontrados = existentes.filter((e) => ehMesmoLancamento(linha, e))
    if (encontrados.length > 0) resultado.set(indice, encontrados as Duplicata[])
  })

  return resultado
}
