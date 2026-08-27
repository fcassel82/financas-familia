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

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline/promises'

const raizProjeto = join(dirname(fileURLToPath(import.meta.url)), '..')

function lerEnvLocal() {
  const conteudo = readFileSync(join(raizProjeto, '.env.local'), 'utf8')
  const env = {}
  for (const linha of conteudo.split('\n')) {
    const [chave, ...resto] = linha.split('=')
    if (chave && resto.length) env[chave.trim()] = resto.join('=').trim()
  }
  return env
}

const env = lerEnvLocal()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error('Erro: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY não encontrados em .env.local')
  process.exit(1)
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
const email = await rl.question('E-mail: ')
const senha = await rl.question('Senha: ')
rl.close()

const respLogin = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: senha }),
})

if (!respLogin.ok) {
  console.error('Erro ao autenticar. Confira e-mail e senha.')
  process.exit(1)
}

const { access_token: token } = await respLogin.json()

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
]
const backup = { gerado_em: new Date().toISOString(), tabelas: {} }

for (const tabela of tabelas) {
  const resp = await fetch(`${url}/rest/v1/${tabela}?select=*`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    console.warn(`Aviso: não foi possível ler "${tabela}" (${resp.status}) — pulando.`)
    backup.tabelas[tabela] = null
    continue
  }
  const dados = await resp.json()
  backup.tabelas[tabela] = dados
  console.log(`${tabela}: ${dados.length} registros`)
}

const pastaBackup = join(homedir(), 'Documents', 'Finanças', 'backups')
mkdirSync(pastaBackup, { recursive: true })

const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const destino = join(pastaBackup, `backup-financas-${carimbo}.json`)
writeFileSync(destino, JSON.stringify(backup, null, 2), 'utf8')

console.log(`\nBackup salvo em:\n${destino}`)
