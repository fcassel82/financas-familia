export function parseValor(str: string): number {
  if (!str) return NaN
  let s = str.trim().replace(/[^\d,.-]/g, '')
  const temVirgula = s.includes(',')
  const temPonto = s.includes('.')
  if (temVirgula && temPonto) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (temVirgula) {
    s = s.replace(',', '.')
  }
  return parseFloat(s)
}

export function parseData(str: string): string {
  if (!str) return ''
  const s = str.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const partes = s.split(/[\/\-]/)
  if (partes.length === 3) {
    const [d, m, anoStr] = partes
    const a = anoStr.length === 2 ? '20' + anoStr : anoStr
    return `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return s
}
