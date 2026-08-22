'use client'

import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabaseClient'

type Categoria = { id: string; nome: string; tipo: string }
type Subcategoria = { id: string; categoria_id: string; nome: string }

type LinhaImportada = {
  data: string
  descricao: string
  valor: number
  categoriaId: string
  subcategoriaId: string
  escopo: string
  incluir: boolean
}

function parseValor(str: string): number {
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

function parseData(str: string): string {
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

export default function ImportarPage() {
  const [etapa, setEtapa] = useState<'upload' | 'mapear' | 'revisar'>('upload')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [linhasBrutas, setLinhasBrutas] = useState<Record<string, string>[]>([])
  const [colunas, setColunas] = useState<string[]>([])
  const [colData, setColData] = useState('')
  const [colDescricao, setColDescricao] = useState('')
  const [colValor, setColValor] = useState('')
  const [bancoCartao, setBancoCartao] = useState('')
  const [tipoBatch, setTipoBatch] = useState('despesa')
  const [escopoBatch, setEscopoBatch] = useState('pessoal')
  const [linhas, setLinhas] = useState<LinhaImportada[]>([])
  const [categoriaEmMassa, setCategoriaEmMassa] = useState('')
  const [subcategoriaEmMassa, setSubcategoriaEmMassa] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    async function carregarCategorias() {
      const { data } = await supabase.from('categorias').select('id, nome, tipo').order('nome')
      if (data) setCategorias(data)
    }
    async function carregarSubcategorias() {
      const { data } = await supabase
        .from('subcategorias')
        .select('id, categoria_id, nome')
        .order('nome')
      if (data) setSubcategorias(data)
    }
    carregarCategorias()
    carregarSubcategorias()
  }, [])

  function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return

    Papa.parse<Record<string, string>>(arquivo, {
      header: true,
      skipEmptyLines: true,
      complete: (resultado) => {
        setLinhasBrutas(resultado.data)
        setColunas(resultado.meta.fields || [])
        setEtapa('mapear')
      },
    })
  }

  function processarMapeamento() {
    const processadas: LinhaImportada[] = linhasBrutas.map((linha) => ({
      data: parseData(linha[colData]),
      descricao: linha[colDescricao],
      valor: Math.abs(parseValor(linha[colValor])),
      categoriaId: '',
      subcategoriaId: '',
      escopo: escopoBatch,
      incluir: true,
    }))
    setLinhas(processadas)
    setEtapa('revisar')
  }

  function aplicarCategoriaEmMassa() {
    setLinhas((atual) =>
      atual.map((l) => ({
        ...l,
        categoriaId: categoriaEmMassa,
        subcategoriaId: subcategoriaEmMassa,
      }))
    )
  }

  function atualizarLinha(index: number, campo: keyof LinhaImportada, valor: string | boolean) {
    setLinhas((atual) =>
      atual.map((l, i) => {
        if (i !== index) return l
        const atualizada = { ...l, [campo]: valor }
        if (campo === 'categoriaId') atualizada.subcategoriaId = ''
        return atualizada
      })
    )
  }

  async function handleSalvar() {
    setSalvando(true)
    setMensagem('')

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    const linhasParaSalvar = linhas
      .filter((l) => l.incluir && l.categoriaId)
      .map((l) => ({
        data: l.data,
        descricao: l.descricao,
        categoria_id: l.categoriaId,
        subcategoria_id: l.subcategoriaId || null,
        valor: l.valor,
        tipo: tipoBatch,
        escopo: l.escopo,
        banco_cartao: bancoCartao || null,
        dono_id: userId,
        lancado_por: userId,
      }))

    if (linhasParaSalvar.length === 0) {
      setMensagem('Nenhuma linha marcada para importar (confira as categorias).')
      setSalvando(false)
      return
    }

    const { error } = await supabase.from('transacoes').insert(linhasParaSalvar)

    setSalvando(false)

    if (error) {
      setMensagem('Erro ao salvar: ' + error.message)
      return
    }

    setMensagem(`${linhasParaSalvar.length} lançamentos importados com sucesso!`)
    setEtapa('upload')
    setLinhas([])
    setLinhasBrutas([])
  }

  const categoriasFiltradas = categorias.filter((c) => c.tipo === tipoBatch)
  const subcategoriasEmMassaFiltradas = subcategorias.filter(
    (s) => s.categoria_id === categoriaEmMassa
  )

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-xl font-semibold text-gray-800">Importar Extrato (CSV)</h1>

        {etapa === 'upload' && (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <label className="mb-2 block text-sm text-gray-600">
              Selecione o arquivo CSV do extrato
            </label>
            <input type="file" accept=".csv" onChange={handleArquivo} />
          </div>
        )}

        {etapa === 'mapear' && (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <p className="mb-4 text-sm text-gray-600">
              Encontramos {linhasBrutas.length} linhas. Indique qual coluna do seu arquivo
              corresponde a cada campo:
            </p>

            <label className="mb-1 block text-sm text-gray-600">Coluna de Data</label>
            <select
              value={colData}
              onChange={(e) => setColData(e.target.value)}
              className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
            >
              <option value="">Selecione...</option>
              {colunas.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <label className="mb-1 block text-sm text-gray-600">Coluna de Descrição</label>
            <select
              value={colDescricao}
              onChange={(e) => setColDescricao(e.target.value)}
              className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
            >
              <option value="">Selecione...</option>
              {colunas.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <label className="mb-1 block text-sm text-gray-600">Coluna de Valor</label>
            <select
              value={colValor}
              onChange={(e) => setColValor(e.target.value)}
              className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
            >
              <option value="">Selecione...</option>
              {colunas.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <label className="mb-1 block text-sm text-gray-600">Banco / Cartão</label>
            <input
              type="text"
              value={bancoCartao}
              onChange={(e) => setBancoCartao(e.target.value)}
              placeholder="Ex: Itaú, Nubank"
              className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
            />

            <label className="mb-1 block text-sm text-gray-600">Tipo (todas as linhas)</label>
            <select
              value={tipoBatch}
              onChange={(e) => setTipoBatch(e.target.value)}
              className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
            >
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </select>

            <label className="mb-1 block text-sm text-gray-600">Escopo padrão</label>
            <select
              value={escopoBatch}
              onChange={(e) => setEscopoBatch(e.target.value)}
              className="mb-6 w-full rounded border border-gray-300 px-3 py-2"
            >
              <option value="pessoal">Pessoal (só eu vejo)</option>
              <option value="familiar">Familiar (todos veem)</option>
            </select>

            <button
              onClick={processarMapeamento}
              disabled={!colData || !colDescricao || !colValor}
              className="w-full rounded bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Continuar para revisão
            </button>
          </div>
        )}

        {etapa === 'revisar' && (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-sm text-gray-600">
                  Aplicar categoria a todas as linhas marcadas
                </label>
                <select
                  value={categoriaEmMassa}
                  onChange={(e) => {
                    setCategoriaEmMassa(e.target.value)
                    setSubcategoriaEmMassa('')
                  }}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                >
                  <option value="">Selecione...</option>
                  {categoriasFiltradas.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm text-gray-600">
                  Subcategoria (opcional)
                </label>
                <select
                  value={subcategoriaEmMassa}
                  onChange={(e) => setSubcategoriaEmMassa(e.target.value)}
                  disabled={!categoriaEmMassa}
                  className="w-full rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                >
                  <option value="">Selecione...</option>
                  {subcategoriasEmMassaFiltradas.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={aplicarCategoriaEmMassa}
                disabled={!categoriaEmMassa}
                className="rounded bg-gray-600 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
              >
                Aplicar a todas
              </button>
            </div>

            <div className="mb-4 max-h-[500px] overflow-y-auto rounded border border-gray-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Incluir</th>
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-left">Descrição</th>
                    <th className="p-2 text-left">Valor</th>
                    <th className="p-2 text-left">Categoria</th>
                    <th className="p-2 text-left">Subcategoria</th>
                    <th className="p-2 text-left">Escopo</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={l.incluir}
                          onChange={(e) => atualizarLinha(i, 'incluir', e.target.checked)}
                        />
                      </td>
                      <td className="p-2">{l.data}</td>
                      <td className="p-2">{l.descricao}</td>
                      <td className="p-2">R$ {l.valor.toFixed(2)}</td>
                      <td className="p-2">
                        <select
                          value={l.categoriaId}
                          onChange={(e) => atualizarLinha(i, 'categoriaId', e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1"
                        >
                          <option value="">Selecione...</option>
                          {categoriasFiltradas.map((c) => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <select
                          value={l.subcategoriaId}
                          onChange={(e) => atualizarLinha(i, 'subcategoriaId', e.target.value)}
                          disabled={!l.categoriaId}
                          className="rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100"
                        >
                          <option value="">Selecione...</option>
                          {subcategorias
                            .filter((s) => s.categoria_id === l.categoriaId)
                            .map((s) => (
                              <option key={s.id} value={s.id}>{s.nome}</option>
                            ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <select
                          value={l.escopo}
                          onChange={(e) => atualizarLinha(i, 'escopo', e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1"
                        >
                          <option value="pessoal">Pessoal</option>
                          <option value="familiar">Familiar</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {mensagem && (
              <p className={`mb-4 text-sm ${mensagem.startsWith('Erro') || mensagem.startsWith('Nenhuma') ? 'text-red-600' : 'text-green-600'}`}>
                {mensagem}
              </p>
            )}

            <button
              onClick={handleSalvar}
              disabled={salvando}
              className="w-full rounded bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : `Salvar ${linhas.filter((l) => l.incluir).length} lançamentos`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
