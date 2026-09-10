/**
 * Peças compartilhadas pelos scripts de linha de comando: ler o .env.local,
 * pedir login e falar com a API do Supabase respeitando o teto de linhas.
 *
 * Não é um script executável — é importado por backup.mjs e
 * ajustar-saldo-inicial.mjs.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline/promises'

const raizProjeto = join(dirname(fileURLToPath(import.meta.url)), '..')

export function lerEnvLocal() {
  const conteudo = readFileSync(join(raizProjeto, '.env.local'), 'utf8')
  const env = {}
  for (const linha of conteudo.split('\n')) {
    const [chave, ...resto] = linha.split('=')
    if (chave && resto.length) env[chave.trim()] = resto.join('=').trim()
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    console.error('Erro: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY não encontrados em .env.local')
    process.exit(1)
  }
  return { url, anonKey }
}

export async function perguntar(rotulo) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const resposta = await rl.question(rotulo)
  rl.close()
  return resposta
}

/**
 * Pergunta a senha sem ecoar o que é digitado. O `readline` normal imprime
 * cada tecla, o que deixa a senha visível na tela e no scrollback do terminal.
 */
export async function perguntarSenha(rotulo) {
  process.stdout.write(rotulo)
  const tty = process.stdin.isTTY
  if (tty) process.stdin.setRawMode(true)

  return new Promise((resolve) => {
    let senha = ''
    function aoReceber(pedaco) {
      for (const caractere of pedaco.toString('utf8')) {
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

/** Pede e-mail e senha e devolve um cliente já autenticado. */
export async function entrar({ url, anonKey }) {
  const email = await perguntar('E-mail: ')
  const senha = await perguntarSenha('Senha (não aparece na tela): ')

  const resp = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  })
  if (!resp.ok) {
    console.error('Erro ao autenticar. Confira e-mail e senha.')
    process.exit(1)
  }

  const { access_token: token } = await resp.json()
  const cabecalhos = { apikey: anonKey, Authorization: `Bearer ${token}` }

  return {
    cabecalhos,

    /** GET simples, para consultas que cabem numa página. */
    async buscar(caminho) {
      const resp = await fetch(`${url}/rest/v1/${caminho}`, { headers: cabecalhos })
      if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${caminho}`)
      return resp.json()
    },

    /**
     * Lê uma tabela inteira. O PostgREST corta a resposta num teto (1.000 por
     * padrão), então percorremos em páginas — sem isso o retorno vem truncado
     * em silêncio, que é o pior jeito de perder dado.
     */
    async lerTabelaInteira(tabela, tamanhoPagina = 1000) {
      const linhas = []
      for (let inicio = 0; ; inicio += tamanhoPagina) {
        const resp = await fetch(`${url}/rest/v1/${tabela}?select=*&order=id`, {
          headers: {
            ...cabecalhos,
            Range: `${inicio}-${inicio + tamanhoPagina - 1}`,
            'Range-Unit': 'items',
          },
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const pagina = await resp.json()
        linhas.push(...pagina)
        if (pagina.length < tamanhoPagina) return linhas
      }
    },

    async inserir(tabela, registro) {
      const resp = await fetch(`${url}/rest/v1/${tabela}`, {
        method: 'POST',
        headers: { ...cabecalhos, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(registro),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`)
      return resp.json()
    },

    async atualizar(tabela, id, campos) {
      const resp = await fetch(`${url}/rest/v1/${tabela}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...cabecalhos, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(campos),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`)
      return resp.json()
    },
  }
}
