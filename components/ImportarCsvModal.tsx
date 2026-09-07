'use client'

import { useState } from 'react'
import type { ModoValorCsv } from '@/lib/parseCsvExtrato'
import { BotaoPrimario, BotaoSecundario, Campo, Modal, classeInput } from './ui'

/**
 * Passo de mapeamento de colunas para importar um CSV de extrato/fatura,
 * reaproveitado em Extrato e Faturas. O componente pai deve montá-lo só
 * quando houver um CSV lido (`{csvBruto && <ImportarCsvModal ... />}`) —
 * assim cada importação começa com os campos em branco, sem precisar de
 * um efeito para resetar o formulário.
 */
export function ImportarCsvModal({
  colunas,
  totalLinhas,
  permiteParcela = false,
  onFechar,
  onConfirmar,
}: {
  colunas: string[]
  totalLinhas: number
  /** Mostra o mapeamento de coluna de parcela — só faz sentido em fatura de cartão */
  permiteParcela?: boolean
  onFechar: () => void
  onConfirmar: (
    colData: string,
    colDescricao: string,
    colValor: string,
    modo: ModoValorCsv,
    colParcela: string
  ) => void
}) {
  const [colData, setColData] = useState('')
  const [colDescricao, setColDescricao] = useState('')
  const [colValor, setColValor] = useState('')
  const [colParcela, setColParcela] = useState('')
  const [modo, setModo] = useState<ModoValorCsv>(permiteParcela ? 'fatura_cartao' : 'sinal')

  const podeContinuar = !!colData && !!colDescricao && !!colValor

  return (
    <Modal aberto titulo="Importar CSV" onFechar={onFechar}>
      <div className="space-y-4">
        <p className="text-sm text-texto-suave">
          {totalLinhas} linha{totalLinhas === 1 ? '' : 's'} encontrada{totalLinhas === 1 ? '' : 's'}.
          Indique qual coluna do arquivo corresponde a cada campo:
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Coluna de Data">
            <select value={colData} onChange={(e) => setColData(e.target.value)} className={classeInput}>
              <option value="">Selecione...</option>
              {colunas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Coluna de Descrição">
            <select
              value={colDescricao}
              onChange={(e) => setColDescricao(e.target.value)}
              className={classeInput}
            >
              <option value="">Selecione...</option>
              {colunas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Coluna de Valor">
            <select value={colValor} onChange={(e) => setColValor(e.target.value)} className={classeInput}>
              <option value="">Selecione...</option>
              {colunas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {permiteParcela && (
          <Campo rotulo="Coluna de Parcela (opcional)">
            <select
              value={colParcela}
              onChange={(e) => setColParcela(e.target.value)}
              className={classeInput}
            >
              <option value="">Nenhuma / compra sempre à vista</option>
              {colunas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-texto-suave">
              Se o arquivo trouxer algo como &quot;9/12&quot; por linha, use esta coluna: a data de
              cada parcela é corrigida a partir do número dela, em vez de repetir a data de compra
              original em toda fatura em que a parcela aparece — evita duplicar o lançamento.
            </p>
          </Campo>
        )}

        <Campo rotulo="Como interpretar o valor">
          <select
            value={modo}
            onChange={(e) => setModo(e.target.value as ModoValorCsv)}
            className={classeInput}
          >
            {permiteParcela && (
              <option value="fatura_cartao">
                Fatura de cartão (positivo = compra, negativo = estorno/crédito)
              </option>
            )}
            <option value="sinal">Pelo sinal (negativo = despesa, positivo = receita)</option>
            <option value="despesa">Todas as linhas são despesas</option>
            <option value="receita">Todas as linhas são receitas</option>
          </select>
        </Campo>

        <div className="flex justify-end gap-2 pt-2">
          <BotaoSecundario type="button" onClick={onFechar}>
            Cancelar
          </BotaoSecundario>
          <BotaoPrimario
            type="button"
            disabled={!podeContinuar}
            onClick={() => onConfirmar(colData, colDescricao, colValor, modo, colParcela)}
          >
            Continuar
          </BotaoPrimario>
        </div>
      </div>
    </Modal>
  )
}
