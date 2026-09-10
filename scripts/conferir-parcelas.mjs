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
 * QUAL DATA USAR
 * A data correta de cada parcela é  data_da_compra + (numero - 1) meses,
 * a mesma regra de lib/parcelas.ts.
 *
 * Datar a parcela no VENCIMENTO da fatura parece mais natural ("foi aí que
 * eu paguei"), mas quebra a tela /faturas: ela descobre a que fatura um
 * lançamento pertence chamando competenciaDaCompra(data, ...), e como o C6
 * fecha dia 4 e vence dia 10, uma data no dia 10 cai depois do fechamento e
 * é jogada para a fatura seguinte — todas as parcelas apareceriam um mês
 * adiante. Quem responde "em que fatura isto foi cobrado" é o campo
 * `fatura_competencia`, que este script preenche.
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

    // "Fatura_2026-01-10.csv" → competência "2026-01-01" (mês de vencimento)
    const venc = arquivo.match(/(\d{4})-(\d{2})-(\d{2})/)
    const competencia = venc ? `${venc[1]}-${venc[2]}-01` : null

    const chave = `${descricao}|${valor}|${paraISO(compra)}|${total}`
    if (!compras.has(chave)) compras.set(chave, { descricao, valor, compra, total, parcelas: new Map() })
    compras.get(chave).parcelas.set(numero, {
      fatura: arquivo,
      competencia,
      dataCerta: somarMeses(compra, numero - 1),
    })
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

/**
 * Casa por VALOR, não por descrição. A descrição da fatura é um código de
 * maquininha ("MERCADOLIVRE*MERCADOL") e costuma ser renomeada depois para
 * algo legível ("PAI Placa maquina") — casar por descrição faria o script
 * reportar como ausente tudo o que foi renomeado, e criar duplicatas.
 */
for (const compra of compras.values()) {
  const candidatas = transacoes.filter((t) => Math.abs(Number(t.valor) - compra.valor) < 0.005)
  const usadas = new Set()

  for (const numero of [...compra.parcelas.keys()].sort((a, b) => a - b)) {
    const { dataCerta, competencia, fatura } = compra.parcelas.get(numero)
    const iso = paraISO(dataCerta)

    // Primeiro tenta casar pela data certa — assim rodar de novo não desfaz nada
    const casada = candidatas.find((t) => !usadas.has(t.id) && t.data === iso)
    if (casada) {
      usadas.add(casada.id)
      const numeracaoOk = casada.parcela_numero === numero && casada.parcela_total === compra.total
      const competenciaOk = casada.fatura_competencia === competencia
      if (numeracaoOk && competenciaOk) jaCertas++
      else corrigir.push({ linha: casada, compra, numero, iso, competencia, fatura, soParcela: true })
      continue
    }

    // Sem data exata: aceita só quem estiver perto da data certa (a parcela
    // errada costuma estar na data da compra, até ~2 anos antes). Sem essa
    // janela, um valor repetido de outro mês seria "corrigido" por engano.
    const limite = 760 * 24 * 60 * 60 * 1000
    const solta = candidatas.find(
      (t) => !usadas.has(t.id) && Math.abs(new Date(t.data) - dataCerta) <= limite
    )
    if (solta) {
      usadas.add(solta.id)
      corrigir.push({ linha: solta, compra, numero, iso, competencia, fatura, soParcela: false })
    } else {
      ausentes.push({ compra, numero, iso, competencia, fatura })
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
    const muda = c.soParcela ? 'numeração/competência' : 'data + numeração + competência'
    console.log(
      `${c.compra.descricao.slice(0, 26).padEnd(26)} ${moeda(c.compra.valor).padStart(10)} ` +
        `${`${c.numero}/${c.compra.total}`.padStart(6)}  ${c.linha.data.padEnd(12)} ${c.iso.padEnd(12)} ${muda}`
    )
  }
  console.log('\nA competência (em que fatura foi cobrado) vai junto, no campo fatura_competencia.')
}

if (ausentes.length > 0) {
  console.log('\n' + '─'.repeat(96))
  console.log(' PARCELAS QUE ESTÃO NA FATURA MAS NÃO NO APP')
  console.log('─'.repeat(96))
  const porFatura = new Map()
  for (const a of ausentes) {
    porFatura.set(a.fatura, (porFatura.get(a.fatura) ?? 0) + 1)
    console.log(
      `${a.compra.descricao.slice(0, 26).padEnd(26)} ${moeda(a.compra.valor).padStart(10)} ` +
        `${`${a.numero}/${a.compra.total}`.padStart(6)}  → criar em ${a.iso}   (${a.fatura})`
    )
  }
  console.log(
    '\nSe TODAS as parcelas ausentes vierem da mesma fatura, provavelmente aquela fatura\n' +
      'inteira ainda não foi importada — e aí é melhor importá-la por /faturas, que traz\n' +
      'também as compras não parceladas, do que criar só estas linhas aqui.'
  )
  for (const [fatura, quantas] of porFatura) {
    console.log(`  ${fatura}: ${quantas} parcela(s) ausente(s)`)
  }
}

console.log('\n' + '─'.repeat(96))
console.log(
  `${jaCertas} já corretas · ${corrigir.length} a corrigir · ${ausentes.length} a criar`
)

const resposta = await perguntar('\nAplicar as correções? [s/N] ')
if (resposta.trim().toLowerCase() !== 's') {
  console.log('Cancelado, nada foi alterado.')
  process.exit(0)
}

let criarAusentes = false
if (ausentes.length > 0) {
  const r = await perguntar(
    `Criar também as ${ausentes.length} parcela(s) ausente(s)? ` +
      'Diga não se preferir importar a fatura inteira por /faturas. [s/N] '
  )
  criarAusentes = r.trim().toLowerCase() === 's'
}

// ---------------------------------------------------------------- aplicar
for (const c of corrigir) {
  await api.atualizar('transacoes', c.linha.id, {
    data: c.iso,
    parcela_numero: c.numero,
    parcela_total: c.compra.total,
    fatura_competencia: c.competencia,
  })
  console.log(`  ✓ ${c.compra.descricao.slice(0, 30)} ${c.numero}/${c.compra.total} → ${c.iso}`)
}

for (const a of criarAusentes ? ausentes : []) {
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
    fatura_competencia: a.competencia,
  }
  await api.inserir('transacoes', nova)
  console.log(`  + ${a.compra.descricao.slice(0, 30)} ${a.numero}/${a.compra.total} em ${a.iso}`)
}

console.log('\nPronto. Rode de novo para confirmar que não sobrou nada.')
