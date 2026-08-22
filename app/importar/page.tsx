'use client'

import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import readXlsxFile from 'read-excel-file/browser'
import { supabase } from '@/lib/supabaseClient'
import { parseData, parseValor } from '@/lib/parseExtrato'

type Categoria = { id: string; nome: string; tipo: string }
type Subcategoria = { id: string; categoria_id: string; nome: string }
type Formato = 'csv' | 'excel' | 'pdf'

type LinhaImportada = {
  data: string
  descricao: string
  valor: number
  categoriaId: string
  subcategoriaId: string
  escopo: string
  incluir: boolean
}

function celulaParaTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (valor instanceof Date) {
    const d = String(valor.getDate()).padStart(2, '0')
    const m = String(valor.getMonth() + 1).padStart(2, '0')
    const a = valor.getFullYear()
    return `${d}/${m}/${a}`
  }
  return String(valor)
}

export default function ImportarPage() {
  const [etapa, setEtapa] = useState<'upload' | 'mapear' | 'revisar'>('upload')
  const [formato, setFormato] = useState<Formato>('csv')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [linhasBrutas, setLinhasBrutas] = useState<Record<string, string>[]>([])
  const [colunas, setColunas] = useState<string[]>([])
  const [linhasPdf, setLinhasPdf] = useState<{ data: string; descricao: string; valor: number }[]>([])
  const [processandoArquivo, setProcessandoArquivo] = useState(false)
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null)
  const [pdfPrecisaSenha, setPdfPrecisaSenha] = useState(false)
  const [senhaPdf, setSenhaPdf] = useState('')
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

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    setMensagem('')
    const nome = arquivo.name.toLowerCase()

    if (nome.endsWith('.csv')) {
      setFormato('csv')
      Papa.parse<Record<string, string>>(arquivo, {
        header: true,
        skipEmptyLines: true,
        complete: (resultado) => {
          setLinhasBrutas(resultado.data)
          setColunas(resultado.meta.fields || [])
          setEtapa('mapear')
        },
      })
      return
    }

    if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
      setFormato('excel')
      setProcessandoArquivo(true)
      try {
        const abas = await readXlsxFile(arquivo)
        const [cabecalho, ...resto] = abas[0]?.data ?? []
        const headers = (cabecalho || []).map((h) => celulaParaTexto(h))
        const processadas = resto.map((linha) => {
          const obj: Record<string, string> = {}
          headers.forEach((h, i) => {
            obj[h] = celulaParaTexto(linha[i])
          })
          return obj
        })
        setLinhasBrutas(processadas)
        setColunas(headers)
        setEtapa('mapear')
      } catch (err) {
        console.error('Falha ao ler Excel:', err)
        setMensagem('Não foi possível ler este arquivo Excel. Confira se o formato está correto.')
      }
      setProcessandoArquivo(false)
      return
    }

    if (nome.endsWith('.pdf')) {
      setFormato('pdf')
      setArquivoPdf(arquivo)
      setPdfPrecisaSenha(false)
      setSenhaPdf('')
      await enviarPdf(arquivo, '')
      return
    }

    setMensagem('Formato não suportado. Envie um arquivo CSV, Excel (.xlsx/.xls) ou PDF.')
  }

  async function enviarPdf(arquivo: File, senha: string) {
    setProcessandoArquivo(true)
    setMensagem('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const corpo = new FormData()
      corpo.append('arquivo', arquivo)
      if (senha) corpo.append('senha', senha)

      const resposta = await fetch('/api/importar-pdf', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: corpo,
      })
      const resultado = await resposta.json()

      if (!resposta.ok) {
        setPdfPrecisaSenha(!!resultado.precisaSenha)
        setMensagem(resultado.error || 'Não foi possível ler este PDF.')
      } else {
        setPdfPrecisaSenha(false)
        setLinhasPdf(resultado.transacoes)
        setEtapa('mapear')
      }
    } catch (err) {
      console.error('Falha ao ler PDF:', err)
      setMensagem('Não foi possível ler este PDF. Tente novamente.')
    }
    setProcessandoArquivo(false)
  }

  async function tentarSenhaPdf() {
    if (!arquivoPdf) return
    await enviarPdf(arquivoPdf, senhaPdf)
  }

  function processarMapeamento() {
    let processadas: LinhaImportada[]

    if (formato === 'pdf') {
      processadas = linhasPdf.map((l) => ({
        data: l.data,
        descricao: l.descricao,
        valor: l.valor,
        categoriaId: '',
        subcategoriaId: '',
        escopo: escopoBatch,
        incluir: true,
      }))
    } else {
      processadas = linhasBrutas.map((linha) => ({
        data: parseData(linha[colData]),
        descricao: linha[colDescricao],
        valor: Math.abs(parseValor(linha[colValor])),
        categoriaId: '',
        subcategoriaId: '',
        escopo: escopoBatch,
        incluir: true,
      }))
    }

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

  function atualizarLinha(
    index: number,
    campo: keyof LinhaImportada,
    valor: string | boolean | number
  ) {
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
    setLinhasPdf([])
  }

  const categoriasFiltradas = categorias.filter((c) => c.tipo === tipoBatch)
  const subcategoriasEmMassaFiltradas = subcategorias.filter(
    (s) => s.categoria_id === categoriaEmMassa
  )

  const podeContinuarMapeamento =
    formato === 'pdf'
      ? linhasPdf.length > 0
      : !!colData && !!colDescricao && !!colValor

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-xl font-semibold text-gray-800">Importar Extrato</h1>

        {etapa === 'upload' && (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <label className="mb-2 block text-sm text-gray-600">
              Selecione o arquivo do extrato (CSV, Excel ou PDF)
            </label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.pdf"
              onChange={handleArquivo}
              disabled={processandoArquivo}
            />
            {processandoArquivo && (
              <p className="mt-3 text-sm text-gray-500">Lendo arquivo...</p>
            )}
            {mensagem && <p className="mt-3 text-sm text-red-600">{mensagem}</p>}

            {pdfPrecisaSenha && (
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-sm text-gray-600">Senha do PDF</label>
                  <input
                    type="password"
                    value={senhaPdf}
                    onChange={(e) => setSenhaPdf(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  />
                </div>
                <button
                  onClick={tentarSenhaPdf}
                  disabled={!senhaPdf || processandoArquivo}
                  className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Tentar
                </button>
              </div>
            )}
          </div>
        )}

        {etapa === 'mapear' && (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            {formato === 'pdf' ? (
              <p className="mb-4 text-sm text-gray-600">
                Detectamos {linhasPdf.length} possíveis lançamentos neste PDF. A leitura de PDF é
                aproximada — revise com atenção os valores e descrições na próxima etapa antes de
                salvar.
              </p>
            ) : (
              <p className="mb-4 text-sm text-gray-600">
                Encontramos {linhasBrutas.length} linhas. Indique qual coluna do seu arquivo
                corresponde a cada campo:
              </p>
            )}

            {formato !== 'pdf' && (
              <>
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
              </>
            )}

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
              disabled={!podeContinuarMapeamento}
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
                      <td className="p-2">
                        <input
                          type="date"
                          value={l.data}
                          onChange={(e) => atualizarLinha(i, 'data', e.target.value)}
                          className="w-32 rounded border border-gray-300 px-2 py-1"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={l.descricao}
                          onChange={(e) => atualizarLinha(i, 'descricao', e.target.value)}
                          className="w-40 rounded border border-gray-300 px-2 py-1"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          value={l.valor}
                          onChange={(e) =>
                            atualizarLinha(i, 'valor', parseFloat(e.target.value) || 0)
                          }
                          className="w-24 rounded border border-gray-300 px-2 py-1"
                        />
                      </td>
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
