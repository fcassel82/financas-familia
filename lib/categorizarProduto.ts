export type SugestaoCategoria = { categoria: string; subcategoria: string }

/**
 * Sugestão automática de categoria/subcategoria a partir do nome do produto,
 * como vem impresso no cupom fiscal (abreviado, em maiúsculas). É um chute
 * por palavra-chave — sempre pode errar num produto ambíguo — por isso o
 * usuário revisa e ajusta cada linha antes de salvar, nunca é aplicado sem
 * revisão.
 *
 * A ordem importa: a primeira regra que bater vence. Regras de "Mercado"
 * (limpeza/higiene) vêm antes das de "Alimentação" porque um produto de
 * limpeza com aroma cítrico (ex.: "LIMP ... LIMAO") não pode cair em Frutas
 * só porque a palavra "LIMAO" aparece nele.
 */
const REGRAS: { padrao: RegExp; categoria: string; subcategoria: string }[] = [
  // Pets
  { padrao: /\b(RACAO|PEDIGREE|WHISKAS|PETISCO)\b/, categoria: 'Pets', subcategoria: 'Ração e Petiscos' },

  // Mercado — produtos de limpeza, higiene e lavanderia
  {
    padrao: /\bSABAO\s*(EM\s*)?PO\b|\bAMACIANTE\b|\bTIRA\s*MANCHA/,
    categoria: 'Mercado',
    subcategoria: 'Produtos de lavanderia',
  },
  {
    padrao: /\bAROMATIZ|\bODORIZ|\bSACHE\s*AROMA/,
    categoria: 'Mercado',
    subcategoria: 'Aromatizante',
  },
  {
    padrao:
      /\bLIMP\b|\bAGUA\s*SANIT|\bDETERGENTE\b|\bDESINFETANTE\b|\bSAPONACEO\b|\bALVEJANTE\b|\bESPONJA\b|\bTOALHA\s*PAP|\bVASSOURA\b|\bRODO\b|\bSACO\s*(DE\s*)?LIXO\b|\bMULTIUSO\b/,
    categoria: 'Mercado',
    subcategoria: 'Produtos de limpeza',
  },
  {
    padrao:
      /\bSAB[TO]NETE\b|\bSABT\b|\bGEL\s*DENT\b|\bCREME\s*DENTAL\b|\bSHAMPOO\b|\bXAMPU\b|\bCONDICIONADOR\b|\bPAPEL\s*HIG|\bPAP\s*HIG\b|\bABSORVENTE\b|\bFRALDA\b|\bDESODORANTE\b|\bESCOVA\s*DENTAL\b|\bGUARDANAPO\b|\bGUARD\b|\bHASTE\s*FLEX/,
    categoria: 'Mercado',
    subcategoria: 'Produtos de Higiene',
  },

  // Compras/Cuidados
  {
    padrao: /\bTINT(URA)?\s*CR\b|\bESMALTE\b|\bMAQUIAGEM\b|\bPERFUME\b|\bCOLONIA\b|\bPROTETOR\s*SOLAR\b/,
    categoria: 'Compras/Cuidados',
    subcategoria: 'Cosméticos, Perfumaria e Maquiagem',
  },

  // Alimentação — carnes, aves e pescados
  {
    padrao:
      /\b(ACEM|COSTELA|PALETA|ALCATRA|PATINHO|MUSCULO|CUPIM|PICANHA|MAMINHA|FRALDINHA|BISTECA|LOMBO|PERNIL|LINGUICA|LING\b|SALSICHA|BOV|SUINA?|SUINO)\b/,
    categoria: 'Alimentação',
    subcategoria: 'Carnes',
  },
  {
    padrao: /\b(FGO|FRANGO|COXA|PEITO\s*FGO|COXAO|PESCOCO\s*FGO|FIGADO|MOELA|ASA\s*FGO|FILE\s*(DE\s*)?PEITO)\b/,
    categoria: 'Alimentação',
    subcategoria: 'Carnes',
  },
  {
    padrao: /\b(SARD(INHA)?|TILAPIA|ATUM|CAMARAO|POLV|BACALHAU|MERLUZA|PEIXE)\b/,
    categoria: 'Alimentação',
    subcategoria: 'Carnes',
  },

  // Alimentação — hortifrúti
  {
    padrao:
      /\b(MACA|LARANJA|BANANA|MAMAO|MANGA|ABACAXI|MELANCIA|MELAO|PERA|MORANGO|KIWI|ABACATE|TANGERINA|GOIABA)\b/,
    categoria: 'Alimentação',
    subcategoria: 'Frutas',
  },
  {
    padrao:
      /\b(ALFACE|CEBOLA|TOMATE|BATATA|CENOURA|REPOLHO|BROCOLIS|COUVE|PEPINO|PIMENTAO|CHUCHU|ABOBRINHA|BETERRABA|SELETA\s*LEG|LEGUMES)\b/,
    categoria: 'Alimentação',
    subcategoria: 'Verduras',
  },

  // Alimentação — laticínios, matinais, básicos
  {
    padrao: /\b(IOGURTE|YOGURT|LEITE\s*FERM|QUEI(JO)?\b|MUSSARELA|PRESUNTO|MORTADELA|MANTEIGA|REQUEIJAO|\bNATA\b)\b/,
    categoria: 'Alimentação',
    subcategoria: 'Laticínios / Frios',
  },
  {
    padrao: /\b(PAO\b|CAFE\b|ACHOCOLATADO|NESCAU|GELEIA|\bMEL\b|CEREAL\s*MATINAL|FILTRO\s*PAPEL|LEITE\s*PO|MARGARINA)\b/,
    categoria: 'Alimentação',
    subcategoria: 'Matinais',
  },
  {
    padrao: /\b(ARROZ|FEIJAO|MACARRAO|MASSA|POLENTA|LENTILHA)\b/,
    categoria: 'Alimentação',
    subcategoria: 'Refeição Básica',
  },
  {
    padrao:
      /\b(FARIN(HA)?|ACUCAR|OLEO|AZEITE|VINAGRE|MOLHO|EXT\s*TOM|EXTRATO\s*(DE\s*)?TOMATE|MAION(ESE)?|KETCHUP|MOSTARDA|TEMPERO|FAROFA|FERMENTO|OVOS?|LEITE\s*COND)\b/,
    categoria: 'Alimentação',
    subcategoria: 'Ingredientes / Culinária',
  },
  {
    padrao: /\b(REFRI|SUCO|AGUA\s*MIN|ISOTONICO|ENERGETICO)\b/,
    categoria: 'Alimentação',
    subcategoria: 'Suco / Água / Refri',
  },
  {
    padrao:
      /\b(BISC|CHOC|BOMBOM|WAFER|PIPOCA|BALA|CHICLETE|SALG|SORVETE|GELATINA|DOCE\s*DE\s*LEITE|BARRA\s*(NUTS|CEREAL))\b/,
    categoria: 'Alimentação',
    subcategoria: 'Bolachas e doces',
  },
]

/**
 * Recebe o nome do produto (como impresso no cupom) e devolve a categoria e
 * subcategoria sugeridas, ou null quando nenhuma regra bate — nesse caso a
 * linha fica "Sem categoria" para o usuário decidir.
 */
export function sugerirCategoria(descricaoProduto: string): SugestaoCategoria | null {
  const texto = descricaoProduto.toUpperCase()
  for (const regra of REGRAS) {
    if (regra.padrao.test(texto)) {
      return { categoria: regra.categoria, subcategoria: regra.subcategoria }
    }
  }
  return null
}
