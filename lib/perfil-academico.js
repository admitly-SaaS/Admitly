// lib/perfil-academico.js
//
// Conversão única do perfil_academico (pt-BR, salvo no user_metadata do
// Supabase) para o formato que a engine de compatibilidade (lib/matching.js)
// lê. Era duplicada em app/api/chat/route.js e em app/oportunidades/page.js;
// centralizada aqui para que qualquer tela que calcule matches use a MESMA
// tradução — se um dia um ano escolar novo entrar no perfil, é só neste mapa.
//
// Pure functions, sem dependência: importável por rota de API e por página
// do cliente (o matching em si é CommonJS; este arquivo tanto faz lembrar).

export function converterAnoEscolar(ano) {
  const mapa = {
    '8º ano do ensino fundamental': '8th',
    '9º ano do ensino fundamental': '9th',
    '1º ano do ensino médio': '9th',
    '2º ano do ensino médio': '10th',
    '3º ano do ensino médio': '11th',
    'já concluí o ensino médio': '12th',
  }
  return mapa[ano] || null
}

export function adaptarPerfil(meta) {
  if (!meta) return null
  return {
    school_year: converterAnoEscolar(meta.anoEscolar),
    area: meta.areaInteresse ?? null,
    budget: meta.orcamento ?? null,
    country_preference: meta.paisPreferencia ?? null,
    goals: meta.objetivo ?? null,
  }
}
