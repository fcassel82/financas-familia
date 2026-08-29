'use client'

import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import readXlsxFile from 'read-excel-file/browser'
import { supabase } from '@/lib/supabaseClient'
import { dataBR, hojeISO, moeda, somarMeses } from '@/lib/formato'
import { parseData, parseValor } from '@/lib/parseExtrato'
import { decodificarOfx, parsearOfx, type LancamentoOfx } from '@/lib/parseOfx'
import { sugerirCategoria } from '@/lib/categorizarProduto'
import type { NotaFiscal } from '@/lib/parseNfce'

type Categoria = { id: string; nome: string; tipo: string }
type Subcategoria = { id: string; categoria_id: string; nome: string }
type Formato = 'csv' | 'excel' | 'pdf' | 'ofx' | 'nfce'
type MeioPagamento = 'dinheiro' | 'debito' | 'credito_vista' | 'credito_parcelado'
type Conta = { id: string; nome: string }
type Cartao = { id: string; nome: string }

const ROTULO_MEIO_PAGAMENTO: Record<MeioPagamento, string> = {
  dinheiro: 'Dinheiro',
  debito: 'Débito',
  credito_vista: 'Crédito à vista',
  credito_parcelado: 'Crédito parcelado',
}

type LinhaImportada = {
  data: string
  descricao: string
  valor: number
  tipo: string
  categoriaId: string
  subcategoriaId: string
  escopo: string
  incluir: boolean
}

/**
 * Divide o valor de um item em N parcelas mensais, com os centavos que
 * sobram da divisão indo para a última — mesma lógica de lib/lancamentos,
 * para que a soma das parcelas bata exatamente com o valor do item.
 */
