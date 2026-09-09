#!/usr/bin/env node
/**
 * Diz se o cadastro público do Supabase está aberto ou fechado.
 *
 * Uso:  node scripts/checar-cadastro-aberto.mjs
 *
 * Lê a URL e a anon key de .env.local e consulta /auth/v1/settings, que é
 * a mesma resposta que o app recebe — ou seja, é o estado real, não o que
 * o painel parece dizer. Rode depois de mexer no toggle para confirmar.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

const env = {}
for (const linha of readFileSync(join(raiz, '.env.local'), 'utf8').split('\n')) {
  const [chave, ...resto] = linha.split('=')
  if (chave && resto.length) env[chave.trim()] = resto.join('=').trim()
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error('Erro: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY não encontrados em .env.local')
  process.exit(1)
}

const resposta = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } })
if (!resposta.ok) {
  console.error(`Erro ao consultar as configurações do Auth (HTTP ${resposta.status}).`)
  process.exit(1)
}

const s = await resposta.json()
const cadastroAberto = s.disable_signup === false
const confirmaEmail = s.mailer_autoconfirm === false

console.log('')
console.log(`  Cadastro público:  ${cadastroAberto ? 'ABERTO ⚠️' : 'FECHADO ✅'}`)
console.log(`  Confirma e-mail:   ${confirmaEmail ? 'sim' : 'NÃO ⚠️'}`)
console.log(`  Provider e-mail:   ${s.external?.email ? 'ligado' : 'DESLIGADO ⚠️ (ninguém consegue entrar)'}`)
console.log('')

if (cadastroAberto) {
  console.log('  Qualquer pessoa com a URL do projeto pode criar uma conta.')
  console.log('  Desligue "Allow new users to sign up" no painel:')
  console.log('  Authentication → Sign In / Providers → card "User Signups"')
  console.log('  (é um card separado, fora do card do provider Email)')
  console.log('')
  process.exit(1)
}

console.log('  Tudo certo — só quem você cadastrar manualmente consegue entrar.')
console.log('')
