#!/usr/bin/env node
/**
 * Confere as compras parceladas do app contra os CSVs de fatura do C6.
 *
 * Uso:  node scripts/conferir-parcelas.mjs [pasta-das-faturas]
 *       (padrão: ~/Documents/Finanças/Banco C6/2026/Fatura)
 *
 * POR QUE ISTO EXISTE
 * A fatura imprime, em toda parcela, a DATA DA COMPRA ORIGINAL — a parcela
 * 9/12 de uma compra de 15/04/2025 aparece com "15/04/2025" mesmo caindo na
 * fatura de janeiro/2026. Até 07/09/2026 o importador gravava essa data, o
 * que empilhava todas as parcelas no mês da compra: o mês da compra ficava
 * inflado e os meses seguintes, vazios.
 *
 * O importador já foi corrigido (commit 7867d9c), mas o que entrou antes
 * disso continua errado no banco. Este script acha e conserta.
 *
 * A data correta de cada parcela é  data_da_compra + (numero - 1) meses,
 * que é a mesma regra de lib/parcelas.ts.
 *
 * Nada é gravado sem confirmação.
 */

import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { lerEnvLocal, entrar, perguntar } from './_supabase.mjs'

const PASTA_PADRAO = join(homedir(), 'Documents', 'Finanças', 'Banco C6', '2026', 'Fatura')
const pasta = process.argv[2] || PASTA_PADRAO

const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** "15/04/2025" → Date local (sem passar por fuso) */
function dataBrParaDate(br) {
  const [d, m, a] = br.trim().split('/').map(Number)
  return new Date(a, m - 1, d)
}

const paraISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Mesma regra de lib/formato.ts: 31/01 + 1 mês vira 28/02, não 03/03 */
function somarMeses(d, meses) {
  const alvo = new Date(d.getFullYear(), d.getMonth() + meses, 1)
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  return new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d.getDate(), ultimoDia))
}

// ---------------------------------------------------------------- faturas
let arquivos
try {
  arquivos = readdirSync(pasta).filter((f) => f.toLowerCase().endsWith('.csv')).sort()
} catch {
  console.error(`Não consegui ler a pasta:\n  ${pasta}\n\nPasse o caminho como argumento.`)
  process.exit(1)
}
if (arquivos.length === 0) {
  console.error(`Nenhum CSV encontrado em ${pasta}`)
  process.exit(1)
}

/** Uma compra parcelada, com todas as parcelas que apareceram nas faturas. */
const compras = new Map()

for (const arquivo of arquivos) {
  const linhas = readFileSync(join(pasta, arquivo), 'utf8').split('\n').filter((l) => l.trim())
  const cabecalho = linhas[0].replace(/^﻿/, '').split(';')
  const col = (nome) => cabecalho.findIndex((c) => c.trim() === nome)

  const iData = col('Data de Compra')
  const iDesc = col('Descrição')
  const iParc = col('Parcela')
  const iValor = col('Valor (em R$)')
  if ([iData, iDesc, iParc, iValor].some((i) => i < 0)) {
    console.warn(`  ${arquivo}: colunas inesperadas, pulando.`)
    continue
  }

  for (const linha of linhas.slice(1)) {
    const campos = linha.split(';')
    const bruto = (campos[iParc] ?? '').trim()
    if (!/^\d+\s*\/\s*\d+$/.test(bruto)) continue // "Única" e vazio não são parcelamento

    const [numero, total] = bruto.split('/').map((n) => Number(n.trim()))
    const descricao = campos[iDesc].trim()
    const valor = Math.round(Number(campos[iValor]) * 100) / 100
    const compra = dataBrParaDate(campos[iData])

    const chave = `${descricao}|${valor}|${paraISO(compra)}|${total}`
    if (!compras.has(chave)) compras.set(chave, { descricao, valor, compra, total, parcelas: new Map() })
    compras.get(chave).parcelas.set(numero, { fatura: arquivo, dataCerta: somarMeses(compra, numero - 1) })
  }
}

console.log(`\n${arquivos.length} fatura(s) lidas de ${pasta}`)
console.log(`${compras.size} compra(s) parcelada(s) encontrada(s).\n`)

// ---------------------------------------------------------------- banco
const api = await entrar(lerEnvLocal())
const transacoes = await api.lerTabelaInteira('transacoes')

const corrigir = []
const ausentes = []
let jaCertas = 0

