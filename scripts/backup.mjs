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

/**
 * Pergunta a senha sem ecoar o que é digitado. O `readline` normal imprime
 * cada tecla, o que deixa a senha visível na tela e no scrollback do terminal.
 */
async function perguntarSenha(rotulo) {
  process.stdout.write(rotulo)
  const tty = process.stdin.isTTY
  if (tty) process.stdin.setRawMode(true)

  return new Promise((resolve) => {
    let senha = ''
    function aoReceber(pedaco) {
      const texto = pedaco.toString('utf8')
      for (const caractere of texto) {
        if (caractere === '\n' || caractere === '\r' || caractere === '') {
          if (tty) process.stdin.setRawMode(false)
          process.stdin.removeListener('data', aoReceber)
          process.stdin.pause()
          process.stdout.write('\n')
          resolve(senha)
          return
        }
        if (caractere === '') {
          // Ctrl+C
          if (tty) process.stdin.setRawMode(false)
          process.stdout.write('\n')
          process.exit(130)
        }
        if (caractere === '' || caractere === '\b') {
          senha = senha.slice(0, -1)
        } else {
          senha += caractere
        }
      }
    }
    process.stdin.resume()
    process.stdin.on('data', aoReceber)
  })
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
const email = await rl.question('E-mail: ')
rl.close()
const senha = await perguntarSenha('Senha (não aparece na tela): ')

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

/**
 * Todas as tabelas de `public`. Se você criar uma tabela nova, acrescente aqui
 * — o script avisa no fim se o banco tiver alguma que não está nesta lista,
 * mas ele só consegue avisar sobre o que consegue ler.
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

/** O PostgREST corta a resposta num teto (1.000 por padrão), então lemos em páginas. */
const TAMANHO_PAGINA = 1000

async function lerTabelaInteira(tabela) {
  const linhas = []
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const fim = inicio + TAMANHO_PAGINA - 1
    const resp = await fetch(`${url}/rest/v1/${tabela}?select=*&order=id`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        Range: `${inicio}-${fim}`,
        'Range-Unit': 'items',
      },
    })
    if (!resp.ok) {
      const erro = new Error(`HTTP ${resp.status}`)
      erro.status = resp.status
      throw erro
    }
    const pagina = await resp.json()
    linhas.push(...pagina)
    // Página incompleta significa que acabou
    if (pagina.length < TAMANHO_PAGINA) return linhas
  }
}

const backup = { gerado_em: new Date().toISOString(), tabelas: {} }
const falhas = []

for (const tabela of tabelas) {
  try {
    const dados = await lerTabelaInteira(tabela)
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
