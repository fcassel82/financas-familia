/**
 * Busca diária no Meu Pluggy, disparada pelo próprio app: ao abrir qualquer tela
 * ou ao voltar para o app (o iPhone mantém o app aberto por dias), no máximo
 * uma vez por dia neste aparelho. Usa o login de quem está no app — só o
 * administrador chama (a rota recusa os outros).
 */
import { supabase } from './supabaseClient'

/** Avisado na janela quando chegam dados novos dos bancos */
export const EVENTO_BANCOS = 'bancos-sincronizados'
const CHAVE = 'pluggy_ultima_busca'

let emAndamento: Promise<void> | null = null

function jaBuscouHoje(): boolean {
  try {
    return localStorage.getItem(CHAVE) === new Date().toDateString()
  } catch {
    // Sem armazenamento local: busca de novo (a busca não duplica nada)
    return false
  }
}

/** Marca a busca de hoje (também usada pelo "Buscar agora") */
export function marcarBuscaDeHoje() {
  try {
    localStorage.setItem(CHAVE, new Date().toDateString())
  } catch {
    // idem acima
  }
}

export function sincronizarBancosHoje(): Promise<void> {
  if (emAndamento) return emAndamento
  if (jaBuscouHoje()) return Promise.resolve()
  emAndamento = (async () => {
    const { data: sessao } = await supabase.auth.getSession()
    const token = sessao.session?.access_token
    if (!token) return
    const resposta = await fetch('/api/pluggy/sincronizar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    // Falhou: tenta de novo na próxima abertura
    if (!resposta.ok) return
    marcarBuscaDeHoje()
    window.dispatchEvent(new Event(EVENTO_BANCOS))
  })()
    .catch(() => {
      // Sem conexão com os bancos agora: tenta de novo na próxima abertura
    })
    .finally(() => {
      emAndamento = null
    })
  return emAndamento
}
