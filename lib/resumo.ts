/**
 * Tela Resumo: os lançamentos que formam uma soma de outra tela. O filtro vai
 * no endereço (/resumo?…), então o botão voltar funciona e qualquer tela pode
 * montar o link com `linkResumo`.
 *
 * Cada tela de origem soma de um jeito; a `regra` repete esse jeito para os
 * números do Resumo baterem com o que a pessoa tocou.
 *
 * Imports relativos de propósito: o Vitest testa este arquivo sem o alias "@/".
 */
import { chaveCompetencia, deslocarMes } from './formato'

export type RegraResumo = 'resultado' | '503020' | 'conta'
export type GrupoResumo = 'necessidade' | 'desejo' | 'investimento' | 'deducao' | 'sem'
export type MovimentoResumo = 'rendimento' | 'aporte_empresa' | 'aplicado' | 'resgatado'

export type FiltroResumo = {
  de: string
  ate: string
  regra: RegraResumo
  tipo?: 'receita' | 'despesa'
  categoria?: string
  subcategoria?: string
  categorias?: string[]
  subcategorias?: string[]
  grupo?: GrupoResumo
  escopo?: 'familiar' | 'pessoal'
  membros?: string[]
  /** Quem lançou (dono_id), como o filtro de membro dos Relatórios */
  dono?: string
  conta?: string
  cartao?: string
  movimento?: MovimentoResumo
  titulo?: string
}

export type LancamentoResumo = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: 'receita' | 'despesa'
  status: string
  escopo: string
  dono_id: string
  categoria_id: string | null
  subcategoria_id: string | null
  conta_id: string | null
  cartao_id: string | null
  transferencia_id: string | null
  fatura_cartao_id: string | null
  neutro: boolean
  movimento_investimento: 'rendimento' | 'aporte_empresa' | null
  categorias?: { nome: string } | null
  subcategorias?: { nome: string } | null
  contas?: { nome: string } | null
  cartoes_credito?: { nome: string } | null
}

export type ContextoResumo = {
  grupoDaSubcategoria: Map<string, string | null>
  tipoDaConta: Map<string, string>
  /** transferencia_id → conta de onde saiu e conta onde chegou */
  contaDaTransferencia: Map<string, { origem: string | null; destino: string | null }>
}

export const CAMPOS_LANCAMENTO_RESUMO =
  'id, data, descricao, valor, tipo, status, escopo, dono_id, categoria_id, subcategoria_id, conta_id, cartao_id, transferencia_id, fatura_cartao_id, neutro, movimento_investimento, categorias(nome), subcategorias(nome), contas(nome), cartoes_credito!cartao_id(nome)'

// Marcadores já usados pelos filtros de Relatórios e da Calculadora
export const SEM_CATEGORIA = '__sem_categoria__'
export const SEM_SUBCATEGORIA = '__sem_subcategoria__'
export const FAMILIAR = '__familiar__'

const REGRAS: RegraResumo[] = ['resultado', '503020', 'conta']
const GRUPOS: GrupoResumo[] = ['necessidade', 'desejo', 'investimento', 'deducao', 'sem']
const MOVIMENTOS: MovimentoResumo[] = ['rendimento', 'aporte_empresa', 'aplicado', 'resgatado']

function escolher<T extends string>(valor: string | null, permitidos: readonly T[]): T | undefined {
  return valor && (permitidos as readonly string[]).includes(valor) ? (valor as T) : undefined
}

function lista(valor: string | null): string[] | undefined {
  const itens = (valor ?? '').split(',').filter(Boolean)
  return itens.length > 0 ? itens : undefined
}

export function linkResumo(f: FiltroResumo): string {
  const p = new URLSearchParams()
  p.set('de', f.de)
  p.set('ate', f.ate)
  if (f.regra !== 'resultado') p.set('regra', f.regra)
  if (f.tipo) p.set('tipo', f.tipo)
  if (f.categoria) p.set('categoria', f.categoria)
  if (f.subcategoria) p.set('subcategoria', f.subcategoria)
  if (f.categorias?.length) p.set('categorias', f.categorias.join(','))
  if (f.subcategorias?.length) p.set('subcategorias', f.subcategorias.join(','))
  if (f.grupo) p.set('grupo', f.grupo)
  if (f.escopo) p.set('escopo', f.escopo)
  if (f.membros?.length) p.set('membros', f.membros.join(','))
  if (f.dono) p.set('dono', f.dono)
  if (f.conta) p.set('conta', f.conta)
  if (f.cartao) p.set('cartao', f.cartao)
  if (f.movimento) p.set('movimento', f.movimento)
  if (f.titulo) p.set('titulo', f.titulo)
  return `/resumo?${p.toString()}`
}

