/**
 * Sugestões para os lançamentos pendentes (sem conta/cartão ou sem categoria),
 * tiradas do histórico do próprio banco. Cada sinal soma pontos; ficam as 3
 * opções com mais pontos, cada uma com o motivo do sinal mais forte.
 * Pesos em docs/superpowers/specs/2026-10-25-pendencias-design.md.
 *
 * Imports relativos de propósito: o Vitest testa este arquivo sem o alias "@/".
 */
import { sugerirCategoria as categoriaPeloProduto } from './categorizarProduto'
import { normalizar } from './formato'

export type Historico = {
  descricao: string
  tipo: string
  dono_id: string
  conta_id: string | null
  cartao_id: string | null
  categoria_id: string | null
  subcategoria_id: string | null
}

export type SugestaoOrigem = {
  tipo: 'conta' | 'cartao'
  id: string
  nome: string
  motivo: string
  pontos: number
}

export type SugestaoDeCategoria = {
  categoria_id: string
  subcategoria_id: string | null
  nome: string
  motivo: string
  pontos: number
}

type ContaOpcao = { id: string; nome: string; tipo: string; ativo: boolean }
type CartaoOpcao = { id: string; nome: string; ativo: boolean }
type CategoriaOpcao = { id: string; nome: string; tipo: string }
type SubcategoriaOpcao = { id: string; nome: string; categoria_id: string }

const MAXIMO = 3

/** "EBN   *SPOTIFY 123" → "ebn spotify" */
export function normalizarDescricao(d: string): string {
  return normalizar(d)
    .replace(/[0-9]/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim()
}

/** O que vem antes do "*" (sem espaços) ou a primeira palavra; nulo se tiver menos de 3 letras */
export function comerciante(d: string): string | null {
  const base = d.includes('*') ? d.split('*')[0].replace(/\s+/g, '') : (d.trim().split(/\s+/)[0] ?? '')
  const nome = normalizarDescricao(base).replace(/\s+/g, '')
  return nome.length >= 3 ? nome : null
}

/** Descrição com cara de fatura de cartão: "LOJA*ITEM" ou parcela "(1/2)" */
export function pareceCartao(d: string): boolean {
  return d.includes('*') || /\(\s*\d+\s*\/\s*\d+\s*\)/.test(d)
}

type Pontuacao = { pontos: number; motivo: string; forca: number }

/** Soma pontos e guarda o motivo do sinal mais forte (maior peso total) */
function somar(mapa: Map<string, Pontuacao>, chave: string, pontos: number, motivo: string) {
  const atual = mapa.get(chave) ?? { pontos: 0, motivo, forca: 0 }
  atual.pontos += pontos
  if (pontos > atual.forca) {
    atual.forca = pontos
    atual.motivo = motivo
  }
  mapa.set(chave, atual)
}

/** Conta quantas vezes cada chave aparece entre os lançamentos que batem */
function contar<T>(itens: T[], chaveDe: (t: T) => string | null): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const t of itens) {
    const chave = chaveDe(t)
    if (chave) mapa.set(chave, (mapa.get(chave) ?? 0) + 1)
  }
  return mapa
}

function vezes(n: number): string {
  return `${n} ${n === 1 ? 'vez' : 'vezes'}`
}

function melhores(mapa: Map<string, Pontuacao>) {
  return Array.from(mapa.entries())
    .filter(([, p]) => p.pontos > 0)
    .sort((a, b) => b[1].pontos - a[1].pontos)
    .slice(0, MAXIMO)
}

