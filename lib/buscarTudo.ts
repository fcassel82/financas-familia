/**
 * O PostgREST corta toda resposta num teto de linhas — 1.000 por padrão no
 * Supabase — e não avisa: devolve as primeiras mil e um HTTP 200. Numa
 * consulta de saldo isso é o pior tipo de erro, porque o número fica menor
 * sem nenhum sinal de que faltou algo.
 *
 * Esta função pagina até o fim. Use em toda consulta que precise do conjunto
 * completo, principalmente as que somam valores sem filtro de período.
 *
 *   const { data, error } = await buscarTudo((de, ate) =>
 *     supabase.from('transacoes').select('conta_id, valor, tipo')
 *       .eq('status', 'pago').order('id').range(de, ate)
 *   )
 *
 * IMPORTANTE: ordene por uma coluna única (`id` serve) antes de paginar. Sem
 * ordem estável o banco pode devolver a mesma linha em duas páginas — ou
 * nenhuma —, e o resultado varia entre execuções.
 */

const TAMANHO_PAGINA = 1000

/** Trava de segurança: para em 1 milhão de linhas em vez de rodar para sempre. */
const MAXIMO_PAGINAS = 1000

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

export async function buscarTudo<T>(
  pagina: (de: number, ate: number) => Pagina<T>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const tudo: T[] = []

  for (let n = 0; n < MAXIMO_PAGINAS; n++) {
    const { data, error } = await pagina(tudo.length, tudo.length + TAMANHO_PAGINA - 1)
    if (error) return { data: tudo, error }

    const lote = data ?? []
    // Só uma página vazia encerra. Tentador seria parar quando o lote vem menor
    // que o pedido, mas aí bastaria o projeto ter `max-rows` abaixo de
    // TAMANHO_PAGINA para a leitura ser cortada em silêncio — que é justamente
    // o problema que esta função existe para evitar. Avançar pelo tamanho do
    // lote recebido funciona com qualquer teto do servidor.
    if (lote.length === 0) return { data: tudo, error: null }
    tudo.push(...lote)
  }

  return { data: tudo, error: { message: 'buscarTudo: limite de páginas atingido' } }
}
