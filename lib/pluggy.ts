/**
 * Acesso à API da Pluggy (Meu Pluggy, plano pessoal). SÓ PARA O SERVIDOR:
 * usa o Client Secret, que dá acesso a todos os dados bancários conectados.
 * Nunca importe este arquivo em componente 'use client'.
 *
 * Variáveis (Vercel): PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET e PLUGGY_ITEM_IDS
 * (IDs das conexões separados por vírgula; o plano pessoal não lista os items).
 */
import 'server-only'

const BASE = 'https://api.pluggy.ai'
// Teto de páginas por conta, para uma resposta estranha não virar laço infinito
const MAXIMO_PAGINAS = 50

export type ContaPluggy = {
  id: string
  itemId: string
  type: 'BANK' | 'CREDIT' | string
  subtype: string | null
  name: string
  marketingName: string | null
  number: string | null
  balance: number | null
}

export type TransacaoPluggy = {
  id: string
  date: string
  description: string
  descriptionRaw: string | null
  amount: number
  type: 'DEBIT' | 'CREDIT' | string
  status: string | null
  category: string | null
  merchant: { name?: string | null; businessName?: string | null } | null
  creditCardMetadata: {
    installmentNumber?: number | null
    totalInstallments?: number | null
  } | null
}

let chaveEmCache: { valor: string; ate: number } | null = null

export function idsDasConexoes(): string[] {
  return (process.env.PLUGGY_ITEM_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

/** Nomes das variáveis que faltam (só os nomes, nunca os valores) */
export function variaveisFaltando(): string[] {
  const faltando: string[] = []
  if (!process.env.PLUGGY_CLIENT_ID?.trim()) faltando.push('PLUGGY_CLIENT_ID')
  if (!process.env.PLUGGY_CLIENT_SECRET?.trim()) faltando.push('PLUGGY_CLIENT_SECRET')
  if (idsDasConexoes().length === 0) faltando.push('PLUGGY_ITEM_IDS')
  return faltando
}

async function chaveDeAcesso(): Promise<string> {
  // A chave da Pluggy dura cerca de 2 horas; renova antes, por segurança
  if (chaveEmCache && chaveEmCache.ate > Date.now()) return chaveEmCache.valor
  const resposta = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: process.env.PLUGGY_CLIENT_ID,
      clientSecret: process.env.PLUGGY_CLIENT_SECRET,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (!resposta.ok) throw new Error(`A Pluggy recusou as credenciais (HTTP ${resposta.status}).`)
  const { apiKey } = (await resposta.json()) as { apiKey?: string }
  if (!apiKey) throw new Error('A Pluggy não devolveu a chave de acesso.')
  chaveEmCache = { valor: apiKey, ate: Date.now() + 90 * 60_000 }
  return apiKey
}

async function pedir<T>(caminho: string): Promise<T> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    headers: { 'X-API-KEY': await chaveDeAcesso(), Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  if (!resposta.ok) {
    // Só o código e o recurso; nunca repassa cabeçalhos ou a chave
    throw new Error(`A Pluggy respondeu HTTP ${resposta.status} em ${caminho.split('?')[0]}.`)
  }
  return (await resposta.json()) as T
}

export async function listarContas(itemId: string): Promise<ContaPluggy[]> {
  const { results } = await pedir<{ results: ContaPluggy[] }>(
    `/accounts?itemId=${encodeURIComponent(itemId)}`
  )
  return results ?? []
}

/** Transações de uma conta entre duas datas (aaaa-mm-dd), seguindo todas as páginas */
export async function listarTransacoes(
  accountId: string,
  de: string,
  ate: string
): Promise<TransacaoPluggy[]> {
  const base = `accountId=${encodeURIComponent(accountId)}&dateFrom=${de}&dateTo=${ate}`
  const todas: TransacaoPluggy[] = []
  let consulta: string | null = base
  for (let n = 0; consulta && n < MAXIMO_PAGINAS; n++) {
    const pagina: { results?: TransacaoPluggy[]; next?: string | null } = await pedir(
      `/v2/transactions?${consulta}`
    )
    todas.push(...(pagina.results ?? []))
    // "next" já é a query string da próxima página; as datas precisam ir junto
    const proxima = pagina.next ? pagina.next.replace(/^.*\?/, '') : null
    consulta = proxima ? `${proxima}&dateFrom=${de}&dateTo=${ate}` : null
  }
  return todas
}

/** Data da transação no fuso de Brasília ("2026-10-25T03:00:00Z" → "2026-10-25") */
export function dataLocal(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}