export function sugerirOrigem(
  alvo: Historico,
  historico: Historico[],
  contas: ContaOpcao[],
  cartoes: CartaoOpcao[]
): SugestaoOrigem[] {
  const contaAtiva = new Map(contas.filter((c) => c.ativo).map((c) => [c.id, c]))
  const cartaoAtivo = new Map(cartoes.filter((c) => c.ativo).map((c) => [c.id, c]))
  const chaveDe = (h: Historico) =>
    h.cartao_id && cartaoAtivo.has(h.cartao_id)
      ? `cartao:${h.cartao_id}`
      : h.conta_id && contaAtiva.has(h.conta_id)
        ? `conta:${h.conta_id}`
        : null

  const doTipo = historico.filter((h) => h.tipo === alvo.tipo && chaveDe(h))
  const pontos = new Map<string, Pontuacao>()

  const desc = normalizarDescricao(alvo.descricao)
  if (desc) {
    for (const [chave, n] of contar(
      doTipo.filter((h) => normalizarDescricao(h.descricao) === desc),
      chaveDe
    )) {
      somar(pontos, chave, 3 * n, `Mesma descrição: ${vezes(n)}`)
    }
  }

  const loja = comerciante(alvo.descricao)
  if (loja) {
    for (const [chave, n] of contar(
      doTipo.filter((h) => comerciante(h.descricao) === loja),
      chaveDe
    )) {
      somar(pontos, chave, 2 * n, `Mesmo comerciante (${loja}): ${vezes(n)}`)
    }
  }

  const doDono = doTipo.filter((h) => h.dono_id === alvo.dono_id)
  if (pareceCartao(alvo.descricao)) {
    const usoCartoes = contar(doDono, (h) => (h.cartao_id && cartaoAtivo.has(h.cartao_id) ? `cartao:${h.cartao_id}` : null))
    const total = Array.from(usoCartoes.values()).reduce((s, n) => s + n, 0)
    for (const [chave, n] of usoCartoes) somar(pontos, chave, n / total, 'Compra com jeito de cartão')
  }

  // Reserva: o que essa pessoa mais usa (conta de investimento não é meio de pagamento)
  const usoGeral = contar(doDono, (h) => {
    const chave = chaveDe(h)
    if (!chave) return null
    if (chave.startsWith('conta:') && contaAtiva.get(h.conta_id!)?.tipo === 'investimento') return null
    return chave
  })
  const totalGeral = Array.from(usoGeral.values()).reduce((s, n) => s + n, 0)
  for (const [chave, n] of usoGeral) somar(pontos, chave, (0.5 * n) / totalGeral, 'Mais usado por quem lançou')

  return melhores(pontos).map(([chave, p]) => {
    const [tipo, id] = chave.split(':') as ['conta' | 'cartao', string]
    const nome = (tipo === 'conta' ? contaAtiva.get(id)?.nome : cartaoAtivo.get(id)?.nome) ?? ''
    return { tipo, id, nome, motivo: p.motivo, pontos: p.pontos }
  })
}

export function sugerirCategoria(
  alvo: Historico,
  historico: Historico[],
  categorias: CategoriaOpcao[],
  subcategorias: SubcategoriaOpcao[]
): SugestaoDeCategoria[] {
  const categoriaDoTipo = new Map(categorias.filter((c) => c.tipo === alvo.tipo).map((c) => [c.id, c]))
  const subPorId = new Map(subcategorias.map((s) => [s.id, s]))
  const chaveDe = (h: Historico) =>
    h.categoria_id && categoriaDoTipo.has(h.categoria_id) ? `${h.categoria_id}|${h.subcategoria_id ?? ''}` : null

  const doTipo = historico.filter((h) => h.tipo === alvo.tipo && chaveDe(h))
  const pontos = new Map<string, Pontuacao>()

  const desc = normalizarDescricao(alvo.descricao)
  if (desc) {
    for (const [chave, n] of contar(
      doTipo.filter((h) => normalizarDescricao(h.descricao) === desc),
      chaveDe
    )) {
      somar(pontos, chave, 3 * n, `Mesma descrição: ${vezes(n)}`)
    }
  }

  const loja = comerciante(alvo.descricao)
  if (loja) {
    for (const [chave, n] of contar(
      doTipo.filter((h) => comerciante(h.descricao) === loja),
      chaveDe
    )) {
      somar(pontos, chave, 2 * n, `Mesmo comerciante (${loja}): ${vezes(n)}`)
    }
  }

  // Dicionário de produtos (feito para nota fiscal): casa pelo nome da categoria
  if (alvo.tipo === 'despesa') {
    const palpite = categoriaPeloProduto(alvo.descricao)
    const categoria = palpite
      ? Array.from(categoriaDoTipo.values()).find((c) => normalizar(c.nome) === normalizar(palpite.categoria))
      : undefined
    if (palpite && categoria) {
      const sub = subcategorias.find(
        (s) => s.categoria_id === categoria.id && normalizar(s.nome) === normalizar(palpite.subcategoria)
      )
      somar(pontos, `${categoria.id}|${sub?.id ?? ''}`, 1.5, 'Pelo nome do produto')
    }
  }

  // Reserva: os pares mais usados nesse tipo de lançamento
  const uso = contar(doTipo, chaveDe)
  const total = Array.from(uso.values()).reduce((s, n) => s + n, 0)
  const rotuloTipo = alvo.tipo === 'receita' ? 'receitas' : 'despesas'
  for (const [chave, n] of uso) somar(pontos, chave, (0.5 * n) / total, `Mais usada em ${rotuloTipo}`)

  return melhores(pontos).map(([chave, p]) => {
    const [categoriaId, subId] = chave.split('|')
    const sub = subId ? subPorId.get(subId) : undefined
    const nomeCategoria = categoriaDoTipo.get(categoriaId)?.nome ?? ''
    return {
      categoria_id: categoriaId,
      subcategoria_id: subId || null,
      nome: sub ? `${nomeCategoria} / ${sub.nome}` : nomeCategoria,
      motivo: p.motivo,
      pontos: p.pontos,
    }
  })
}
