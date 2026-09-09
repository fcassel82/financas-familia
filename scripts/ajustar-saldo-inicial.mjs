#!/usr/bin/env node
/**
 * Concilia o saldo das contas com o extrato real do banco.
 *
 * Uso:  node scripts/ajustar-saldo-inicial.mjs
 *
 * O app calcula o saldo como  saldo_inicial + soma dos lançamentos pagos.
 * Quando o histórico de uma conta foi importado a partir do meio da vida
 * dela (ex: só de janeiro/2026 em diante) e o saldo_inicial ficou em zero,
 * o que aparece na tela é o *movimento do período*, não o saldo — foi assim
 * que a tela inicial passou a mostrar −R$ 33 mil.
 *
 * Este script pergunta o saldo real de hoje de cada conta e resolve a conta
 * ao contrário:  saldo_inicial = saldo_real_de_hoje − movimento.
 *
 * Nada é gravado sem você confirmar no fim.
 */

import { lerEnvLocal, entrar, perguntar } from './_supabase.mjs'

const hojeISO = new Date().toLocaleDateString('sv-SE') // sv-SE já dá YYYY-MM-DD local

const moeda = (v) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const api = await entrar(lerEnvLocal())

const contas = await api.buscar('contas?select=id,nome,tipo,saldo_inicial,ativo&order=nome')
const lancamentos = await api.lerTabelaInteira('transacoes')

/**
 * Só lançamentos já pagos entram no saldo, e só até hoje: um lançamento pago
 * com data futura já está no movimento mas ainda não bateu no banco, então
 * incluí-lo desalinharia a conciliação em poucos dias.
 */
const pagosAteHoje = lancamentos.filter(
  (t) => t.status === 'pago' && t.conta_id && t.data <= hojeISO
)
const futurosPagos = lancamentos.filter(
  (t) => t.status === 'pago' && t.conta_id && t.data > hojeISO
)

const movimentoPorConta = {}
for (const t of pagosAteHoje) {
  const delta = t.tipo === 'receita' ? Number(t.valor) : -Number(t.valor)
  movimentoPorConta[t.conta_id] = (movimentoPorConta[t.conta_id] ?? 0) + delta
}

const linhas = contas
  .filter((c) => c.ativo)
  .map((c) => {
    const movimento = movimentoPorConta[c.id] ?? 0
    return {
      ...c,
      movimento,
      saldoExibido: Number(c.saldo_inicial) + movimento,
      quantidade: pagosAteHoje.filter((t) => t.conta_id === c.id).length,
    }
  })

console.log('\n─────────────────────────────────────────────────────────────────')
console.log(' SITUAÇÃO ATUAL (o que o app mostra hoje)')
console.log('─────────────────────────────────────────────────────────────────\n')

for (const l of linhas) {
  const suspeita = Number(l.saldo_inicial) === 0 && l.quantidade > 0
  console.log(
    `${suspeita ? '⚠️ ' : '   '}${l.nome.padEnd(28)} ${moeda(l.saldoExibido).padStart(15)}` +
      `   (inicial ${moeda(l.saldo_inicial)} + ${l.quantidade} lanç.)`
  )
}

const suspeitas = linhas.filter((l) => Number(l.saldo_inicial) === 0 && l.quantidade > 0)
console.log(
  `\n⚠️  = saldo inicial zerado apesar de ter lançamentos: ${suspeitas.length} conta(s).` +
    '\n     Nessas, o número acima é movimento acumulado, não saldo.'
)

if (futurosPagos.length > 0) {
  console.log(`\nAtenção: ${futurosPagos.length} lançamento(s) marcados como PAGOS com data futura:`)
  for (const t of futurosPagos) {
    console.log(`  ${t.data}  ${t.descricao} — ${moeda(t.valor)}`)
  }
  console.log('  Eles ficaram DE FORA desta conciliação (ainda não bateram no banco).')
  console.log('  Se ainda não aconteceram mesmo, o certo é deixá-los como "pendente".')
}

console.log('\n─────────────────────────────────────────────────────────────────')
console.log(' CONCILIAÇÃO')
console.log('─────────────────────────────────────────────────────────────────')
console.log('\nInforme o saldo REAL de hoje de cada conta (o que o banco mostra).')
console.log('Use vírgula ou ponto. Enter em branco pula a conta.\n')

const ajustes = []

for (const l of linhas) {
  const resposta = (
    await perguntar(`${l.nome} — hoje o banco mostra quanto? [pular] R$ `)
  ).trim()
  if (!resposta) continue

  const real = Number(resposta.replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(real)) {
    console.log('   valor não reconhecido, pulando.\n')
    continue
  }

  const novoInicial = real - l.movimento
  if (Math.abs(novoInicial - Number(l.saldo_inicial)) < 0.005) {
    console.log('   já está certo, nada a fazer.\n')
    continue
  }

  ajustes.push({ ...l, real, novoInicial })
  console.log(
    `   saldo inicial: ${moeda(l.saldo_inicial)} → ${moeda(novoInicial)}` +
      `   (${moeda(real)} real − ${moeda(l.movimento)} de movimento)\n`
  )
}

if (ajustes.length === 0) {
  console.log('\nNada a alterar.')
  process.exit(0)
}

console.log('\n─────────────────────────────────────────────────────────────────')
console.log(' RESUMO — nada foi gravado ainda')
console.log('─────────────────────────────────────────────────────────────────\n')
for (const a of ajustes) {
  console.log(
    `${a.nome.padEnd(28)} inicial ${moeda(a.saldo_inicial).padStart(14)} → ${moeda(a.novoInicial).padStart(14)}` +
      `   saldo passa a ${moeda(a.real)}`
  )
}

const confirmacao = await perguntar(`\nGravar ${ajustes.length} alteração(ões)? [s/N] `)
if (confirmacao.trim().toLowerCase() !== 's') {
  console.log('Cancelado, nada foi alterado.')
  process.exit(0)
}

for (const a of ajustes) {
  await api.atualizar('contas', a.id, { saldo_inicial: a.novoInicial })
  console.log(`  ✓ ${a.nome}`)
}

console.log('\nPronto. Recarregue a tela inicial para ver o saldo corrigido.')
