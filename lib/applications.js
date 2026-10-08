// "College Prep" (ex.: Prep Program da Fundação Estudar) não é candidatura a
// universidade — por isso o lookahead negativo no "college".
const UNIVERSITY_TYPE_PATTERN = /universidade|university|gradua|college(?!\s*prep)|undergraduate/i

export function isUniversityOpportunity(type) {
  return UNIVERSITY_TYPE_PATTERN.test(String(type || ''))
}

// Monta o details conforme o modelo da oportunidade.
// - university: campos de candidatura a universidade (grade do /aplicacoes)
// - program: campos de summer program, olimpíada etc. (GPA mínimo, custo, bolsa...)
function montarDetalhes(opp) {
  const isUniversity = isUniversityOpportunity(opp?.type)
  const details = { model: isUniversity ? 'university' : 'program' }

  if (isUniversity) {
    if (opp?.country) details.location = opp.country
    if (opp?.official_url) details.officialApplicationUrl = opp.official_url
    return details
  }

  if (opp?.type) details.programType = opp.type
  if (opp?.provider) details.provider = opp.provider
  if (opp?.country) details.location = opp.country
  if (opp?.location_type) details.locationType = opp.location_type
  if (opp?.program_cost != null) {
    details.cost = opp.currency ? `${opp.currency} ${opp.program_cost}` : String(opp.program_cost)
  }
  if (opp?.minimum_gpa != null) details.minimumGpa = String(opp.minimum_gpa)
  if (opp?.full_scholarship_available) details.scholarship = 'Bolsa integral disponível'
  else if (opp?.financial_aid_available) details.scholarship = 'Auxílio financeiro disponível'

  const requisitos = []
  if (opp?.requires_essay) requisitos.push('redação')
  if (opp?.requires_recommendation) requisitos.push('carta de recomendação')
  if (opp?.requires_interview) requisitos.push('entrevista')
  if (Array.isArray(opp?.required_tests) && opp.required_tests.length > 0) {
    requisitos.push(`testes (${opp.required_tests.join(', ')})`)
  } else if (opp?.requires_test) {
    requisitos.push('teste de proficiência')
  }
  if (requisitos.length > 0) details.requirements = requisitos.join(', ')

  if (opp?.official_url) details.officialUrl = opp.official_url
  if (opp?.last_verified) details.lastVerifiedAt = opp.last_verified

  return details
}

export async function createApplicationForUser(userId, opportunityId, opportunityData, supabaseClient) {
  const opp = opportunityData || {}
  const nome = opp.name ?? null

  // Evita duplicata: mesma universidade/programa já nas aplicações do aluno
  if (nome) {
    const { data: existente } = await supabaseClient
      .from('applications')
      .select('id')
      .eq('user_id', userId)
      .ilike('university', nome)
      .maybeSingle()

    if (existente) {
      return { error: null, data: existente, duplicate: true }
    }
  }

  const { data, error } = await supabaseClient
    .from('applications')
    .insert({
      user_id: userId,
      university: nome,
      status: 'pesquisando',
      deadline: opp.application_deadline ?? null,
      details: montarDetalhes(opp),
    })
    .select('id')
    .single()

  if (error) {
    return { error, data: null }
  }

  return { error: null, data }
}

export async function getApplicationsForUser(userId, supabaseClient) {
  const { data, error } = await supabaseClient
    .from("applications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return { error, data: null };
  }

  return { error: null, data };
}