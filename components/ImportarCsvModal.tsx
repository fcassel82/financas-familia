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
  onFechar,
  onConfirmar,
}: {
  colunas: string[]
  totalLinhas: number
  onFechar: () => void
  onConfirmar: (colData: string, colDescricao: string, colValor: string, modo: ModoValorCsv) => void
}) {
  const [colData, setColData] = useState('')
  const [colDescricao, setColDescricao] = useState('')
  const [colValor, setColValor] = useState('')
  const [modo, setModo] = useState<ModoValorCsv>('sinal')

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

        <Campo rotulo="Como interpretar o valor">
          <select
            value={modo}
            onChange={(e) => setModo(e.target.value as ModoValorCsv)}
            className={classeInput}
          >
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
            onClick={() => onConfirmar(colData, colDescricao, colValor, modo)}
          >
            Continuar
          </BotaoPrimario>
        </div>
      </div>
    </Modal>
  )
}
