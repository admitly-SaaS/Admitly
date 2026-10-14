// lib/extracurriculares.js
//
// Camada de dados da aba /extracurriculares. CommonJS por contrato (mesmos
// testes carregam com createRequire). O layout segue lib/redacoes.js: funções
// recebem o client explicitamente — nada de singleton escondido.
//
// As descrições polidas ("listagem pronta") são cobrança do Common App:
// até 10 atividades, descrição de 150 caracteres com verbo forte no início.
// A IA preenche descricao_polida na rota /api/extracurriculares/descricao;
// aqui ficam só CRUD, validação e derivados de leitura.

export const TABELA = 'extracurriculares'

export const STATUS = ['em_curso', 'listagem_pronta', 'usada_em_redacao', 'enviada']

export const CATEGORIAS = [
  'academico', 'pesquisa', 'esporte', 'arte', 'comunidade', 'trabalho',
  'projeto_proprio', 'lideranca', 'outra',
]

export const RÓTULO_CATEGORIA = {
  academico: 'Acadêmico',
  pesquisa: 'Pesquisa',
  esporte: 'Esporte',
  arte: 'Arte',
  comunidade: 'Comunidade',
  trabalho: 'Trabalho',
  projeto_proprio: 'Projeto próprio',
  lideranca: 'Liderança',
  outra: 'Outra',
}

export const RÓTULO_STATUS = {
  em_curso: 'em curso',
  listagem_pronta: 'listagem pronta',
  usada_em_redacao: 'usada em redação',
  enviada: 'enviada',
}

const LIMITES = {
  nome: 80,
  papel: 80,
  descricao: 400,
  descricao_polida: 300,
}

function cortar(valor, limite) {
  return (valor ?? '').toString().trim().slice(0, limite)
}

// ---- CRUD ----------------------------------------------------------------

export async function criarAtividade(userId, dados, supabaseClient) {
  const d = dados || {}
  const linha = {
    user_id: userId,
    nome: cortar(d.nome, LIMITES.nome) || 'Atividade sem nome',
    papel: cortar(d.papel, LIMITES.papel),
    categoria: CATEGORIAS.includes(d.categoria) ? d.categoria : 'outra',
    horas_semana: d.horas_semana != null && d.horas_semana !== '' ? Number(d.horas_semana) : null,
    semanas_ano: d.semanas_ano != null && d.semanas_ano !== '' ? Number(d.semanas_ano) : null,
    descricao: cortar(d.descricao, LIMITES.descricao),
    descricao_polida: '',
    status: STATUS.includes(d.status) ? d.status : 'em_curso',
    inicio: cortar(d.inicio, 9),
    fim: cortar(d.fim, 9),
    ordem: Number.isFinite(d.ordem) ? d.ordem : 0,
  }
  const { data, error } = await supabaseClient.from(TABELA).insert(linha).select('id').single()
  return { error, data }
}

export async function listarAtividades(userId, supabaseClient) {
  const { data, error } = await supabaseClient
    .from(TABELA)
    .select('*')
    .eq('user_id', userId)
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) return { error, data: null }
  return { error: null, data: data || [] }
}

// Campos editáveis por update — user_id/created_at nunca passam daqui.
const CAMPOS_EDITAVEIS = ['nome', 'papel', 'categoria', 'horas_semana', 'semanas_ano', 'descricao', 'descricao_polida', 'status', 'inicio', 'fim', 'ordem']

export async function atualizarAtividade(id, campos, supabaseClient) {
  const molde = {}
  for (const k of CAMPOS_EDITAVEIS) {
    if (k in campos) molde[k] = campos[k]
  }
  if (Object.keys(molde).length === 0) return { error: null }

  for (const k of ['nome', 'papel', 'descricao', 'descricao_polida']) {
    if (k in molde) molde[k] = cortar(molde[k], LIMITES[k])
  }
  if ('categoria' in molde && !CATEGORIAS.includes(molde.categoria)) {
    return { error: { message: `categoria inválida: ${molde.categoria}` } }
  }
  if ('status' in molde && !STATUS.includes(molde.status)) {
    return { error: { message: `status inválido: ${molde.status}` } }
  }
  molde.updated_at = new Date().toISOString()

  const { error } = await supabaseClient.from(TABELA).update(molde).eq('id', id)
  return { error }
}

export async function removerAtividade(id, supabaseClient) {
  const { error } = await supabaseClient.from(TABELA).delete().eq('id', id)
  return { error }
}

// ---- derivados de leitura -------------------------------------------------

/**
 * O que a página mostra no contador do topo: total, prontas e em curso.
 */
export function contarAtividades(atividades) {
  const lista = atividades || []
  const porStatus = (s) => lista.filter((a) => a.status === s).length
  return {
    total: lista.length,
    em_curso: porStatus('em_curso'),
    listagem_pronta: porStatus('listagem_pronta'),
    usada_em_redacao: porStatus('usada_em_redacao'),
    enviada: porStatus('enviada'),
  }
}

/**
 * Resumo com as atividades numa linha — alimenta o campo atividades do
 * perfil sem mudar o contrato do chat/matching (que leem esse texto).
 * Formato: "nome (papel, Xh/sem), ..." — o mentor usa isso como contexto.
 */
export function resumoParaPerfil(atividades) {
  const lista = atividades || []
  if (lista.length === 0) return ''
  return lista
    .map((a) => {
      const parteHoras = a.horas_semana != null ? `, ${a.horas_semana}h/sem` : ''
      const papel = a.papel ? ` (${a.papel}${parteHoras})` : ''
      return `${a.nome}${papel}`
    })
    .join(', ')
}

/**
 * Indicador da página: as 10 vagas do Common App não são regra rígida para
 * todas as universidades, mas é a régua prática — deixo a página avisar
 * quando o aluno estoura.
 */
export function vagasComunsApp(atividades) {
  const prontas = (atividades || []).filter((a) => a.status !== 'em_curso').length
  return { usadas: prontas, restantes: Math.max(0, 10 - prontas) }
}