function dividirEmParcelas(base: LinhaImportada, quantidade: number): LinhaImportada[] {
  const totalCentavos = Math.round(base.valor * 100)
  const porParcela = Math.floor(totalCentavos / quantidade)
  const sobra = totalCentavos - porParcela * quantidade

  return Array.from({ length: quantidade }, (_, i) => {
    const centavos = i === quantidade - 1 ? porParcela + sobra : porParcela
    return {
      ...base,
      data: somarMeses(base.data, i),
      descricao: `${base.descricao} (${i + 1}/${quantidade})`,
      valor: centavos / 100,
    }
  })
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
  const [linhasOfx, setLinhasOfx] = useState<LancamentoOfx[]>([])
  const [notaFiscal, setNotaFiscal] = useState<NotaFiscal | null>(null)
  const [processandoArquivo, setProcessandoArquivo] = useState(false)
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null)
  const [pdfPrecisaSenha, setPdfPrecisaSenha] = useState(false)
  const [senhaPdf, setSenhaPdf] = useState('')
  const [colData, setColData] = useState('')
  const [colDescricao, setColDescricao] = useState('')
  const [colValor, setColValor] = useState('')
  const [bancoCartao, setBancoCartao] = useState('')
  const [contas, setContas] = useState<Conta[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [meioPagamento, setMeioPagamento] = useState<MeioPagamento>('debito')
  const [contaId, setContaId] = useState('')
  const [cartaoId, setCartaoId] = useState('')
  const [parcelasNfce, setParcelasNfce] = useState('2')
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
    async function carregarContasECartoes() {
      const [{ data: cts }, { data: crts }] = await Promise.all([
        supabase.from('contas').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('cartoes_credito').select('id, nome').eq('ativo', true).order('nome'),
      ])
      if (cts) setContas(cts)
      if (crts) setCartoes(crts)
    }
    carregarCategorias()
    carregarSubcategorias()
    carregarContasECartoes()
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

    if (nome.endsWith('.ofx')) {
      setFormato('ofx')
      setProcessandoArquivo(true)
      try {
        const buffer = await arquivo.arrayBuffer()
        const detectadas = parsearOfx(decodificarOfx(buffer))
        if (detectadas.length === 0) {
          setMensagem('Nenhum lançamento encontrado neste OFX. Confira se o arquivo é um extrato.')
        } else {
          setLinhasOfx(detectadas)
          setEtapa('mapear')
        }
      } catch (err) {
        console.error('Falha ao ler OFX:', err)
        setMensagem('Não foi possível ler este arquivo OFX.')
      }
      setProcessandoArquivo(false)
      return
    }

    if (arquivo.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(nome)) {
      setFormato('nfce')
      await enviarNfce(arquivo)
      return
    }

    setMensagem(
      'Formato não suportado. Envie um arquivo CSV, Excel (.xlsx/.xls), PDF, OFX ou uma foto de nota fiscal.'
    )
  }

  async function enviarNfce(arquivo: File) {
    setProcessandoArquivo(true)
    setMensagem('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const corpo = new FormData()
      corpo.append('arquivo', arquivo)

      const resposta = await fetch('/api/importar-nfce', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: corpo,
      })
      const resultado = await resposta.json()

      if (!resposta.ok) {
        setMensagem(resultado.error || 'Não foi possível ler esta nota fiscal.')
      } else {
        setNotaFiscal(resultado.nota)
        if (resultado.nota.formaPagamento) setBancoCartao(resultado.nota.formaPagamento)
        setEtapa('mapear')
      }
    } catch (err) {
      console.error('Falha ao ler nota fiscal:', err)
      setMensagem('Não foi possível ler esta nota fiscal. Tente novamente.')
    }
    setProcessandoArquivo(false)
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

    if (formato === 'nfce') {
      // Nota fiscal só tem despesa; a categoria é um chute pelo nome do
      // produto, sempre revisável na tela seguinte antes de salvar
      const quantidadeParcelas =
        meioPagamento === 'credito_parcelado' ? Math.max(2, parseInt(parcelasNfce || '2', 10)) : 1

      processadas = (notaFiscal?.itens ?? []).flatMap((item) => {
        const sugestao = sugerirCategoria(item.descricao)
        const categoriaSugerida = sugestao
          ? categorias.find(
              (c) => c.tipo === 'despesa' && c.nome.toLowerCase() === sugestao.categoria.toLowerCase()
            )
          : undefined
        const subcategoriaSugerida =
          categoriaSugerida && sugestao
            ? subcategorias.find(
                (s) =>
                  s.categoria_id === categoriaSugerida.id &&
                  s.nome.toLowerCase() === sugestao.subcategoria.toLowerCase()
              )
            : undefined
        const base: LinhaImportada = {
          data: notaFiscal?.dataEmissao || hojeISO(),
          descricao: item.descricao,
          valor: item.valorTotal,
          tipo: 'despesa',
          categoriaId: categoriaSugerida?.id ?? '',
          subcategoriaId: subcategoriaSugerida?.id ?? '',
          escopo: escopoBatch,
          incluir: true,
        }
        return quantidadeParcelas > 1 ? dividirEmParcelas(base, quantidadeParcelas) : [base]
      })
    } else if (formato === 'ofx') {
      // O OFX traz receitas e despesas no mesmo arquivo: o sinal do valor decide
      processadas = linhasOfx.map((l) => ({
        data: l.data,
        descricao: l.descricao,
        valor: l.valor,
        tipo: l.tipo,
        categoriaId: '',
        subcategoriaId: '',
        escopo: escopoBatch,
        incluir: true,
      }))
    } else if (formato === 'pdf') {
      processadas = linhasPdf.map((l) => ({
        data: l.data,
        descricao: l.descricao,
        valor: l.valor,
        tipo: tipoBatch,
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
        tipo: tipoBatch,
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
        // Mudar o tipo invalida a categoria escolhida, que é de receita OU despesa
        if (campo === 'tipo') {
          atualizada.categoriaId = ''
          atualizada.subcategoriaId = ''
        }
        return atualizada
      })
    )
  }

  async function handleSalvar() {
    setSalvando(true)
    setMensagem('')

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    const ehNfce = formato === 'nfce'
    const contaParaSalvar = ehNfce && meioPagamento === 'debito' ? contaId || null : null
    const cartaoParaSalvar =
      ehNfce && (meioPagamento === 'credito_vista' || meioPagamento === 'credito_parcelado')
        ? cartaoId || null
        : null
    const bancoCartaoParaSalvar = ehNfce ? ROTULO_MEIO_PAGAMENTO[meioPagamento] : bancoCartao || null

    const linhasParaSalvar = linhas
      .filter((l) => l.incluir)
      .map((l) => ({
        data: l.data,
        descricao: l.descricao,
        categoria_id: l.categoriaId || null,
        subcategoria_id: l.subcategoriaId || null,
        valor: l.valor,
        tipo: l.tipo,
        escopo: l.escopo,
        banco_cartao: bancoCartaoParaSalvar,
        conta_id: contaParaSalvar,
        cartao_id: cartaoParaSalvar,
        dono_id: userId,
        lancado_por: userId,
      }))

    if (linhasParaSalvar.length === 0) {
      setMensagem('Nenhuma linha marcada para importar.')
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
    setLinhasOfx([])
    setNotaFiscal(null)
    setMeioPagamento('debito')
    setContaId('')
    setCartaoId('')
    setParcelasNfce('2')
  }

  const categoriasFiltradas = categorias.filter((c) => c.tipo === tipoBatch)
  const categoriasDoTipo = (tipoLinha: string) => categorias.filter((c) => c.tipo === tipoLinha)
  const subcategoriasEmMassaFiltradas = subcategorias.filter(
    (s) => s.categoria_id === categoriaEmMassa
  )

  const meioPagamentoValido =
    meioPagamento === 'dinheiro'
      ? true
      : meioPagamento === 'debito'
        ? !!contaId
        : !!cartaoId

  const podeContinuarMapeamento =
    formato === 'nfce'
      ? (notaFiscal?.itens.length ?? 0) > 0 && meioPagamentoValido
      : formato === 'ofx'
        ? linhasOfx.length > 0
        : formato === 'pdf'
          ? linhasPdf.length > 0
          : !!colData && !!colDescricao && !!colValor

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-xl font-semibold text-gray-800">Importar Extrato</h1>

        {etapa === 'upload' && (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <label className="mb-2 block text-sm text-gray-600">
              Selecione o arquivo do extrato (CSV, Excel, PDF, OFX) ou uma foto de nota fiscal
              (o site lê o QR Code)
            </label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.pdf,.ofx,image/*"
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
            {formato === 'nfce' ? (
              <div className="mb-4 text-sm text-gray-600">
                <p>
                  Nota de <strong>{notaFiscal?.loja ?? 'loja não identificada'}</strong>
                  {notaFiscal?.dataEmissao ? `, emitida em ${dataBR(notaFiscal.dataEmissao)}` : ''}.
                </p>
                <p className="mt-1">
                  {notaFiscal?.itens.length ?? 0} itens · Valor dos itens:{' '}
                  {moeda(notaFiscal?.valorTotal ?? 0)}
                  {notaFiscal?.desconto ? (
                    <>
                      {' '}
                      · Desconto de {moeda(notaFiscal.desconto)} (valor pago:{' '}
                      {moeda(notaFiscal.valorPago ?? 0)}) — os itens abaixo mantêm o valor de
                      tabela impresso na nota, sem desconto aplicado.
                    </>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Categoria e subcategoria já vêm sugeridas pelo nome do produto — confira e ajuste
                  o que precisar na próxima etapa.
                </p>
              </div>
            ) : formato === 'ofx' ? (
              <p className="mb-4 text-sm text-gray-600">
                Encontramos {linhasOfx.length} lançamentos neste OFX. O arquivo já indica o que é
                entrada e o que é saída, então não é preciso mapear colunas.
              </p>
            ) : formato === 'pdf' ? (
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

            {formato !== 'pdf' && formato !== 'ofx' && formato !== 'nfce' && (
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

            {formato === 'nfce' ? (
              <div className="mb-4">
                <label className="mb-1 block text-sm text-gray-600">Meio de pagamento</label>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {(Object.keys(ROTULO_MEIO_PAGAMENTO) as MeioPagamento[]).map((mp) => (
                    <button
                      key={mp}
                      type="button"
                      onClick={() => setMeioPagamento(mp)}
                      className={`rounded border px-3 py-2 text-sm font-medium ${
                        meioPagamento === mp
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {ROTULO_MEIO_PAGAMENTO[mp]}
                    </button>
                  ))}
                </div>

                {meioPagamento === 'debito' && (
                  <select
                    value={contaId}
                    onChange={(e) => setContaId(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  >
                    <option value="">Selecione a conta...</option>
                    {contas.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                )}

                {(meioPagamento === 'credito_vista' || meioPagamento === 'credito_parcelado') && (
                  <>
                    <select
                      value={cartaoId}
                      onChange={(e) => setCartaoId(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2"
                    >
                      <option value="">Selecione o cartão...</option>
                      {cartoes.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>

                    {meioPagamento === 'credito_parcelado' && (
                      <div className="mt-3">
                        <label className="mb-1 block text-sm text-gray-600">Número de parcelas</label>
                        <input
                          type="number"
                          min="2"
                          max="24"
                          value={parcelasNfce}
                          onChange={(e) => setParcelasNfce(e.target.value)}
                          className="w-full rounded border border-gray-300 px-3 py-2"
                        />
                        <p className="mt-1.5 text-xs text-gray-500">
                          Cada um dos {notaFiscal?.itens.length ?? 0} itens vira{' '}
                          {Math.max(2, parseInt(parcelasNfce || '2', 10))} lançamentos mensais — um
                          total de{' '}
                          {(notaFiscal?.itens.length ?? 0) *
                            Math.max(2, parseInt(parcelasNfce || '2', 10))}{' '}
                          lançamentos, um por mês, com o valor de cada item dividido.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                <label className="mb-1 block text-sm text-gray-600">Banco / Cartão</label>
                <input
                  type="text"
                  value={bancoCartao}
                  onChange={(e) => setBancoCartao(e.target.value)}
                  placeholder="Ex: Itaú, Nubank"
                  className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
                />
              </>
            )}

            {formato !== 'ofx' && formato !== 'nfce' && (
              <>
                <label className="mb-1 block text-sm text-gray-600">Tipo (todas as linhas)</label>
                <select
                  value={tipoBatch}
                  onChange={(e) => setTipoBatch(e.target.value)}
                  className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
                >
                  <option value="despesa">Despesa</option>
                  <option value="receita">Receita</option>
                </select>
              </>
            )}

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

            <div className="mb-4 max-h-[500px] overflow-auto rounded border border-gray-200">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="sticky top-0 bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Incluir</th>
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-left">Descrição</th>
                    <th className="p-2 text-left">Valor</th>
                    <th className="p-2 text-left">Tipo</th>
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
                          value={l.tipo}
                          onChange={(e) => atualizarLinha(i, 'tipo', e.target.value)}
                          className={`rounded border border-gray-300 px-2 py-1 font-medium ${
                            l.tipo === 'receita' ? 'text-receita' : 'text-despesa'
                          }`}
                        >
                          <option value="despesa">Despesa</option>
                          <option value="receita">Receita</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <select
                          value={l.categoriaId}
                          onChange={(e) => atualizarLinha(i, 'categoriaId', e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1"
                        >
                          <option value="">Sem categoria</option>
                          {categoriasDoTipo(l.tipo).map((c) => (
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
