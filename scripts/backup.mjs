#!/usr/bin/env node
/**
 * Backup dos dados do Supabase para um arquivo JSON local.
 *
 * Uso:  node scripts/backup.mjs
 *
 * Lê as credenciais de .env.local (mesmas do site) e pede login,
 * pois as políticas de RLS exigem um usuário autenticado.
 * O arquivo é salvo em ~/Documents/Finanças/backups/.
 */

import { writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { lerEnvLocal, entrar } from './_supabase.mjs'

const api = await entrar(lerEnvLocal())

/**
 * Todas as tabelas de `public`. Se você criar uma tabela nova, acrescente aqui
 * — nada avisa sozinho, e a falta passa despercebida até a hora de restaurar.
 */
const tabelas = [
  'perfis',
  'categorias',
  'subcategorias',
  'transacoes',
  'investimentos',
  'contas',
  'cartoes_credito',
  'fornecedores',
  'bens',
  'veiculos',
  'abastecimentos',
  'manutencoes',
  'trocas_gas',
  'imoveis',
  'dividas',
]

const backup = { gerado_em: new Date().toISOString(), tabelas: {} }
const falhas = []

for (const tabela of tabelas) {
  try {
    const dados = await api.lerTabelaInteira(tabela)
    backup.tabelas[tabela] = dados
    console.log(`${tabela}: ${dados.length} registros`)
  } catch (err) {
    console.warn(`Aviso: não foi possível ler "${tabela}" (${err.message}).`)
    backup.tabelas[tabela] = null
    falhas.push(tabela)
  }
}

backup.completo = falhas.length === 0
backup.tabelas_que_falharam = falhas

const pastaBackup = join(homedir(), 'Documents', 'Finanças', 'backups')
mkdirSync(pastaBackup, { recursive: true })

const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
// O sufixo no nome é de propósito: um backup furado não pode parecer bom na
// hora do aperto, quando ninguém vai abrir o JSON para conferir.
const sufixo = falhas.length > 0 ? '-INCOMPLETO' : ''
const destino = join(pastaBackup, `backup-financas-${carimbo}${sufixo}.json`)
writeFileSync(destino, JSON.stringify(backup, null, 2), 'utf8')

const total = Object.values(backup.tabelas).reduce((s, t) => s + (t?.length ?? 0), 0)
console.log(`\nBackup salvo em:\n${destino}`)
console.log(`${tabelas.length - falhas.length}/${tabelas.length} tabelas, ${total} registros no total.`)

if (falhas.length > 0) {
  console.error(`\nERRO: ${falhas.length} tabela(s) não entraram: ${falhas.join(', ')}`)
  console.error('Este backup está INCOMPLETO — não confie nele para restaurar.')
  process.exit(1)
}

console.log(
  '\nLembre-se: o backup contém apenas o que o usuário logado enxerga.' +
    '\nRode sempre com a conta admin para não salvar uma visão parcial.'
)
