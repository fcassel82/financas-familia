const formatadorMoeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/** Formata um número como moeda brasileira: 1234.5 → "R$ 1.234,50" */
export function moeda(valor: number | string | null | undefined): string {
  return formatadorMoeda.format(Number(valor ?? 0))
}

/**
 * Converte uma data ISO ("2026-06-15") para o formato brasileiro ("15/06/2026").
 * Feito por manipulação de string de propósito: usar `new Date()` aqui
 * desloca a data em um dia por causa do fuso horário.
 */
export function dataBR(iso: string): string {
  if (!iso) return ''
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

/** Data de hoje no formato ISO local (sem deslocamento de fuso) */
export function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "2026-06" a partir de um Date */
export function chaveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** "2026-06" → "jun/26" */
export function rotuloMesCurto(chave: string): string {
  const [ano, mes] = chave.split('-').map(Number)
  const d = new Date(ano, mes - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
}

/** "2026-06" → "Junho de 2026" */
export function rotuloMesLongo(chave: string): string {
  const [ano, mes] = chave.split('-').map(Number)
  const d = new Date(ano, mes - 1, 1)
  const texto = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** Primeiro e último dia (ISO) do mês informado como "2026-06" */
export function limitesDoMes(chave: string): { inicio: string; fim: string } {
  const [ano, mes] = chave.split('-').map(Number)
  const ultimoDia = new Date(ano, mes, 0).getDate()
  return {
    inicio: `${chave}-01`,
    fim: `${chave}-${String(ultimoDia).padStart(2, '0')}`,
  }
}

/**
 * Normaliza texto para busca: remove acentos e passa para minúsculas,
 * para que "dizimo" encontre "Dízimo" e "orcamento" encontre "Orçamento".
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // faixa Unicode dos acentos combinantes
    .toLowerCase()
}

/** Desloca uma chave de mês: ("2026-06", -1) → "2026-05" */
export function deslocarMes(chave: string, meses: number): string {
  const [ano, mes] = chave.split('-').map(Number)
  return chaveMes(new Date(ano, mes - 1 + meses, 1))
}
