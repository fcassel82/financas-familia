/**
 * Aparência do app: claro, escuro ou automático ("sistema", segue o celular
 * ou computador). A escolha fica salva no próprio aparelho — cada pessoa e
 * cada aparelho escolhe a sua.
 */

export type Tema = 'claro' | 'escuro' | 'sistema'

const CHAVE_TEMA = 'tema'

// Cor da barra do navegador no iPhone, igual ao fundo de cada tema
const COR_BARRA: Record<Exclude<Tema, 'sistema'>, string> = {
  claro: '#f4f6f8',
  escuro: '#0f1923',
}

/**
 * Roda no <head> antes da página aparecer, para não piscar o tema errado.
 * Precisa ser JavaScript puro e curto: não dá para importar nada aqui.
 */
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem("${CHAVE_TEMA}");if(t!=="claro"&&t!=="escuro")t="sistema";document.documentElement.setAttribute("data-tema",t);if(t!=="sistema"){var c=t==="escuro"?"${COR_BARRA.escuro}":"${COR_BARRA.claro}";var f=function(){document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",c)})};f();document.addEventListener("DOMContentLoaded",f)}}catch(e){}})()`

export function lerTema(): Tema {
  try {
    const t = localStorage.getItem(CHAVE_TEMA)
    return t === 'claro' || t === 'escuro' ? t : 'sistema'
  } catch {
    // Navegação privada ou armazenamento bloqueado: fica no automático
    return 'sistema'
  }
}

export function escolherTema(tema: Tema) {
  try {
    if (tema === 'sistema') localStorage.removeItem(CHAVE_TEMA)
    else localStorage.setItem(CHAVE_TEMA, tema)
  } catch {
    // Sem armazenamento a escolha vale só até fechar o app
  }
  document.documentElement.setAttribute('data-tema', tema)

  // As duas <meta name="theme-color"> têm media claro/escuro; no automático
  // cada uma volta à sua cor, senão as duas assumem a cor escolhida
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const daRegraEscura = (m.getAttribute('media') ?? '').includes('dark')
    const efetivo = tema === 'sistema' ? (daRegraEscura ? 'escuro' : 'claro') : tema
    m.setAttribute('content', COR_BARRA[efetivo])
  })
}
