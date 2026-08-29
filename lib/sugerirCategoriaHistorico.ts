import { supabase } from './supabaseClient'
import { sugerirCategoria } from './categorizarProduto'

export type CategoriaOpcao = { id: string; nome: string; tipo: string }
export type SubcategoriaOpcao = { id: string; categoria_id: string; nome: string }

export type SugestaoResolvida = { categoriaId: string; subcategoriaId: string } | null

/**
 * Sugere categoria/subcategoria para a descrição de um lançamento.
 *
 * Primeiro tenta o histórico: um lançamento anterior do mesmo tipo com essa
 * descrição exata (sem diferenciar maiúsculas/minúsculas) já diz qual
 * categoria a pessoa usa para ela — é o sinal mais confiável porque aprende
 * o vocabulário de quem usa o app, em vez de um dicionário genérico.
 *
 * Sem histórico, cai para o chute por palavra-chave do nome do produto
 * (lib/categorizarProduto.ts, construído para a importação de nota fiscal).
 * Esse fallback só cobre despesas de mercado/compras — não tenta adivinhar
 * receita nem descrições de serviços (Uber, Netflix etc.).
 */
export async function sugerirCategoriaLancamento(
  descricao: string,
  tipo: string,
  categorias: CategoriaOpcao[],
  subcategorias: SubcategoriaOpcao[]
): Promise<SugestaoResolvida> {
  const texto = descricao.trim()
  if (!texto) return null

  const { data: historico } = await supabase
    .from('transacoes')
    .select('categoria_id, subcategoria_id')
    .eq('tipo', tipo)
    .ilike('descricao', texto)
    .not('categoria_id', 'is', null)
    .order('data', { ascending: false })
    .limit(1)

  const encontrado = historico?.[0]
  if (encontrado?.categoria_id) {
    return { categoriaId: encontrado.categoria_id, subcategoriaId: encontrado.subcategoria_id ?? '' }
  }

  if (tipo !== 'despesa') return null

  const sugestao = sugerirCategoria(texto)
  if (!sugestao) return null

  const categoria = categorias.find(
    (c) => c.tipo === 'despesa' && c.nome.toLowerCase() === sugestao.categoria.toLowerCase()
  )
  if (!categoria) return null

  const subcategoria = subcategorias.find(
    (s) => s.categoria_id === categoria.id && s.nome.toLowerCase() === sugestao.subcategoria.toLowerCase()
  )

  return { categoriaId: categoria.id, subcategoriaId: subcategoria?.id ?? '' }
}