export function lerFiltroResumo(p: URLSearchParams): FiltroResumo | null {
  const de = p.get('de')
  const ate = p.get('ate')
  if (!de || !ate) return null
  const f: FiltroResumo = { de, ate, regra: escolher(p.get('regra'), REGRAS) ?? 'resultado' }
  const tipo = escolher(p.get('tipo'), ['receita', 'despesa'] as const)
  if (tipo) f.tipo = tipo
  if (p.get('categoria')) f.categoria = p.get('categoria')!
  if (p.get('subcategoria')) f.subcategoria = p.get('subcategoria')!
  const categorias = lista(p.get('categorias'))
  if (categorias) f.categorias = categorias
  const subcategorias = lista(p.get('subcategorias'))
  if (subcategorias) f.subcategorias = subcategorias
  const grupo = escolher(p.get('grupo'), GRUPOS)
  if (grupo) f.grupo = grupo
  const escopo = escolher(p.get('escopo'), ['familiar', 'pessoal'] as const)
  if (escopo) f.escopo = escopo
  const membros = lista(p.get('membros'))
  if (membros) f.membros = membros
  if (p.get('dono')) f.dono = p.get('dono')!
  if (p.get('conta')) f.conta = p.get('conta')!
  if (p.get('cartao')) f.cartao = p.get('cartao')!
  const movimento = escolher(p.get('movimento'), MOVIMENTOS)
  if (movimento) f.movimento = movimento
  if (p.get('titulo')) f.titulo = p.get('titulo')!
  return f
}

/** Ponta de saída de uma aplicação: conta comum → conta de investimento */
function ehAplicacao(l: LancamentoResumo, ctx: ContextoResumo): boolean {
  if (!l.transferencia_id || l.tipo !== 'despesa') return false
  const pontas = ctx.contaDaTransferencia.get(l.transferencia_id)
  if (!pontas?.origem || !pontas.destino) return false
  return (
    ctx.tipoDaConta.get(pontas.destino) === 'investimento' &&
    ctx.tipoDaConta.get(pontas.origem) !== 'investimento'
  )
}

/** Grupo 50/30/20 de um lançamento que entra na regra 503020 */
function grupoDoLancamento(l: LancamentoResumo, ctx: ContextoResumo): GrupoResumo | null {
  if (l.transferencia_id) return ehAplicacao(l, ctx) ? 'investimento' : null
  if (l.tipo === 'receita') return null
  const g = l.subcategoria_id ? ctx.grupoDaSubcategoria.get(l.subcategoria_id) ?? null : null
  return (g as GrupoResumo | null) ?? 'sem'
}

function passaRegra(l: LancamentoResumo, f: FiltroResumo, ctx: ContextoResumo): boolean {
  if (f.regra === 'conta') return true
  if (l.neutro || l.fatura_cartao_id) return false
  if (f.regra === 'resultado') return !l.transferencia_id
  // 503020: das transferências, só a saída de uma aplicação conta (como Futuro)
  if (l.transferencia_id) return ehAplicacao(l, ctx)
  return true
}

export function entraNoResumo(l: LancamentoResumo, f: FiltroResumo, ctx: ContextoResumo): boolean {
  if (l.status !== 'pago' || l.data < f.de || l.data > f.ate) return false
  if (!passaRegra(l, f, ctx)) return false

  if (f.tipo && l.tipo !== f.tipo) return false
  if (f.categoria && (f.categoria === 'sem' ? l.categoria_id !== null : l.categoria_id !== f.categoria))
    return false
  if (
    f.subcategoria &&
    (f.subcategoria === 'sem' ? l.subcategoria_id !== null : l.subcategoria_id !== f.subcategoria)
  )
    return false
  if (f.categorias && !f.categorias.includes(l.categoria_id ?? SEM_CATEGORIA)) return false
  if (f.subcategorias && !f.subcategorias.includes(l.subcategoria_id ?? SEM_SUBCATEGORIA))
    return false
  if (f.dono && l.dono_id !== f.dono) return false
  if (f.escopo && l.escopo !== f.escopo) return false
  if (f.membros) {
    const quem = l.escopo === 'familiar' ? FAMILIAR : l.dono_id
    if (!f.membros.includes(quem)) return false
  }
  if (f.conta && l.conta_id !== f.conta) return false
  if (f.cartao && l.cartao_id !== f.cartao) return false

  if (f.grupo && grupoDoLancamento(l, ctx) !== f.grupo) return false

  if (f.movimento === 'aplicado' && !(l.transferencia_id && l.tipo === 'receita')) return false
  if (f.movimento === 'resgatado' && !(l.transferencia_id && l.tipo === 'despesa')) return false
  if (
    (f.movimento === 'rendimento' || f.movimento === 'aporte_empresa') &&
    l.movimento_investimento !== f.movimento
  )
    return false

  return true
}

/** Quantos meses de competência o período cobre (para a média por mês) */
export function mesesDoIntervalo(de: string, ate: string): number {
  const fim = chaveCompetencia(ate)
  let chave = chaveCompetencia(de)
  let n = 1
  while (chave < fim && n < 1200) {
    chave = deslocarMes(chave, 1)
    n++
  }
  return n
}

/** Para onde voltar depois de editar: só caminhos internos do app */
export function caminhoVoltarSeguro(v: string | null): string {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/transacoes'
}
