import { describe, expect, it } from 'vitest'
import type { ItemBanco, LancamentoApp } from './conciliacao'
import { liquidoSalario, montarLinhasSalario } from './salario'

function lanc(parcial: Partial<LancamentoApp>): LancamentoApp {
  return {
    id: 'l1',
    data: '2026-08-28',
    descricao: 'X',
    valor: 100,
    tipo: 'despesa',
    status: 'pago',
    conta_id: 'itau',
    cartao_id: null,
    parcela_total: null,
    nota_fiscal_id: null,
    transferencia_id: null,
    fatura_cartao_id: null,
    criado_em: '2026-08-28T23:41:14Z',
    categoria_id: null,
    subcategoria_id: null,
    neutro: false,
    ...parcial,
  }
}

const item: ItemBanco = {
  id: 'b1',
  data: '2026-09-30',
  descricao: 'Salário CEEE',
  valor: 6202.22,
  tipo: 'receita',
  pagamento_cartao: false,
  categoria_banco: null,
  parcela: null,
  parcelas: null,
  contaBanco: { tipo: 'BANK', conta_id: 'itau', cartao_id: null },
}

const FOLHA = new Set(['sal', 'desc'])
const agosto: LancamentoApp[] = [
  lanc({
    id: 'base',
    descricao: 'Salário Base',
    tipo: 'receita',
    valor: 8454.03,
    categoria_id: 'sal',
    subcategoria_id: 'sbase',
  }),
  lanc({
    id: 'peric',
    descricao: 'Periculosidade',
    tipo: 'receita',
    valor: 2536.21,
    categoria_id: 'sal',
    subcategoria_id: 'speric',
  }),
  lanc({
    id: 'anuenio',
    descricao: 'Anuênio',
    tipo: 'receita',
    valor: 1465.07,
    categoria_id: 'sal',
    subcategoria_id: 'sanu',
  }),
  lanc({
    id: 'irrf',
    descricao: 'IRRF',
    valor: 1951.34,
    categoria_id: 'desc',
    subcategoria_id: 'sirrf',
  }),
  lanc({
    id: 'inss',
    descricao: 'INSS',
    valor: 988.07,
    categoria_id: 'desc',
    subcategoria_id: 'sinss',
  }),
  lanc({
    id: 'odonto',
    descricao: 'Plano Odontológico',
    valor: 19.2,
    categoria_id: 'saude',
    subcategoria_id: 'sodonto',
  }),
  lanc({
    id: 'aux',
    descricao: 'Auxílio Refeição',
    valor: 10,
    categoria_id: 'desc',
    subcategoria_id: 'saux',
  }),
  lanc({
    id: 'convenio',
    descricao: 'Convênio Médico',
    valor: 366.89,
    categoria_id: 'saude',
    subcategoria_id: 'sconv',
  }),
  lanc({
    id: 'prev',
    descricao: 'Transferência: Itaú → EQTPREV',
    valor: 498.21,
    transferencia_id: 'tp',
  }),
  lanc({
    id: 'prev2',
    descricao: 'Transferência: Itaú → EQTPREV',
    tipo: 'receita',
    valor: 498.21,
    transferencia_id: 'tp',
    conta_id: 'eqtprev',
  }),
  lanc({
    id: 'adiant',
    descricao: 'Adiantamento Quinzenal',
    valor: 2536.21,
    categoria_id: 'desc',
    subcategoria_id: 'sadiant',
    neutro: true,
  }),
  // Compra no cartão no mesmo dia: não é do contracheque
  lanc({ id: 'cartao', valor: 50, conta_id: null, cartao_id: 'nu' }),
]

describe('montarLinhasSalario', () => {
  it('copia todas as linhas do último contracheque da conta, com a transferência e o destino', () => {
    const linhas = montarLinhasSalario(item, agosto, FOLHA)
    expect(linhas).toHaveLength(10)
    expect(linhas.every((l) => !l.id)).toBe(true)
    expect(linhas.find((l) => l.descricao.startsWith('Transferência'))).toMatchObject({
      tipo: 'despesa',
      valor: 498.21,
      contaDestino: 'eqtprev',
    })
    expect(liquidoSalario(linhas)).toBe(6085.39)
  })

  it('usa o contracheque mais recente com 2 ou mais linhas de folha', () => {
    const julho = lanc({
      id: 'j',
      data: '2026-07-30',
      tipo: 'receita',
      valor: 1,
      categoria_id: 'sal',
    })
    const julho2 = lanc({ id: 'j2', data: '2026-07-30', valor: 1, categoria_id: 'desc' })
    const linhas = montarLinhasSalario(item, [julho, julho2, ...agosto], FOLHA)
    expect(liquidoSalario(linhas)).toBe(6085.39)
  })

  it('previsão da mesma subcategoria assume a linha e leva o id', () => {
    const previsao = lanc({
      id: 'prevbase',
      data: '2026-09-30',
      status: 'pendente',
      tipo: 'receita',
      valor: 8000,
      categoria_id: 'sal',
      subcategoria_id: 'sbase',
    })
    const linhas = montarLinhasSalario(item, [...agosto, previsao], FOLHA)
    expect(linhas).toHaveLength(10)
    expect(linhas.find((l) => l.subcategoria_id === 'sbase')).toMatchObject({
      id: 'prevbase',
      valor: 8454.03,
    })
  })

  it('previsão longe da data não entra', () => {
    const previsao = lanc({
      id: 'nov',
      data: '2026-10-30',
      status: 'pendente',
      tipo: 'receita',
      valor: 8454.03,
      categoria_id: 'sal',
      subcategoria_id: 'sbase',
    })
    expect(
      montarLinhasSalario(item, [...agosto, previsao], FOLHA).some((l) => l.id === 'nov')
    ).toBe(false)
  })

  it('previsão sem par no contracheque entra com o próprio valor', () => {
    const extra = lanc({
      id: 'he',
      data: '2026-09-30',
      status: 'pendente',
      tipo: 'receita',
      valor: 300,
      categoria_id: 'sal',
      subcategoria_id: 'shoras',
    })
    const linhas = montarLinhasSalario(item, [...agosto, extra], FOLHA)
    expect(linhas).toHaveLength(11)
    expect(linhas.find((l) => l.id === 'he')?.valor).toBe(300)
  })

  it('o desconto do adiantamento recebe o valor recebido no mês', () => {
    const recebido = lanc({
      id: 'ad9',
      data: '2026-09-16',
      tipo: 'receita',
      valor: 2600,
      categoria_id: 'desc',
      subcategoria_id: 'sadiant',
      neutro: true,
    })
    const linhas = montarLinhasSalario(item, [...agosto, recebido], FOLHA)
    expect(linhas.find((l) => l.neutro && l.tipo === 'despesa')?.valor).toBe(2600)
  })

  it('sem contracheque anterior, devolve só as previsões', () => {
    const previsao = lanc({
      id: 'p',
      data: '2026-09-30',
      status: 'pendente',
      tipo: 'receita',
      valor: 8454.03,
      categoria_id: 'sal',
      subcategoria_id: 'sbase',
    })
    expect(montarLinhasSalario(item, [previsao], FOLHA).map((l) => l.id)).toEqual(['p'])
    expect(montarLinhasSalario(item, [], FOLHA)).toEqual([])
  })
})