for (const compra of compras.values()) {
  const candidatas = transacoes.filter(
    (t) => t.descricao === compra.descricao && Math.abs(Number(t.valor) - compra.valor) < 0.005
  )
  const usadas = new Set()

  for (const numero of [...compra.parcelas.keys()].sort((a, b) => a - b)) {
    const { dataCerta } = compra.parcelas.get(numero)
    const iso = paraISO(dataCerta)

    // Primeiro tenta casar pela data certa — assim rodar de novo não desfaz nada
    const casada = candidatas.find((t) => !usadas.has(t.id) && t.data === iso)
    if (casada) {
      usadas.add(casada.id)
      if (casada.parcela_numero === numero && casada.parcela_total === compra.total) {
        jaCertas++
      } else {
        corrigir.push({ linha: casada, compra, numero, iso, soParcela: true })
      }
      continue
    }

    const solta = candidatas.find((t) => !usadas.has(t.id))
    if (solta) {
      usadas.add(solta.id)
      corrigir.push({ linha: solta, compra, numero, iso, soParcela: false })
    } else {
      ausentes.push({ compra, numero, iso })
    }
  }
}

// ---------------------------------------------------------------- relatório
if (corrigir.length === 0 && ausentes.length === 0) {
  console.log(`Tudo certo: ${jaCertas} parcela(s) conferem com as faturas. Nada a fazer.`)
  process.exit(0)
}

if (corrigir.length > 0) {
  console.log('─'.repeat(96))
  console.log(' PARCELAS A CORRIGIR')
  console.log('─'.repeat(96))
  console.log(
    `${'DESCRIÇÃO'.padEnd(26)} ${'VALOR'.padStart(10)} ${'PARC'.padStart(6)}  ${'ESTÁ EM'.padEnd(12)} ${'VAI PARA'.padEnd(12)} O QUE MUDA`
  )
  for (const c of corrigir) {
    const muda = c.soParcela ? 'só a numeração' : 'data + numeração'
    console.log(
      `${c.compra.descricao.slice(0, 26).padEnd(26)} ${moeda(c.compra.valor).padStart(10)} ` +
        `${`${c.numero}/${c.compra.total}`.padStart(6)}  ${c.linha.data.padEnd(12)} ${c.iso.padEnd(12)} ${muda}`
    )
  }
}

if (ausentes.length > 0) {
  console.log('\n' + '─'.repeat(96))
  console.log(' PARCELAS QUE ESTÃO NA FATURA MAS NÃO NO APP')
  console.log('─'.repeat(96))
  for (const a of ausentes) {
    console.log(
      `${a.compra.descricao.slice(0, 26).padEnd(26)} ${moeda(a.compra.valor).padStart(10)} ` +
        `${`${a.numero}/${a.compra.total}`.padStart(6)}  → criar em ${a.iso}`
    )
  }
}

console.log('\n' + '─'.repeat(96))
console.log(
  `${jaCertas} já corretas · ${corrigir.length} a corrigir · ${ausentes.length} a criar`
)

const resposta = await perguntar('\nAplicar? [s/N] ')
if (resposta.trim().toLowerCase() !== 's') {
  console.log('Cancelado, nada foi alterado.')
  process.exit(0)
}

// ---------------------------------------------------------------- aplicar
for (const c of corrigir) {
  await api.atualizar('transacoes', c.linha.id, {
    data: c.iso,
    parcela_numero: c.numero,
    parcela_total: c.compra.total,
  })
  console.log(`  ✓ ${c.compra.descricao.slice(0, 30)} ${c.numero}/${c.compra.total} → ${c.iso}`)
}

for (const a of ausentes) {
  // Copia os atributos de uma parcela irmã, para a linha nova nascer com a
  // mesma categoria, dono e cartão das outras.
  const irma = transacoes.find(
    (t) => t.descricao === a.compra.descricao && Math.abs(Number(t.valor) - a.compra.valor) < 0.005
  )
  if (!irma) {
    console.warn(`  ! ${a.compra.descricao}: sem parcela irmã para copiar atributos, pulando.`)
    continue
  }
  const nova = {
    data: a.iso,
    descricao: a.compra.descricao,
    valor: a.compra.valor,
    tipo: irma.tipo,
    escopo: irma.escopo,
    status: 'pago',
    dono_id: irma.dono_id,
    categoria_id: irma.categoria_id,
    subcategoria_id: irma.subcategoria_id,
    conta_id: irma.conta_id,
    cartao_id: irma.cartao_id,
    parcela_numero: a.numero,
    parcela_total: a.compra.total,
  }
  await api.inserir('transacoes', nova)
  console.log(`  + ${a.compra.descricao.slice(0, 30)} ${a.numero}/${a.compra.total} em ${a.iso}`)
}

console.log('\nPronto. Rode de novo para confirmar que não sobrou nada.')
